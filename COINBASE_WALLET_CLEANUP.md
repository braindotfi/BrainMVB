# Coinbase Wallet cleanup

## Done

- Removed the app-wide frontend wallet provider from `client/src/App.tsx`.
- Removed the unused RainbowKit/wagmi wallet runtime and its Coinbase connector.
- Removed the stale Coinbase Wallet row from the crypto source picker.
- Removed the `mm-sdk-analytics.api.cx.metamask.io` CSP allowance. No wallet SDK is
  mounted now, so no wallet analytics host is required.
- Kept `viem` because server-side SIWE verification still uses it.
- Confirmed the observed login 401 was invalid credentials, while the unauthenticated
  `/api/auth/user` 401 is the expected logged-out session response. No auth changes were made.

## Pending

- After this branch is merged and published, verify the production bundle and browser
  console on `app.brain.fi`: no Coinbase SDK initialization, no Coinbase or MetaMask
  analytics requests, and no related CSP/fetch errors.
- Re-check the authenticated login flow after publish; this cleanup intentionally does
  not alter `/api/auth/login` or `/api/auth/user`.