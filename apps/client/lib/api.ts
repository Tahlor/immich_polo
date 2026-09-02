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

export interface ImmichConnection {
  id: string;
  baseUrl: string;
  immichUserId: string | null;
  serverVersion: string;
  lastVerifiedAt: string;
}

export interface ImmichAsset {
  id: string;
  type: "image" | "video";
  capturedAt: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface ImmichAssetPage {
  assets: ImmichAsset[];
  nextCursor: string | null;
}

export interface AuthResult {
  token: string;
  expiresAt: string;
  user: PublicUser;
}

export interface LocalUploadFile {
  uri: string;
  filename: string;
  contentType: string;
  webFile?: Blob;
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
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
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

export function bearerHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function pickerThumbnailUrl(connectionId: string, assetId: string): string {
  return `${POLO_API_URL}/immich-connections/${encodeURIComponent(connectionId)}/assets/${encodeURIComponent(assetId)}/thumbnail`;
}

export function postThumbnailUrl(postId: string, postAssetId: string): string {
  return `${POLO_API_URL}/posts/${encodeURIComponent(postId)}/assets/${encodeURIComponent(postAssetId)}/thumbnail`;
}

export function postMediaUrl(postId: string, postAssetId: string): string {
  return `${POLO_API_URL}/posts/${encodeURIComponent(postId)}/assets/${encodeURIComponent(postAssetId)}/media`;
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

export async function listImmichConnections(token: string): Promise<ImmichConnection[]> {
  return (await requestJson<{ connections: ImmichConnection[] }>("/immich-connections", {}, token)).connections;
}

export async function createImmichConnection(token: string, baseUrl: string, apiKey: string): Promise<ImmichConnection> {
  return (await requestJson<{ connection: ImmichConnection }>(
    "/immich-connections",
    { method: "POST", body: JSON.stringify({ baseUrl, apiKey }) },
    token,
  )).connection;
}

export async function listImmichAssets(
  token: string,
  connectionId: string,
  options: { type?: "image" | "video"; limit?: number; cursor?: string } = {},
): Promise<ImmichAssetPage> {
  const query = new URLSearchParams();
  if (options.type) query.set("type", options.type);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.cursor) query.set("cursor", options.cursor);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson(`/immich-connections/${encodeURIComponent(connectionId)}/assets${suffix}`, {}, token);
}

export async function createPostFromImmich(
  token: string,
  threadId: string,
  input: { connectionId: string; assetId: string; caption?: string; visibleAt?: string },
): Promise<PostSummary> {
  return (await requestJson<{ post: PostSummary }>(
    `/threads/${encodeURIComponent(threadId)}/posts/from-immich`,
    { method: "POST", body: JSON.stringify(input) },
    token,
  )).post;
}

export async function uploadLocalPost(
  token: string,
  threadId: string,
  connectionId: string,
  file: LocalUploadFile,
  options: { caption?: string; capturedAt?: string; visibleAt?: string } = {},
): Promise<{ post: PostSummary; duplicate: boolean }> {
  const query = new URLSearchParams();
  if (options.caption?.trim()) query.set("caption", options.caption.trim());
  if (options.capturedAt) query.set("capturedAt", options.capturedAt);
  if (options.visibleAt) query.set("visibleAt", options.visibleAt);
  const form = new FormData();
  if (file.webFile) {
    form.append("file", file.webFile, file.filename);
  } else {
    form.append("file", { uri: file.uri, name: file.filename, type: file.contentType } as unknown as Blob);
  }
  const result = await requestJson<{ post: PostSummary; upload: { duplicate: boolean } }>(
    `/threads/${encodeURIComponent(threadId)}/posts/upload/${encodeURIComponent(connectionId)}${query.size ? `?${query.toString()}` : ""}`,
    { method: "POST", body: form },
    token,
  );
  return { post: result.post, duplicate: result.upload.duplicate };
}

export async function updatePostView(
  token: string,
  postId: string,
  playbackPositionMs?: number,
): Promise<void> {
  await requestJson(
    `/posts/${encodeURIComponent(postId)}/view`,
    { method: "PUT", body: JSON.stringify(playbackPositionMs === undefined ? {} : { playbackPositionMs }) },
    token,
  );
}
