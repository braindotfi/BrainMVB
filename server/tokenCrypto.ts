import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

function keyFromEnv(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY must be set to encrypt Plaid access tokens");
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32 && base64.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")) {
    return base64;
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) {
    return utf8;
  }

  throw new Error("ENCRYPTION_KEY must be 32 bytes as hex, base64, or raw UTF-8");
}

export function assertEncryptionKeyConfigured(): void {
  keyFromEnv();
}

export function isEncryptedPlaidToken(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function encryptPlaidAccessToken(token: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptPlaidAccessToken(stored: string): string {
  if (!isEncryptedPlaidToken(stored)) {
    throw new Error("Plaid access token is not encrypted; migrate existing bank_connections rows");
  }
  const [, , ivB64, tagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Encrypted Plaid access token has an invalid format");
  }

  const key = keyFromEnv();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function readPlaidAccessToken(stored: string): string {
  if (isEncryptedPlaidToken(stored)) {
    return decryptPlaidAccessToken(stored);
  }
  return stored;
}
