const WIREX_AUTH_URL = "https://wirex-pay-dev.eu.auth0.com/oauth/token";
const WIREX_API_BASE = "https://api-baas.wirexapp.tech/api/v1";
const WIREX_CHAIN_ID = "9223372036854775806";
const WIREX_AUDIENCE = "https://api-business.wirexpaychain.tech";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getWirexToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const res = await fetch(WIREX_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.WIREX_CLIENT_ID,
      client_secret: process.env.WIREX_CLIENT_SECRET,
      audience: WIREX_AUDIENCE,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`WireX auth failed: ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

function wirexHeaders(token: string, email?: string) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Chain-Id": WIREX_CHAIN_ID,
  };
  if (email) h["X-User-Email"] = email;
  return h;
}

export interface WirexWallet {
  id: string;
  address: string;
  currency: string;
  balance: string;
  name?: string;
}

export interface WirexCard {
  id: string;
  card_number?: string;
  expiry?: string;
  cvv?: string;
  name_on_card?: string;
  status: string;
}

export interface WirexBankAccount {
  id: string;
  iban?: string;
  name?: string;
  balance?: string;
  currency?: string;
}

export async function createWirexUser(email: string, walletAddress: string) {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/user`, {
    method: "POST",
    headers: wirexHeaders(token),
    body: JSON.stringify({ email, country: "GB", wallet_address: walletAddress }),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (txt.includes("already exists") || res.status === 409) return null;
    throw new Error(`WireX create user failed: ${txt}`);
  }
  return await res.json();
}

export async function getWirexUser(email: string) {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/user`, {
    headers: wirexHeaders(token, email),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`WireX get user failed: ${await res.text()}`);
  return await res.json();
}

export async function getWirexWallets(email: string): Promise<WirexWallet[]> {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/wallets`, {
    headers: wirexHeaders(token, email),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

export async function getWirexCards(email: string): Promise<WirexCard[]> {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/cards`, {
    headers: wirexHeaders(token, email),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

export async function issueVirtualCard(email: string, fullName: string) {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/cards/virtual`, {
    method: "POST",
    headers: wirexHeaders(token, email),
    body: JSON.stringify({ card_name: "Brain Finance Card", name_on_card: fullName }),
  });
  if (!res.ok) throw new Error(`Issue card failed: ${await res.text()}`);
  return await res.json();
}

export async function getWirexBankAccounts(email: string): Promise<WirexBankAccount[]> {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/accounts`, {
    headers: wirexHeaders(token, email),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

export async function getWirexTransactions(email: string, accountId?: string) {
  const token = await getWirexToken();
  const url = accountId
    ? `${WIREX_API_BASE}/accounts/${accountId}/transactions`
    : `${WIREX_API_BASE}/transactions`;
  const res = await fetch(url, { headers: wirexHeaders(token, email) });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}
