import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposeController, safeCapturedAt, type ComposeDraft, type ComposeState, type SendTransport } from "./compose";
import { createPostFromImmich, uploadLocalPost, type PostSummary } from "./api";

const post = { id: "one-logical-post" } as PostSummary;
function fixture(source: "immich" | "phone" | "camera" = "immich") {
  const states: ComposeState[] = [];
  const id = vi.fn(() => "test-send-identity");
  const composer = new ComposeController(id, (state) => states.push(state));
  const media = source === "immich"
    ? { source, asset: { id: "old-asset", type: "video" as const, capturedAt: null, width: null, height: null, durationMs: null } }
    : { source, file: { uri: "file:///clip.mp4", filename: "clip.mp4", contentType: "video/mp4" }, fileId: "stable-file-id", mediaType: "video" as const, capturedAt: safeCapturedAt("invalid EXIF") };
  const draft: ComposeDraft = { threadId: "original-thread", destination: "Bob", connectionId: "own-connection", media, caption: "caption", scheduleMinutes: "" };
  const transport: SendTransport = {
    status: vi.fn(async () => ({ state: "retryable" as const })),
    cancel: vi.fn(async () => ({ state: "cancelled" as const })),
    send: vi.fn(async () => post),
  };
  composer.select(draft);
  return { composer, draft, transport, states, id };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("deliberate composition", () => {
  it.each(["immich", "phone", "camera"] as const)("selects %s without sending; confirms the caption and original destination", async (source) => {
    const f = fixture(source);
    expect(f.transport.send).not.toHaveBeenCalled();
    expect(f.id).not.toHaveBeenCalled();
    f.composer.edit({ caption: "reviewed caption" });
    expect(await f.composer.confirm(f.transport)).toBe(post);
    expect(f.transport.send).toHaveBeenCalledWith(expect.objectContaining({ threadId: "original-thread", caption: "reviewed caption", media: f.draft.media, sendId: "test-send-identity" }), expect.any(Function), false);
    expect(f.composer.state.draft).toBeNull();
    expect(f.composer.state.phase).toBe("sent");
  });
  it("supports change/remove/cancel before sending without losing caption on media changes", () => {
    const f = fixture();
    f.composer.edit({ media: null });
    expect(f.composer.state.draft?.caption).toBe("caption");
    f.composer.select({ ...f.composer.state.draft!, media: fixture("phone").draft.media });
    expect(f.composer.state.draft?.media?.source).toBe("phone");
    f.composer.cancel();
    expect(f.composer.state.draft).toBeNull();
    expect(f.transport.send).not.toHaveBeenCalled();
  });
  it("ignores invalid optional metadata and supports EXIF/ISO dates", () => {
    expect(safeCapturedAt("bad date")).toBeUndefined();
    expect(safeCapturedAt(null)).toBeUndefined();
    expect(safeCapturedAt(123)).toBeUndefined();
    expect(safeCapturedAt("2020:01:02 03:04:05")).toMatch(/^2020-01-02T/);
    expect(safeCapturedAt("2020-01-02T03:04:05Z")).toBe("2020-01-02T03:04:05.000Z");
  });
  it("validates schedule before sending and permits editing invalid input", async () => {
    const f = fixture();
    f.composer.edit({ scheduleMinutes: "not a number" });
    await f.composer.confirm(f.transport);
    expect(f.transport.send).not.toHaveBeenCalled();
    expect(f.composer.state.draft?.scheduleMinutes).toBe("not a number");
    expect(f.composer.state.attempt).toBeNull();
    f.composer.edit({ scheduleMinutes: "5" });
    await f.composer.confirm(f.transport);
    expect(f.transport.send).toHaveBeenCalledOnce();
  });
  it("retains draft and immutable identity/schedule through recovery; retries one logical send", async () => {
    const f = fixture("camera");
    f.composer.edit({ scheduleMinutes: "5" });
    vi.mocked(f.transport.send).mockRejectedValueOnce(new Error("offline"));
    await f.composer.confirm(f.transport);
    const first = f.composer.state.attempt;
    expect(f.composer.state.draft).toEqual({ ...f.draft, scheduleMinutes: "5" });
    expect(f.composer.state.phase).toBe("failed");
    f.composer.edit({ caption: "must not change an ambiguous send" });
    f.composer.select({ ...f.draft, threadId: "wrong-thread" });
    expect(f.composer.state.attempt).toBe(first);
    await f.composer.confirm(f.transport);
    expect(f.transport.status).toHaveBeenCalledWith(first);
    expect(vi.mocked(f.transport.send).mock.calls[1]?.[0]).toBe(first);
    expect(f.id).toHaveBeenCalledOnce();
    expect(f.composer.state.draft).toBeNull();
  });
  it("reconciles a lost response without sending again or losing the draft during the check", async () => {
    const f = fixture();
    vi.mocked(f.transport.send).mockRejectedValueOnce(new Error("response lost"));
    await f.composer.confirm(f.transport);
    expect(f.composer.state.draft).toEqual(f.draft);
    vi.mocked(f.transport.status).mockResolvedValue({ state: "completed", result: { post } });
    expect(await f.composer.confirm(f.transport)).toBe(post);
    expect(f.transport.send).toHaveBeenCalledOnce();
    expect(f.composer.state.draft).toBeNull();
  });
  it("resumes a checkpointed upload as preparation without reuploading bytes", async () => {
    const f = fixture("phone");
    vi.mocked(f.transport.send).mockRejectedValueOnce(new Error("metadata unavailable"));
    await f.composer.confirm(f.transport);
    vi.mocked(f.transport.status).mockResolvedValue({ state: "retryable", uploadRequired: false });
    await f.composer.confirm(f.transport);
    expect(vi.mocked(f.transport.send).mock.calls[1]?.[2]).toBe(true);
    expect(f.states.slice(-2)[0]?.phase).toBe("preparing");
  });
  it("keeps an in-flight draft and prevents double taps from starting another request", async () => {
    const f = fixture("phone");
    let resolve!: (value: PostSummary) => void;
    vi.mocked(f.transport.send).mockReturnValue(new Promise((r) => { resolve = r; }));
    const first = f.composer.confirm(f.transport);
    expect(f.composer.state.phase).toBe("uploading");
    expect(f.composer.state.draft).toEqual(f.draft);
    await f.composer.confirm(f.transport);
    expect(f.transport.send).toHaveBeenCalledOnce();
    f.composer.cancel();
    expect(f.composer.state.draft).toEqual(f.draft);
    resolve(post);
    await first;
  });
  it("keeps draft when status checking fails or a send remains in progress", async () => {
    const f = fixture();
    vi.mocked(f.transport.send).mockRejectedValueOnce(new Error("lost result"));
    await f.composer.confirm(f.transport);
    vi.mocked(f.transport.status).mockRejectedValueOnce(new Error("offline"));
    await f.composer.confirm(f.transport);
    expect(f.composer.state.draft).toEqual(f.draft);
    vi.mocked(f.transport.status).mockResolvedValue({ state: "processing" });
    await f.composer.confirm(f.transport);
    expect(f.transport.send).toHaveBeenCalledOnce();
    expect(f.composer.state.draft).toEqual(f.draft);
  });
  it("discards only after server cancellation, or acknowledges a completed result", async () => {
    const f = fixture();
    vi.mocked(f.transport.send).mockRejectedValueOnce(new Error("offline"));
    await f.composer.confirm(f.transport);
    vi.mocked(f.transport.cancel).mockRejectedValueOnce(new Error("still offline"));
    await f.composer.discardFailed(f.transport);
    expect(f.composer.state.draft).toEqual(f.draft);
    vi.mocked(f.transport.cancel).mockResolvedValue({ state: "completed", result: { post } });
    expect(await f.composer.discardFailed(f.transport)).toBe(post);
    expect(f.composer.state.draft).toBeNull();
  });
  it("a deliberate second share receives a new identity", async () => {
    const f = fixture();
    f.id.mockReturnValueOnce("first-send").mockReturnValueOnce("second-send");
    await f.composer.confirm(f.transport);
    f.composer.select(f.draft);
    await f.composer.confirm(f.transport);
    expect(vi.mocked(f.transport.send).mock.calls.map(([attempt]) => attempt.sendId)).toEqual(["first-send", "second-send"]);
  });
  it("an old send completion cannot clear a replacement session's draft", async () => {
    const f = fixture();
    let resolve!: (value: PostSummary) => void;
    vi.mocked(f.transport.send).mockReturnValue(new Promise((r) => { resolve = r; }));
    const old = f.composer.confirm(f.transport);
    f.composer.reset();
    f.composer.select({ ...f.draft, caption: "new-session draft" });
    resolve(post);
    await old;
    expect(f.composer.state.draft?.caption).toBe("new-session draft");
  });
});

describe("client send wire format", () => {
  it("forwards local captions, capture time, fixed schedule and retry identities", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ post, upload: { duplicate: false } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadLocalPost("session", "thread", "connection", { uri: "blob:test", filename: "clip.mp4", contentType: "video/mp4", webFile: new Blob(["test"]) }, {
      caption: "Camera caption", capturedAt: "2020-01-02T03:04:05.000Z", visibleAt: "2030-01-02T03:04:05.000Z", sendId: "stable-send", fileId: "stable-file",
    });
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(url).searchParams;
    expect(query.get("caption")).toBe("Camera caption");
    expect(query.get("capturedAt")).toBe("2020-01-02T03:04:05.000Z");
    expect(query.get("visibleAt")).toBe("2030-01-02T03:04:05.000Z");
    expect(query.get("sendId")).toBe("stable-send");
    expect(query.get("fileId")).toBe("stable-file");
    expect(request.body).toBeInstanceOf(FormData);
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer session");
  });
  it("sends existing media with a logical send ID and resumes canonical uploads without a body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ post, upload: { duplicate: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createPostFromImmich("session", "thread", { connectionId: "connection", assetId: "asset", sendId: "stable-send", caption: "caption" });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).sendId).toBe("stable-send");
    await uploadLocalPost("session", "thread", "connection", { uri: "file:///no-longer-needed", filename: "clip.mp4", contentType: "video/mp4" }, { skipUpload: true, sendId: "stable-send", fileId: "file-id" });
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body).toBeUndefined();
  });
});

describe("real transport progress and failure callbacks", () => {
  function wireFixture() {
    let xhr!: UploadXHR;
    class UploadXHR {
      status = 201;
      responseText = JSON.stringify({ post, upload: { duplicate: false } });
      timeout = 0;
      headers: Record<string, string> = {};
      body?: FormData;
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
      onabort?: () => void;
      upload: { onprogress?: (event: { lengthComputable: boolean; total: number; loaded: number }) => void; onload?: () => void } = {};
      constructor() { xhr = this; }
      open() {}
      setRequestHeader(key: string, value: string) { this.headers[key] = value; }
      send(body: FormData) { this.body = body; }
    }
    vi.stubGlobal("XMLHttpRequest", UploadXHR);
    return () => xhr;
  }
  it("reports only observed computable bytes and prepares after body transfer", async () => {
    const current = wireFixture();
    const onProgress = vi.fn();
    const onPreparing = vi.fn();
    const pending = uploadLocalPost("session", "thread", "connection", { uri: "blob:fixture", filename: "clip.mp4", contentType: "video/mp4", webFile: new Blob(["bytes"]) }, { caption: "caption", onProgress, onPreparing });
    const xhr = current();
    expect(xhr.headers.Authorization).toBe("Bearer session");
    expect(xhr.body).toBeInstanceOf(FormData);
    xhr.upload.onprogress?.({ lengthComputable: false, total: 0, loaded: 40 });
    expect(onProgress).not.toHaveBeenCalled();
    xhr.upload.onprogress?.({ lengthComputable: true, total: 100, loaded: 40 });
    expect(onProgress).toHaveBeenCalledWith(0.4);
    expect(onPreparing).not.toHaveBeenCalled();
    xhr.upload.onload?.();
    expect(onPreparing).toHaveBeenCalledOnce();
    xhr.onload?.();
    expect((await pending).post).toEqual(post);
  });
  it("treats network loss as an unknown result requiring retry reconciliation", async () => {
    const current = wireFixture();
    const pending = uploadLocalPost("session", "thread", "connection", { uri: "file:///clip.mp4", filename: "clip.mp4", contentType: "video/mp4" }, { onPreparing: vi.fn() });
    const rejected = expect(pending).rejects.toThrow("draft is kept");
    current().onerror?.();
    await rejected;
  });
});
