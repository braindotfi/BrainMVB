import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

let cached: PlaidApi | null = null;

/**
 * Returns a Plaid client instance.  The client is created lazily so the
 * server doesn't crash at boot if PLAID_CLIENT_ID/PLAID_SECRET aren't set —
 * route handlers throw a clear "not configured" error instead.
 */
export function getPlaidClient(): PlaidApi {
  if (cached) return cached;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.");
  }

  const envName = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  const basePath = PlaidEnvironments[envName as keyof typeof PlaidEnvironments];
  if (!basePath) {
    throw new Error(`Invalid PLAID_ENV "${envName}". Use sandbox, development, or production.`);
  }

  const config = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  cached = new PlaidApi(config);
  return cached;
}

export const PLAID_PRODUCTS: Products[] = [Products.Auth, Products.Transactions];
export const PLAID_COUNTRIES: CountryCode[] = [CountryCode.Us, CountryCode.Ca];
