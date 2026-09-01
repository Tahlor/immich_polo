import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const VERSION = "scrypt-v1";
const KEY_BYTES = 32;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt);
  return `${VERSION}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, saltPart, hashPart] = encoded.split("$");
  if (version !== VERSION || !saltPart || !hashPart) return false;

  const expected = Buffer.from(hashPart, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltPart, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function secretMatches(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}
