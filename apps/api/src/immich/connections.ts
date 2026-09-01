import type Database from "better-sqlite3";
import type { ImmichConnectionSecret } from "@immich-polo/immich-client";
import type { CredentialCrypto } from "../security/credential-crypto.js";

export interface StoredImmichConnection {
  id: string;
  userId: string;
  baseUrl: string;
  credentialCiphertext: string;
  immichUserId: string | null;
  serverVersion: string | null;
  lastVerifiedAt: number | null;
}

export function findImmichConnection(
  sqlite: Database.Database,
  connectionId: string,
): StoredImmichConnection | undefined {
  return sqlite
    .prepare(
      `SELECT id, user_id AS userId, base_url AS baseUrl,
              credential_ciphertext AS credentialCiphertext,
              immich_user_id AS immichUserId, server_version AS serverVersion,
              last_verified_at AS lastVerifiedAt
       FROM immich_connections WHERE id = ?`,
    )
    .get(connectionId) as StoredImmichConnection | undefined;
}

export function ownedConnectionSecret(
  sqlite: Database.Database,
  crypto: CredentialCrypto,
  userId: string,
  connectionId: string,
): { stored: StoredImmichConnection; secret: ImmichConnectionSecret } | null {
  const stored = findImmichConnection(sqlite, connectionId);
  if (!stored || stored.userId !== userId) return null;
  return {
    stored,
    secret: { baseUrl: stored.baseUrl, apiKey: crypto.open(stored.credentialCiphertext) },
  };
}

export function connectionSecret(
  stored: StoredImmichConnection,
  crypto: CredentialCrypto,
): ImmichConnectionSecret {
  return { baseUrl: stored.baseUrl, apiKey: crypto.open(stored.credentialCiphertext) };
}
