export interface PublicUser {
  id: string;
  displayName: string;
  username: string;
}

export interface ThreadSummary {
  id: string;
  title: string | null;
  createdAt: string;
  members: PublicUser[];
}

export interface PostSummary {
  id: string;
  authorId: string;
  authorDisplayName: string;
  caption: string | null;
  status: string;
  createdAt: string;
  visibleAt: string;
  publishedAt: string | null;
  assets: Array<{
    id: string;
    position: number;
    mediaType: "image" | "video";
    width: number | null;
    height: number | null;
    durationMs: number | null;
    capturedAt: string | null;
  }>;
}

export interface AuthResult {
  token: string;
  expiresAt: string;
  user: PublicUser;
}

export const POLO_API_URL = (process.env.EXPO_PUBLIC_POLO_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export class PoloApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "PoloApiError";
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${POLO_API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      // Keep generic status code when the response is not JSON.
    }
    throw new PoloApiError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getHealth(signal?: AbortSignal): Promise<{ ok: boolean; service: string }> {
  return requestJson("/health", { signal });
}

export async function register(input: { registrationSecret: string; username: string; displayName: string; password: string }): Promise<AuthResult> {
  return requestJson("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export async function login(username: string, password: string): Promise<AuthResult> {
  return requestJson("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export async function getMe(token: string): Promise<PublicUser> {
  const result = await requestJson<{ user: PublicUser }>("/auth/me", {}, token);
  return result.user;
}

export async function logout(token: string): Promise<void> {
  return requestJson("/auth/logout", { method: "POST" }, token);
}

export async function listUsers(token: string): Promise<PublicUser[]> {
  return (await requestJson<{ users: PublicUser[] }>("/users", {}, token)).users;
}

export async function listThreads(token: string): Promise<ThreadSummary[]> {
  return (await requestJson<{ threads: ThreadSummary[] }>("/threads", {}, token)).threads;
}

export async function createThread(token: string, memberUserIds: string[]): Promise<ThreadSummary> {
  return (await requestJson<{ thread: ThreadSummary }>("/threads", { method: "POST", body: JSON.stringify({ memberUserIds }) }, token)).thread;
}

export async function listPosts(token: string, threadId: string): Promise<PostSummary[]> {
  return (await requestJson<{ posts: PostSummary[] }>(`/threads/${encodeURIComponent(threadId)}/posts`, {}, token)).posts;
}
