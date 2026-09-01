import type Database from "better-sqlite3";

export function isThreadMember(
  sqlite: Database.Database,
  userId: string,
  threadId: string,
): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM thread_members WHERE thread_id = ? AND user_id = ?")
      .get(threadId, userId),
  );
}
