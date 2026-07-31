/**
 * Shared QA session: a browser logged into the target tenant, with writes
 * denied by default.
 *
 * WHY THIS EXISTS
 *
 * A QA script's job is to observe. But these scripts drive a real logged-in
 * session against a real tenant, so any missed interception is a live write.
 * That happened once: an upload probe meant to be intercepted reached the
 * server because the route pattern did not account for a query string, and two
 * real files landed in the demo tenant. The pattern was fixed and the script
 * now cleans up after itself — but detect-and-undo is not containment. It is
 * the same failure with a shorter tail, and it only works for writes whose
 * effects a script can see and reverse. A wrongly-invited team member or a
 * changed billing plan is neither.
 *
 * So: writes fail closed. A catch-all route handler aborts every non-idempotent
 * request that no one explicitly allowed, and every abort is recorded and
 * reported as a failed check. A script that forgets to stub something does not
 * write; it fails.
 *
 * TWO FACTS THIS DESIGN RESTS ON (both verified against the pinned Playwright,
 * not assumed — re-check them if the version moves):
 *
 *   1. Route handlers are matched in REVERSE registration order. The guard is
 *      installed first, so any pattern a script registers later takes
 *      precedence, and `unroute` of that pattern falls back to the guard rather
 *      than to the network.
 *   2. `page.request` / `context.request` do NOT pass through route handlers.
 *      An APIRequestContext call is a real request no matter what is routed.
 *      That is a hole in the guard, so this harness closes it separately by
 *      wrapping those methods (see permitWrite).
 *
 * A GET is treated as safe. If a read-only endpoint in this app is ever exposed
 * over POST, it must be allowed explicitly by name — the point of the default
 * is that safety is declared, not inferred.
 *
 * THREE WAYS TO DECLARE A WRITE
 *
 *   stubWrite(pattern, handler)      intercepted, answered locally, counted
 *   expectBlocked(pattern, reason)   deliberately denied; the UI must cope
 *   permitWrite(pattern, reason, fn) a real write, scoped to one callback
 *
 * Anything else aimed at the app's own origin fails the run. Writes to OTHER
 * origins (analytics, wallet SDK telemetry) are aborted too, but they cannot
 * touch the tenant, so they are reported as a note rather than a failure —
 * a guard that cries wolf on every run is a guard someone turns off.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAFE_REQUEST_METHODS = ["get", "head"];
const WRITE_METHODS = ["post", "put", "patch", "delete", "fetch"];

export async function createQaSession({
  viewport = { width: 1440, height: 1000 },
  base = process.env.QA_BASE ?? "http://127.0.0.1:5000",
  user = process.env.QA_USER_ID,
  cookie = process.env.QA_COOKIE,
} = {}) {
  if (!user || !cookie) {
    console.error("QA_USER_ID and QA_COOKIE are required. See the header of the calling script.");
    process.exit(2);
  }

  const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: "brain.sid", value: cookie, domain: new URL(base).hostname, path: "/" }]);
  await ctx.addInitScript((u) => {
    localStorage.setItem(`brain_onboarding_complete_${u}`, "true");
  }, user);

  const failures = [];
  const check = (label, pass, detail = "") => {
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
    if (!pass) failures.push(label);
  };

  /* Writes the script has declared. Each entry is a matcher plus the reason it
     was allowed, so the allowances are reviewable in one place. */
  const permitted = [];
  const expected = [];
  const violations = [];
  const externalBlocked = new Map();
  const expectedHits = new Map();
  const permittedHits = [];

  const appOrigin = new URL(base).origin;
  const find = (list, url) => list.find((e) => e.test(url));

  /* Installed FIRST so that everything a script registers later wins. */
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const method = req.method();
    if (SAFE_METHODS.has(method)) return route.continue();

    const url = req.url();
    const allowance = find(permitted, url);
    if (allowance) {
      permittedHits.push(`${method} ${pathOf(url)} (${allowance.reason})`);
      return route.continue();
    }

    const known = find(expected, url);
    if (known) {
      expectedHits.set(known.reason, (expectedHits.get(known.reason) ?? 0) + 1);
      return route.abort();
    }

    /* Off-origin telemetry cannot reach the tenant. Aborted and counted, but it
       is not the failure this guard exists to catch. */
    if (!url.startsWith(appOrigin)) {
      const key = `${method} ${originOf(url)}${pathOf(url)}`;
      externalBlocked.set(key, (externalBlocked.get(key) ?? 0) + 1);
      return route.abort();
    }

    violations.push(`${method} ${pathOf(url)}`);
    return route.abort();
  });

  /* An APIRequestContext call bypasses route handlers entirely — it is a real
     request no matter what is routed — so it needs its own guard. Patching
     Playwright's object in place does not stick (the self-test caught that), so
     scripts get a wrapper and never touch the raw context. The self-test
     enforces that with a static scan of this directory: a script that reaches
     around the wrapper fails the suite. */
  const raw = ctx.request;
  const api = {};
  for (const method of [...SAFE_REQUEST_METHODS, ...WRITE_METHODS]) {
    api[method] = async (url, options) => {
      const verb = method === "fetch" ? String(options?.method ?? "GET").toUpperCase() : method.toUpperCase();
      if (SAFE_METHODS.has(verb)) return await raw[method](url, options);
      const allowance = find(permitted, String(url));
      if (!allowance) {
        violations.push(`${verb} ${pathOf(String(url))} (direct request)`);
        throw new Error(
          `QA guard: refusing an unpermitted ${verb} to ${pathOf(String(url))}. ` +
            `Wrap it in permitWrite(pattern, reason, fn) if the write is intended.`,
        );
      }
      permittedHits.push(`${verb} ${pathOf(String(url))} (${allowance.reason})`);
      return await raw[method](url, options);
    };
  }

  const page = await ctx.newPage();

  /** Allow real writes matching `pattern` for the duration of `fn`. */
  const permitWrite = async (pattern, reason, fn) => {
    const entry = {
      test: (url) => (pattern instanceof RegExp ? pattern.test(url) : url.includes(pattern)),
      methods: null,
      reason,
    };
    permitted.push(entry);
    try {
      return await fn();
    } finally {
      permitted.splice(permitted.indexOf(entry), 1);
    }
  };

  /** A write the script knows the app will attempt and deliberately denies —
      the surface under test is expected to cope with the failure. Declaring it
      keeps it out of the violation list without loosening the guard: the
      request is still aborted, never sent. */
  const expectBlocked = (pattern, reason) => {
    expected.push({
      test: (url) => (pattern instanceof RegExp ? pattern.test(url) : url.includes(pattern)),
      reason,
    });
  };

  /** A write the script intercepts on purpose: never reaches the server, and
      the handler is told how many times it was hit so the script can assert
      the interception actually happened rather than hoping it did. */
  const stubWrite = async (pattern, handler) => {
    const state = { hits: 0 };
    await page.route(pattern, (route) => {
      state.hits += 1;
      return handler(route, state.hits);
    });
    state.release = async () => await page.unroute(pattern);
    return state;
  };

  const finish = async () => {
    if (permittedHits.length > 0) {
      console.log(`\ndeclared writes performed (${permittedHits.length}):`);
      for (const h of permittedHits) console.log(`  - ${h}`);
    }
    if (expectedHits.size > 0) {
      console.log("\nwrites denied on purpose:");
      for (const [reason, n] of expectedHits) console.log(`  - ${reason} (${n}x)`);
    }
    if (externalBlocked.size > 0) {
      const total = [...externalBlocked.values()].reduce((a, b) => a + b, 0);
      console.log(`\noff-origin writes blocked (${total}, cannot reach the tenant):`);
      for (const [key, n] of externalBlocked) console.log(`  - ${key} (${n}x)`);
    }
    check(
      "no unpermitted write reached the tenant",
      violations.length === 0,
      violations.length === 0 ? "" : `blocked ${violations.length}: ${[...new Set(violations)].join(", ")}`,
    );
    console.log(
      `\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILED:\n  - ${failures.join("\n  - ")}`}`,
    );
    await browser.close();
    process.exit(failures.length === 0 ? 0 : 1);
  };

  return { browser, ctx, page, api, base, user, check, failures, permitWrite, expectBlocked, stubWrite, violations, finish };
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
