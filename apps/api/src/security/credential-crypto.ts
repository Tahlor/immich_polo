import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function decodeKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("POLO_CREDENTIAL_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export class CredentialCrypto {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    this.#key = decodeKey(base64Key);
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
  }

  open(sealed: string): string {
    const [version, ivPart, ciphertextPart, tagPart] = sealed.split(".");
    if (version !== VERSION || !ivPart || ciphertextPart === undefined || !tagPart) {
      throw new Error("Unsupported or malformed credential ciphertext");
    }

    const decipher = createDecipheriv(ALGORITHM, this.#key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }
}
