import { describe, expect, it } from "vitest";
import {
  decryptPlaidAccessToken,
  encryptPlaidAccessToken,
  isEncryptedPlaidToken,
  readPlaidAccessToken,
} from "./tokenCrypto";

describe("Plaid token crypto", () => {
  it("passes legacy plaintext through for reads", () => {
    expect(readPlaidAccessToken("legacy-access-token")).toBe("legacy-access-token");
  });

  it("round-trips encrypted values for reads", () => {
    const encrypted = encryptPlaidAccessToken("secret-access-token");

    expect(isEncryptedPlaidToken(encrypted)).toBe(true);
    expect(encrypted).not.toContain("secret-access-token");
    expect(decryptPlaidAccessToken(encrypted)).toBe("secret-access-token");
    expect(readPlaidAccessToken(encrypted)).toBe("secret-access-token");
  });
});
