import type { SendStatus } from "./compose";

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
  input: { connectionId: string; assetId: string; caption?: string; visibleAt?: string; sendId?: string },
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
  options: { caption?: string; capturedAt?: string; visibleAt?: string; sendId?: string; fileId?: string; skipUpload?: boolean; onPreparing?: () => void; onProgress?: (fraction: number) => void } = {},
): Promise<{ post: PostSummary; duplicate: boolean }> {
  const query = new URLSearchParams();
  if (options.sendId) query.set("sendId", options.sendId);
  if (options.fileId) query.set("fileId", options.fileId);
  if (options.caption?.trim()) query.set("caption", options.caption.trim());
  if (options.capturedAt) query.set("capturedAt", options.capturedAt);
  if (options.visibleAt) query.set("visibleAt", options.visibleAt);
  const form = new FormData();
  if (!options.skipUpload && file.webFile) {
    form.append("file", file.webFile, file.filename);
  } else if (!options.skipUpload) {
    form.append("file", { uri: file.uri, name: file.filename, type: file.contentType } as unknown as Blob);
  }
  const path = `/threads/${encodeURIComponent(threadId)}/posts/upload/${encodeURIComponent(connectionId)}${query.size ? `?${query.toString()}` : ""}`;
  const result = !options.skipUpload && (options.onPreparing || options.onProgress)
    ? await uploadWithProgress(path, form, token, options)
    : await requestJson<{ post: PostSummary; upload: { duplicate: boolean } }>(path, { method: "POST", ...(options.skipUpload ? {} : { body: form }) }, token);
  return { post: result.post, duplicate: result.upload.duplicate };
}

function uploadWithProgress(path: string, form: FormData, token: string, options: { onPreparing?: () => void; onProgress?: (fraction: number) => void }) {
  return new Promise<{ post: PostSummary; upload: { duplicate: boolean } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${POLO_API_URL}${path}`);
    xhr.timeout = 3_600_000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.upload.onload = () => options.onPreparing?.();
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error("Connection interrupted. Your draft is kept; retry to check whether it was sent."));
    xhr.onload = () => {
      let body;
      try { body = JSON.parse(xhr.responseText); } catch { reject(new Error("Could not read the server result. Retry to check this send.")); return; }
      if (xhr.status < 200 || xhr.status >= 300) reject(new PoloApiError(xhr.status, body.error ?? `http_${xhr.status}`));
      else resolve(body);
    };
    xhr.send(form);
  });
}

export async function getSendStatus(token: string, threadId: string, sendId: string): Promise<SendStatus> {
  try {
    return await requestJson(`/threads/${encodeURIComponent(threadId)}/sends/${encodeURIComponent(sendId)}`, {}, token);
  } catch (error) {
    if (error instanceof PoloApiError && error.status === 404 && error.code === "send_not_found") return { state: "missing" };
    throw error;
  }
}

export async function cancelSend(token: string, threadId: string, sendId: string): Promise<SendStatus> {
  try {
    return await requestJson(`/threads/${encodeURIComponent(threadId)}/sends/${encodeURIComponent(sendId)}`, { method: "DELETE" }, token);
  } catch (error) {
    if (error instanceof PoloApiError && error.status === 410 && error.code === "send_post_deleted") return { state: "cancelled" };
    throw error;
  }
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
