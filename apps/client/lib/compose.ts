import type { ImmichAsset, LocalUploadFile, PostSummary } from "./api";

export type DraftMedia =
  | { source: "immich"; asset: ImmichAsset }
  | { source: "phone" | "camera"; file: LocalUploadFile; mediaType: "image" | "video"; capturedAt?: string; fileId: string };
export interface ComposeDraft {
  threadId: string;
  destination: string;
  connectionId: string;
  media: DraftMedia | null;
  caption: string;
  scheduleMinutes: string;
}
export interface SendAttempt extends ComposeDraft {
  media: DraftMedia;
  sendId: string;
  visibleAt?: string;
}
export type SendPhase = "review" | "checking" | "uploading" | "preparing" | "sent" | "failed";
export interface ComposeState { draft: ComposeDraft | null; attempt: SendAttempt | null; phase: SendPhase; error: string | null }
export type SendStatus = { state: "missing" | "processing" | "retryable" | "cancelled"; uploadRequired?: boolean } | { state: "completed"; result: { post: PostSummary } };
export interface SendTransport {
  status(attempt: SendAttempt): Promise<SendStatus>;
  cancel(attempt: SendAttempt): Promise<SendStatus>;
  send(attempt: SendAttempt, onPreparing: () => void, skipUpload: boolean): Promise<PostSummary>;
}

function knownPost(post: PostSummary | undefined): PostSummary {
  if (!post?.id) throw new Error("Could not read the server result. Your draft is kept; retry to check this send.");
  return post;
}

/** Optional EXIF is a hint, never a prerequisite for uploading valid media. */
export function safeCapturedAt(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function scheduledInstant(value: string, now = Date.now()): string | undefined {
  if (!value.trim()) return undefined;
  const minutes = Number(value);
  const time = now + minutes * 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(new Date(time).getTime())) {
    throw new Error("Schedule minutes must be greater than zero and within a valid date range");
  }
  return new Date(time).toISOString();
}

/** One foreground send, tied to its original destination, with immutable retry input. */
export class ComposeController {
  private revision = 0;
  state: ComposeState = { draft: null, attempt: null, phase: "review", error: null };
  constructor(private readonly id: () => string, private readonly notify: (state: ComposeState) => void) {}
  get sending() { return ["checking", "uploading", "preparing"].includes(this.state.phase); }
  private update(next: ComposeState) { this.state = next; this.notify(next); }
  select(draft: ComposeDraft) {
    if (this.sending || this.state.attempt) return;
    this.revision++;
    this.update({ draft, attempt: null, phase: "review", error: null });
  }
  edit(fields: Partial<Pick<ComposeDraft, "caption" | "scheduleMinutes" | "media">>) {
    if (!this.state.draft || this.sending || this.state.attempt) return;
    this.update({ ...this.state, draft: { ...this.state.draft, ...fields }, phase: "review", error: null });
  }
  cancel() {
    if (this.sending || this.state.attempt) return;
    this.update({ draft: null, attempt: null, phase: "review", error: null });
  }
  reset() { this.revision++; this.update({ draft: null, attempt: null, phase: "review", error: null }); }
  async confirm(transport: SendTransport): Promise<PostSummary | undefined> {
    if (this.sending || !this.state.draft?.media) return;
    const revision = this.revision;
    const retry = this.state.attempt;
    let skipUpload = false;
    let attempt: SendAttempt;
    try {
      const draft = this.state.draft;
      attempt = retry ?? { ...draft, media: draft.media!, caption: draft.caption.trim(), sendId: this.id(), visibleAt: scheduledInstant(draft.scheduleMinutes) };
    } catch (error) {
      this.update({ ...this.state, phase: "failed", error: error instanceof Error ? error.message : "Invalid schedule" });
      return;
    }
    this.update({ ...this.state, attempt, phase: "checking", error: null });
    try {
      if (retry) {
        const status = await transport.status(attempt);
        if (revision !== this.revision) return;
        skipUpload = status.state === "retryable" && status.uploadRequired === false;
        if (status.state === "completed") {
          const post = knownPost(status.result?.post);
          this.update({ draft: null, attempt: null, phase: "sent", error: null });
          return post;
        }
        if (status.state === "processing") throw new Error("This send is still processing. Check again shortly.");
        if (status.state === "cancelled") throw new Error("This send was cancelled. Check and discard the draft.");
      }
      this.update({ ...this.state, phase: attempt.media.source === "immich" || skipUpload ? "preparing" : "uploading" });
      const post = await transport.send(attempt, () => { if (revision === this.revision) this.update({ ...this.state, phase: "preparing" }); }, skipUpload);
      if (revision !== this.revision) return;
      knownPost(post);
      this.update({ draft: null, attempt: null, phase: "sent", error: null });
      return post;
    } catch (error) {
      if (revision !== this.revision) return;
      this.update({ ...this.state, phase: "failed", error: error instanceof Error ? error.message : "Send failed" });
      return;
    }
  }
  /** Discard only after authoritative reconciliation proves no completed/in-flight send. */
  async discardFailed(transport: SendTransport): Promise<PostSummary | undefined> {
    const attempt = this.state.attempt;
    if (!attempt || this.sending) return;
    const revision = this.revision;
    this.update({ ...this.state, phase: "checking", error: null });
    try {
      const status = await transport.cancel(attempt);
      if (revision !== this.revision) return;
      if (status.state === "processing") throw new Error("This send is still processing. Check again shortly.");
      if (status.state !== "cancelled" && status.state !== "completed") throw new Error("Could not confirm cancellation. Your draft is kept.");
      const post = status.state === "completed" ? knownPost(status.result?.post) : undefined;
      this.reset();
      if (status.state === "completed") {
        this.update({ ...this.state, phase: "sent" });
        return post;
      }
      return undefined;
    } catch (error) {
      if (revision !== this.revision) return;
      this.update({ ...this.state, phase: "failed", error: error instanceof Error ? error.message : "Could not check send" });
      return;
    }
  }
}
