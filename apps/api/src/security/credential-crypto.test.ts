import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CredentialCrypto } from "./credential-crypto.js";

describe("CredentialCrypto", () => {
  it("round trips a credential without storing plaintext", () => {
    const crypto = new CredentialCrypto(randomBytes(32).toString("base64"));
    const sealed = crypto.seal("immich-secret-key");
    expect(sealed).not.toContain("immich-secret-key");
    expect(crypto.open(sealed)).toBe("immich-secret-key");
  });

  it("rejects the wrong key", () => {
    const first = new CredentialCrypto(randomBytes(32).toString("base64"));
    const second = new CredentialCrypto(randomBytes(32).toString("base64"));
    const sealed = first.seal("secret");
    expect(() => second.open(sealed)).toThrow();
  });
});
