---
name: Screenshotting auth-gated UI in this app
description: How to get a real rendered screenshot of a signed-in-only page when the screenshot tool cannot log in.
---

Almost every page in this app is behind a session login, and the screenshot tool
drives a browser it cannot authenticate. To visually verify a styling change,
render the markup in a throwaway harness served by the app's own dev server.

**The working recipe**

1. Put the harness entry at `client/src/__tmp-preview.tsx` (inside Tailwind's
   `content` globs, so any classes it uses are generated) and have it
   `import "./index.css"`.
2. Put the HTML at `client/public/__tmp-preview.html` — **the public dir, not the
   Vite root.**
3. The HTML must manually install the React Fast Refresh preamble before its
   module script, or the module throws and the page renders blank white with no
   console error:
   ```html
   <script type="module">
     import RefreshRuntime from "/@react-refresh";
     RefreshRuntime.injectIntoGlobalHook(window);
     window.$RefreshReg$ = () => {};
     window.$RefreshSig$ = () => (type) => type;
     window.__vite_plugin_react_preamble_installed__ = true;
   </script>
   ```
4. Screenshot `/__tmp-preview.html` on the normal app port, then delete both files.

**Why:** the Vite dev server runs with `appType: "custom"`, so its middleware
does not serve HTML entries — an HTML file at the Vite root is swallowed by the
Express catch-all, which unconditionally returns `client/index.html`. Files in
the *public* dir are served by Vite's static middleware, which is mounted before
that catch-all. Because `transformIndexHtml` never touches a public-dir file, the
preamble that `@vitejs/plugin-react` requires is missing unless added by hand.

**Blank-page trap:** an arbitrary Tailwind class used *only* by the brand-new
harness file (`h-[816px]`, `w-[390px]`) may not be in the CSS the running dev
server is already serving, so the wrapper collapses and the panel's `h-full`
resolves to zero — a black frame with a faint 1px line where the component's own
`max-w-[…]` still applied. Size the harness wrapper with inline `style`, never a
new arbitrary class. Drive internal state (tab selection, etc.) from a query
param plus a `setTimeout` click on the rendered control.

**For pixel comparison, get a PNG:** the screenshot tool saves JPEG, whose ringing
around 1px lines corrupts any border measurement. Nix chromium can do it
directly: `chromium --headless=new --no-sandbox --screenshot=/tmp/x.png
--window-size=390,816 --virtual-time-budget=6000 <url>`.

**Also ruled out:** starting a second standalone `vite --port NNNN` does not work.
It survives its own ShellExec call but is dead by the next one, so the screenshot
tool always gets ECONNREFUSED.

**How to apply:** reach for this whenever a visual check is needed on a page that
requires a session. Copy the target markup verbatim out of the real component so
the render stays faithful, and remove the harness before finishing.
