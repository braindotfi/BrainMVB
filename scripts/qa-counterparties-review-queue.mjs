/**
 * Counterparties review-queue QA.
 *
 * WHAT THIS GUARDS
 *
 * This screen shipped with two different definitions of "needs review": a red
 * banner counted one set of rows, the Needs Review chip filtered another. So
 * the page warned you about nine vendors and then, when you clicked through to
 * look at them, showed you a different list. A warning that points at rows the
 * filter refuses to show is worse than no warning — it teaches the user the
 * number is noise.
 *
 * The fix was to derive the badge and the list from ONE predicate. That is a
 * structural property, and `brainVendors.test.ts` pins it at the unit level.
 * But the unit test only proves the two numbers agree in a pure function; it
 * cannot prove the component actually renders the rows it counted, that the
 * banner is really gone, or that the count rescopes when the segment changes.
 * Those are facts about the DOM, so this checks the DOM.
 *
 * It also pins the honesty rules the redesign turns on: a zero-payment row must
 * read "No payments yet" rather than "$0.00" (a real zero and no data are
 * different facts), and the Trusted tab must say trust-granting is unavailable
 * rather than implying the user simply has not got there yet.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-counterparties-review-queue.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server; take
 * it from a browser session or a curl login jar. Never commit one.
 */

import { createQaSession } from "./qa-harness.mjs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";

const { page, check, finish, permitWrite } = await createQaSession();

const go = async (path, settle = 2400) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};
const count = (sel) => page.locator(sel).count();
const ROWS = '[data-testid^="row-vendor-"]';
const BADGE = '[data-testid="tab-vendor-needs-review-count"]';

const badgeValue = async () => {
  if ((await count(BADGE)) !== 1) return null;
  const raw = (await page.locator(BADGE).innerText()).trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
};

/* Click a chip and let the list re-render. Chips are buttons, not links, so
   there is no navigation to wait on. */
const clickChip = async (testid) => {
  await page.locator(`[data-testid="${testid}"]`).click();
  await page.waitForTimeout(400);
};

/* ── The canonical route, and the one that predates the rename ───────────── */

await go("/ledger?tab=counterparties");
check(
  "canonical ?tab=counterparties opens the counterparties panel",
  (await count('[data-testid="tab-vendor-needs-review"]')) === 1,
);

/* Links emitted before the rename (bookmarks, older assistant citations, the
   audit log's vendor references) must keep working rather than silently
   dropping the user on a different tab. */
await go("/ledger?tab=vendors");
check(
  "legacy ?tab=vendors still resolves to the same panel",
  (await count('[data-testid="tab-vendor-needs-review"]')) === 1,
);

await go("/ledger?tab=counterparties");

/* ── The banner is gone for good ─────────────────────────────────────────── */

check(
  "the old new-vendors banner is not rendered",
  (await count('[data-testid="notice-new-vendors"]')) === 0,
);

/* ── The badge counts exactly the rows it opens ──────────────────────────── */

for (const segment of ["vendor", "customer"]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);
  await clickChip("tab-vendor-needs-review");

  const badge = await badgeValue();
  const rows = await count(ROWS);
  check(
    `${segment}s: Needs Review badge equals the rows it shows`,
    badge !== null && badge === rows,
    `badge=${badge} rows=${rows}`,
  );

  /* The badge is the only attention signal left, so it has to stay readable
     from the other filters — that is the job the banner used to do. Read it
     from Trusted rather than Suggested: Suggested is hidden while its bucket is
     empty, so it is not a chip this loop can rely on being there. */
  await clickChip("tab-vendor-trusted");
  const badgeFromSettled = await badgeValue();
  check(
    `${segment}s: badge stays visible and unchanged from another filter`,
    badgeFromSettled === badge,
    `needs-review=${badge} from-trusted=${badgeFromSettled}`,
  );

  /* And it must describe THIS segment. A count that silently includes the other
     side of the split is the same class of lie as the old banner. */
  await clickChip("tab-vendor-needs-review");
  const reasons = await count('[data-testid="chip-review-reason"]');
  check(
    `${segment}s: every queued row explains why it is queued`,
    reasons === rows,
    `rows=${rows} reasons=${reasons}`,
  );
}

/* Cross-check that the split actually splits. Comparing counts would only prove
   the two numbers differ; compare the row IDENTITIES instead, so a row leaking
   into both segments is caught even if the totals happen to look plausible.
   Row ids are stable and one counterparty has one type, so this stays true even
   if a freshly-seeded tenant grows more rows between the two captures. */
const rowIds = async () =>
  new Set(
    (await page.locator(ROWS).evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-testid")),
    )).filter(Boolean),
  );

await go("/ledger?tab=counterparties");
await clickChip("segment-vendor");
await clickChip("tab-vendor-needs-review");
const vendorIds = await rowIds();
await clickChip("segment-customer");
const customerIds = await rowIds();
const overlap = [...vendorIds].filter((id) => customerIds.has(id));
check(
  "no counterparty appears in both segments' queues",
  vendorIds.size > 0 && customerIds.size > 0 && overlap.length === 0,
  `vendors=${vendorIds.size} customers=${customerIds.size} overlap=[${overlap.join(", ")}]`,
);

/* ── Reason chips belong to the queue only ───────────────────────────────── */

await go("/ledger?tab=counterparties");
await clickChip("tab-vendor-trusted");
check(
  "settled rows carry no review reason",
  (await count('[data-testid="chip-review-reason"]')) === 0,
);

/* ── Honest copy ─────────────────────────────────────────────────────────── */

await clickChip("tab-vendor-trusted");
const trustedText = await page.locator('[data-testid="list-counterparties"]').innerText();
const trustedRows = await count(ROWS);
// Trust actions are now live. An empty Trusted list is genuinely empty, not
// "unavailable". Verify the old "isn't available yet" copy is gone.
check(
  "Trusted tab: trust actions are live, no unavailability disclaimer",
  !/isn't available yet/i.test(trustedText),
  trustedText.replace(/\n+/g, " | ").slice(0, 160),
);

await clickChip("tab-vendor-needs-review");
const queueText = await page.locator('[data-testid="list-counterparties"]').innerText();
check(
  "a row with no payments says so instead of showing $0.00",
  !/\$0\.00/.test(queueText),
  queueText.replace(/\n+/g, " | ").slice(0, 200),
);

/* ── The add box follows the tabs, before the records label ──────────────── */

const listBox = await page.locator('[data-testid="list-counterparties"]').boundingBox();
const addBox = await page.locator('[data-testid="panel-add-vendor-idle"]').boundingBox();
check(
  "the add box sits below the tabs and above the records label",
  listBox && addBox && addBox.y < listBox.y,
  `add.y=${addBox?.y} list.y=${listBox?.y}`,
);

/* ── The segment renames labels, never state ─────────────────────────────────
   Vendors say "Trusted", customers say "Confirmed", and both chips carry the
   SAME value — so a segment switch cannot silently reinterpret which rows the
   user is looking at. Reading the label off a chip located by its stable test
   id is what proves the rename is cosmetic. */

const chipLabel = async (testid) => {
  const el = page.locator(`[data-testid="${testid}"]`);
  return (await el.count()) === 1 ? (await el.innerText()).trim() : null;
};

await go("/ledger?tab=counterparties");
await clickChip("segment-vendor");
check(
  "vendors call the settled tier Trusted",
  (await chipLabel("tab-vendor-trusted")) === "Trusted",
  `label=${await chipLabel("tab-vendor-trusted")}`,
);

await clickChip("segment-customer");
check(
  "customers call the same tier Confirmed, on the same chip",
  (await chipLabel("tab-vendor-trusted")) === "Confirmed",
  `label=${await chipLabel("tab-vendor-trusted")}`,
);

/* Flagging a customer is rare enough that an always-empty chip is noise there.
   Hiding a chip that HAS rows would hide the rows, so this allows either an
   absent chip or a present one — never an empty one taking up the row. */
await clickChip("tab-vendor-needs-review");
const flaggedOnCustomers = await count('[data-testid="tab-vendor-flagged"]');
check(
  "the Flagged chip is hidden on Customers while it has nothing to show",
  flaggedOnCustomers === 0,
  `flagged chips on customers=${flaggedOnCustomers}`,
);

await clickChip("segment-vendor");
check(
  "the Flagged chip is present on Vendors",
  (await count('[data-testid="tab-vendor-flagged"]')) === 1,
);

/* Suggested is hidden on BOTH segments while nothing can reach the tier —
   nothing upstream marks a counterparty as Brain-suggested yet. The moment
   something does, the chip must come back, so this asserts the pairing (chip
   present iff it has rows) rather than hard-coding "always absent". */
for (const segment of ["vendor", "customer"]) {
  await clickChip(`segment-${segment}`);
  const suggestedChips = await count('[data-testid="tab-vendor-suggested"]');
  let suggestedRows = null;
  if (suggestedChips === 1) {
    await clickChip("tab-vendor-suggested");
    suggestedRows = await count(ROWS);
    await clickChip("tab-vendor-needs-review");
  }
  check(
    `${segment}s: the Suggested chip is shown only when it has rows`,
    suggestedChips === 0 || suggestedRows > 0,
    `chip=${suggestedChips} rows=${suggestedRows}`,
  );
}

/* Selecting a chip the other segment does not offer must not leave the list
   showing a tier no chip is highlighting. */
await clickChip("segment-vendor");
await clickChip("tab-vendor-flagged");
await clickChip("segment-customer");
const pressedChips = await page
  .locator('[data-testid^="tab-vendor-"][aria-pressed="true"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
check(
  "switching away from a segment-only chip falls back to a visible one",
  pressedChips.length === 1 && pressedChips[0] === "tab-vendor-needs-review",
  `pressed=[${pressedChips.join(", ")}]`,
);

/* ── The add box follows the segment ─────────────────────────────────────────
   The create route accepts customers, so an add box that says "vendor" on the
   Customers segment would be describing a different write than the one it
   performs. */
const addBoxText = async () =>
  (await page.locator('[data-testid="panel-add-vendor-idle"]').innerText()).toLowerCase();

check(
  "the add box asks for a customer on the Customers segment",
  /customer/.test(await addBoxText()) && !/vendor/.test(await addBoxText()),
  (await addBoxText()).replace(/\n+/g, " | ").slice(0, 120),
);

await clickChip("segment-vendor");
check(
  "the add box asks for a vendor on the Vendors segment",
  /vendor/.test(await addBoxText()) && !/customer/.test(await addBoxText()),
  (await addBoxText()).replace(/\n+/g, " | ").slice(0, 120),
);

/* ── The detail popup tells the same story as the list ───────────────────────
   Trust routes are live (brain-core PRs #397/#403, GIT deedc628). Verify the
   popup's actions are enabled — not the old disabled placeholders — and that
   the "unavailable" note copy is absent. */

const POPUP = '[data-testid="vendor-detail-popup-content"]';
/* Trust actions that may render in the Needs Review popup (unreviewed rows only).
   paused rows live in the Flagged tab — their restore button is checked separately.
   trusted rows live in the Trusted tab — their flag button is not checked here. */
const TRUST_ACTIONS = [
  "button-grant-trust",
  "button-flag-counterparty",
  "button-acknowledge-counterparty",
];

const openFirstRow = async () => {
  const rows = page.locator(ROWS);
  if ((await rows.count()) === 0) return false;
  await rows.first().click();
  await page.waitForTimeout(600);
  return (await count(POPUP)) === 1;
};
const closePopup = async () => {
  const btn = page.locator('[data-testid="button-close-vendor-popup"]');
  if ((await btn.count()) === 1) await btn.click();
  await page.waitForTimeout(300);
};

for (const segment of ["vendor", "customer"]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);
  await clickChip("tab-vendor-needs-review");

  if (!(await openFirstRow())) {
    check(`${segment}s: a queued row opens its detail popup`, false, "no rows to open");
    continue;
  }

  /* At least one trust action must be live (enabled) in the popup now that
     brain-core trust routes are deployed. */
  const liveActions = [];
  for (const id of TRUST_ACTIONS) {
    const el = page.locator(`[data-testid="${id}"]`);
    if ((await el.count()) === 1 && !(await el.first().isDisabled())) liveActions.push(id);
  }
  check(
    `${segment}s: the popup has at least one live trust action`,
    liveActions.length > 0,
    `enabled=[${liveActions.join(", ")}]`,
  );

  /* The old "unavailable" note is gone — actions are live. */
  check(
    `${segment}s: the popup has no unavailability disclaimer`,
    (await count('[data-testid="text-review-actions-unavailable"]')) === 0,
  );

  const popupText = await page.locator(POPUP).innerText();

  /* One word per state. "Reject" was a second name for the paused state the
     list now calls Flagged, and two words for one state is how a queue starts
     disagreeing with itself. */
  check(
    `${segment}s: the popup says Flag, never Reject`,
    !/reject/i.test(popupText) && (await count('[data-testid="button-reject-vendor"]')) === 0,
    popupText.replace(/\n+/g, " | ").slice(0, 200),
  );

  /* The popup inherits the segment's vocabulary from the row that opened it —
     a customer's popup calling them a vendor would undo the rename one click in. */
  const otherNoun = segment === "vendor" ? /\bcustomer/i : /\bvendor/i;
  check(
    `${segment}s: the popup uses this segment's noun`,
    !otherNoun.test(popupText),
    popupText.replace(/\n+/g, " | ").slice(0, 200),
  );

  await closePopup();
}

/* And the grant action is worded per segment: "Trust" for people we pay,
   "Confirm" for people who pay us — the same alias the chip uses. */
for (const [segment, expected] of [
  ["vendor", /^Trust Vendor$/],
  ["customer", /^Confirm Customer$/],
]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);
  await clickChip("tab-vendor-needs-review");

  /* Recorded as a failure, not skipped. A wording regression that only shows up
     on a populated tenant is exactly the kind this check exists to catch, so an
     empty queue has to fail loudly rather than quietly passing the run. */
  if (!(await openFirstRow())) {
    check(
      `${segment}s: the grant action is worded for this segment`,
      false,
      "no queued row to open — cannot read the label",
    );
    continue;
  }

  // button-trust-vendor-review is the legacy test ID used when under_review had its own label.
  // Both resolve to the same grant endpoint now; keep the selector broad so either works.
  const grant = page.locator(
    '[data-testid="button-grant-trust"], [data-testid="button-trust-vendor-review"]',
  );
  const label = (await grant.count()) >= 1 ? (await grant.first().innerText()).trim() : null;
  check(
    `${segment}s: the grant action is worded for this segment`,
    label !== null && expected.test(label),
    `label=${label ?? "no grant action rendered"}`,
  );
  // Trust routes are live — the grant button must not be disabled.
  const grantEnabled =
    label !== null && (await grant.first().isEnabled().catch(() => false));
  check(
    `${segment}s: the grant action is enabled (trust routes live)`,
    grantEnabled,
    grantEnabled ? "enabled" : label === null ? "button not found" : "button is disabled",
  );
  await closePopup();
}

/* ── Flagged tab: the restore path must be live, not a placeholder ───────────
   paused → trusted via /trust/restore is the only transition that requires a
   row to have been actioned once already, so it is the likeliest to silently
   rot. This is a read-only inspection (no write): open the first Flagged row
   and prove the restore button is rendered AND enabled, with no stale
   "unavailable" disclaimer left over from the pre-trust-routes era.

   The Flagged chip is hidden while its bucket is empty (asserted earlier), so
   an absent chip here means "no paused rows on this tenant" — recorded as an
   explicit SKIP, never a false pass. */

for (const segment of ["vendor", "customer"]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);

  if ((await count('[data-testid="tab-vendor-flagged"]')) === 0) {
    console.log(
      `SKIP  ${segment}s: Flagged tab restore-path check — no Flagged chip (no paused rows on this tenant)`,
    );
    continue;
  }

  await clickChip("tab-vendor-flagged");
  const flaggedRows = await count(ROWS);
  if (flaggedRows === 0) {
    /* Vendors keep the Flagged chip visible even when empty (asserted above),
       so an empty list here just means no paused rows exist yet — a skip. */
    console.log(
      `SKIP  ${segment}s: Flagged tab restore-path check — Flagged list is empty (no paused rows on this tenant)`,
    );
    continue;
  }

  if (!(await openFirstRow())) {
    check(`${segment}s: a flagged row opens its detail popup`, false, "popup did not open");
    continue;
  }

  const restoreBtn = page.locator('[data-testid="button-restore-trust"]');
  const restorePresent = (await restoreBtn.count()) === 1;
  check(
    `${segment}s: the Flagged popup renders the restore action`,
    restorePresent,
  );

  if (restorePresent) {
    const restoreEnabled = await restoreBtn.isEnabled().catch(() => false);
    check(
      `${segment}s: the restore action is enabled (trust routes live)`,
      restoreEnabled,
      restoreEnabled ? "enabled" : "button is disabled",
    );
  }

  /* The disabled-placeholder era shipped an "unavailable" note alongside the
     dead buttons. Both the test-id'd note and its copy must be gone. */
  const flaggedPopupText = await page.locator(POPUP).innerText();
  check(
    `${segment}s: the Flagged popup has no unavailability disclaimer`,
    (await count('[data-testid="text-review-actions-unavailable"]')) === 0 &&
      !/isn't available yet|unavailable/i.test(flaggedPopupText),
    flaggedPopupText.replace(/\n+/g, " | ").slice(0, 200),
  );

  await closePopup();
}

/* ── End-to-end trust transition walkthrough ─────────────────────────────────
   Exercises all four real backend calls in sequence against a live demo tenant.
   Each `permitWrite` declaration scopes the write to exactly one button click so
   the write-guard still catches anything the script does NOT intend.

   Sequence:
     1. unreviewed → trusted    via /trust/grant       (Needs Review → Trusted tab)
     2. trusted    → paused     via /trust/pause        (Trusted → Flagged tab)
     3. paused     → trusted    via /trust/restore      (Flagged → Trusted tab)
     4. any        → acknowledged  via /trust/acknowledge (Needs Review → gone)

   If the Needs Review queue is empty the whole block is skipped with a clear
   note — never a false pass. */

await go("/ledger?tab=counterparties");
await clickChip("segment-vendor");
await clickChip("tab-vendor-needs-review");

const needsReviewCount = await count(ROWS);
if (needsReviewCount === 0) {
  check(
    "trust-transition walkthrough: Needs Review has rows to work with",
    false,
    "queue is empty — demo tenant may need re-provisioning",
  );
} else {
  /* ── Step 1: unreviewed → trusted (grant) ─────────────────────────────── */
  const firstRow = page.locator(ROWS).first();
  const vendorName = await firstRow.locator('[data-testid^="text-vendor-name"], [class*="font-semibold"]').first().innerText().catch(() => "(unknown)");
  await firstRow.click();
  await page.waitForTimeout(600);

  const popupOpen = (await count(POPUP)) === 1;
  if (!popupOpen) {
    check("trust-transition: popup opens from Needs Review row", false, "popup did not open");
  } else {
    const grantBtn = page.locator('[data-testid="button-grant-trust"]');
    const grantExists = (await grantBtn.count()) === 1;
    check(
      "trust-transition 1/4: grant button is present in Needs Review popup",
      grantExists,
    );

    if (grantExists) {
      await permitWrite(
        /\/trust\/grant/,
        "step 1: unreviewed → trusted",
        async () => {
          await grantBtn.click();
          /* Wait for the list to invalidate and re-render. */
          await page.waitForTimeout(2000);
        },
      );

      /* Row should now be in the Trusted tab, not Needs Review. */
      await clickChip("tab-vendor-needs-review");
      await page.waitForTimeout(400);
      const stillInQueue = await count(ROWS);
      check(
        "trust-transition 1/4: unreviewed → trusted (grant) — row left Needs Review",
        stillInQueue < needsReviewCount,
        `before=${needsReviewCount} after=${stillInQueue}`,
      );

      await clickChip("tab-vendor-trusted");
      await page.waitForTimeout(400);
      const trustedCount = await count(ROWS);
      check(
        "trust-transition 1/4: unreviewed → trusted (grant) — row appears in Trusted tab",
        trustedCount > 0,
        `trusted-tab rows: ${trustedCount}`,
      );

      /* ── Step 2: trusted → paused (flag/pause) ───────────────────────── */
      if (trustedCount > 0) {
        await page.locator(ROWS).first().click();
        await page.waitForTimeout(600);

        const flagBtn = page.locator('[data-testid="button-flag-trust"]');
        const flagExists = (await flagBtn.count()) === 1;
        check(
          "trust-transition 2/4: flag button is present in Trusted popup",
          flagExists,
        );

        if (flagExists) {
          await permitWrite(
            /\/trust\/pause/,
            "step 2: trusted → paused",
            async () => {
              await flagBtn.click();
              await page.waitForTimeout(2000);
            },
          );

          await clickChip("tab-vendor-trusted");
          await page.waitForTimeout(400);
          const trustedAfterFlag = await count(ROWS);
          check(
            "trust-transition 2/4: trusted → paused (flag) — row left Trusted tab",
            trustedAfterFlag < trustedCount,
            `before=${trustedCount} after=${trustedAfterFlag}`,
          );

          /* Flagged chip may only appear while there are flagged rows. */
          const flaggedChipExists = (await count('[data-testid="tab-vendor-flagged"]')) === 1;
          if (flaggedChipExists) {
            await clickChip("tab-vendor-flagged");
            await page.waitForTimeout(400);
            const flaggedCount = await count(ROWS);
            check(
              "trust-transition 2/4: trusted → paused (flag) — row appears in Flagged tab",
              flaggedCount > 0,
              `flagged-tab rows: ${flaggedCount}`,
            );

            /* ── Step 3: paused → trusted (restore) ──────────────────── */
            if (flaggedCount > 0) {
              await page.locator(ROWS).first().click();
              await page.waitForTimeout(600);

              const restoreBtn = page.locator('[data-testid="button-restore-trust"]');
              const restoreExists = (await restoreBtn.count()) === 1;
              check(
                "trust-transition 3/4: restore button is present in Flagged popup",
                restoreExists,
              );

              if (restoreExists) {
                const restoreEnabled = await restoreBtn.isEnabled().catch(() => false);
                check(
                  "trust-transition 3/4: restore button is enabled (not disabled placeholder)",
                  restoreEnabled,
                );

                if (restoreEnabled) {
                  await permitWrite(
                    /\/trust\/restore/,
                    "step 3: paused → trusted",
                    async () => {
                      await restoreBtn.click();
                      await page.waitForTimeout(2000);
                    },
                  );

                  const flaggedChipGone = (await count('[data-testid="tab-vendor-flagged"]')) === 0;
                  const flaggedAfterRestore = flaggedChipGone ? 0 : await (async () => {
                    await clickChip("tab-vendor-flagged");
                    await page.waitForTimeout(400);
                    return count(ROWS);
                  })();
                  check(
                    "trust-transition 3/4: paused → trusted (restore) — row left Flagged tab",
                    flaggedAfterRestore < flaggedCount,
                    `before=${flaggedCount} after=${flaggedAfterRestore}`,
                  );

                  await clickChip("tab-vendor-trusted");
                  await page.waitForTimeout(400);
                  const trustedAfterRestore = await count(ROWS);
                  check(
                    "trust-transition 3/4: paused → trusted (restore) — row back in Trusted tab",
                    trustedAfterRestore > 0,
                    `trusted-tab rows: ${trustedAfterRestore}`,
                  );
                }
              }
            }
          } else {
            check(
              "trust-transition 2/4: trusted → paused (flag) — Flagged chip appeared",
              false,
              "Flagged chip not visible after pause — row may not have moved",
            );
          }
        }
      }
    }
  }
  await closePopup();

  /* ── Step 4: any valid state → acknowledged ("No action") ─────────────── */
  await go("/ledger?tab=counterparties");
  await clickChip("segment-vendor");
  await clickChip("tab-vendor-needs-review");
  await page.waitForTimeout(400);

  const queueForAck = await count(ROWS);
  if (queueForAck === 0) {
    check(
      "trust-transition 4/4: acknowledge — a row is available to mark no action",
      false,
      "Needs Review queue is now empty (all rows may have been consumed by steps 1–3)",
    );
  } else {
    await page.locator(ROWS).first().click();
    await page.waitForTimeout(600);

    const ackBtn = page.locator('[data-testid="button-acknowledge-counterparty"]');
    const ackExists = (await ackBtn.count()) === 1;
    check(
      "trust-transition 4/4: No action button is present in popup",
      ackExists,
    );

    if (ackExists) {
      await permitWrite(
        /\/trust\/acknowledge/,
        "step 4: any → acknowledged",
        async () => {
          await ackBtn.click();
          await page.waitForTimeout(2000);
        },
      );

      await clickChip("tab-vendor-needs-review");
      await page.waitForTimeout(400);
      const queueAfterAck = await count(ROWS);
      check(
        "trust-transition 4/4: any → acknowledged (No action) — row left Needs Review",
        queueAfterAck < queueForAck,
        `before=${queueForAck} after=${queueAfterAck}`,
      );
    }
  }
}

await finish();
