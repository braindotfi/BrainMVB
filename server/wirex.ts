const WIREX_AUTH_URL = "https://wirex-pay-dev.eu.auth0.com/oauth/token";
const WIREX_API_BASE = "https://api-baas.wirexapp.tech/api/v1";
const WIREX_CHAIN_ID = "9223372036854775806";
const WIREX_AUDIENCE = "https://api-business.wirexpaychain.tech";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getWirexToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  console.log("[WireX] Fetching new access token...");
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
  if (!res.ok) {
    const txt = await res.text();
    console.error("[WireX] Auth failed:", res.status, txt);
    throw new Error(`WireX auth failed: ${txt}`);
  }
  const data = await res.json();
  console.log("[WireX] Token obtained, expires_in:", data.expires_in);
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
  // WireX requires a valid-looking Ethereum address — generate a deterministic placeholder
  // if no real address was provided
  const addr = walletAddress && walletAddress.startsWith("0x") && walletAddress.length === 42
    ? walletAddress
    : `0x${Buffer.from(email).toString("hex").padEnd(40, "0").slice(0, 40)}`;

  const body = { email, country: "GB", wallet_address: addr };
  console.log("[WireX] Creating user:", JSON.stringify(body));
  const res = await fetch(`${WIREX_API_BASE}/user`, {
    method: "POST",
    headers: wirexHeaders(token),
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  console.log("[WireX] Create user response:", res.status, txt);
  if (!res.ok) {
    if (txt.includes("already exists") || txt.includes("already_exists") || res.status === 409 || res.status === 422) {
      console.log("[WireX] User already exists, continuing...");
      return null;
    }
    throw new Error(`WireX create user failed: ${txt}`);
  }
  try { return JSON.parse(txt); } catch { return null; }
}

export async function getWirexUser(email: string) {
  const token = await getWirexToken();
  console.log("[WireX] Fetching user for email:", email);
  const res = await fetch(`${WIREX_API_BASE}/user`, {
    headers: wirexHeaders(token, email),
  });
  const txt = await res.text();
  console.log("[WireX] Get user response:", res.status, txt.slice(0, 300));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`WireX get user failed: ${txt}`);
  try { return JSON.parse(txt); } catch { return null; }
}

export async function getWirexWallets(email: string): Promise<WirexWallet[]> {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/wallets`, {
    headers: wirexHeaders(token, email),
  });
  const txt = await res.text();
  console.log("[WireX] Wallets response:", res.status, txt.slice(0, 300));
  if (!res.ok) return [];
  try {
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : (data.data ?? data.wallets ?? []);
  } catch { return []; }
}

export async function getWirexCards(email: string): Promise<WirexCard[]> {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/cards`, {
    headers: wirexHeaders(token, email),
  });
  const txt = await res.text();
  console.log("[WireX] Cards response:", res.status, txt.slice(0, 300));
  if (!res.ok) return [];
  try {
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : (data.data ?? data.cards ?? []);
  } catch { return []; }
}

export async function issueVirtualCard(email: string, fullName: string) {
  const token = await getWirexToken();
  const body = { card_name: "Brain Finance Card", name_on_card: fullName };
  console.log("[WireX] Issuing virtual card:", JSON.stringify(body));
  const res = await fetch(`${WIREX_API_BASE}/cards/virtual`, {
    method: "POST",
    headers: wirexHeaders(token, email),
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  console.log("[WireX] Issue card response:", res.status, txt.slice(0, 300));
  if (!res.ok) throw new Error(`Issue card failed: ${txt}`);
  try { return JSON.parse(txt); } catch { return null; }
}

export async function getWirexBankAccounts(email: string): Promise<WirexBankAccount[]> {
  const token = await getWirexToken();
  const res = await fetch(`${WIREX_API_BASE}/accounts`, {
    headers: wirexHeaders(token, email),
  });
  const txt = await res.text();
  console.log("[WireX] Bank accounts response:", res.status, txt.slice(0, 300));
  if (!res.ok) return [];
  try {
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : (data.data ?? data.accounts ?? []);
  } catch { return []; }
}

export async function getWirexTransactions(email: string, accountId?: string) {
  const token = await getWirexToken();
  const url = accountId
    ? `${WIREX_API_BASE}/accounts/${accountId}/transactions`
    : `${WIREX_API_BASE}/transactions`;
  const res = await fetch(url, { headers: wirexHeaders(token, email) });
  if (!res.ok) return [];
  const txt = await res.text();
  try {
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch { return []; }
}
