import type { PostTiming } from "./types.js";

export function isRecipientVisible(post: PostTiming): boolean {
  return post.status === "published" && post.publishedAt !== null;
}

export function canEditScheduledPost(post: PostTiming): boolean {
  return post.status === "scheduled";
}

export function scheduleFor(visibleAt: Date, now = new Date()): PostTiming {
  if (!Number.isFinite(visibleAt.getTime())) {
    throw new Error("visibleAt must be a valid date");
  }
  if (visibleAt.getTime() <= now.getTime()) {
    throw new Error("visibleAt must be in the future");
  }

  return {
    status: "scheduled",
    visibleAt,
    publishedAt: null,
  };
}

/**
 * Pure, idempotent state transition used by the durable scheduler.
 * Persistence code must still claim/update rows transactionally.
 */
export function publishIfDue(post: PostTiming, now = new Date()): PostTiming {
  if (post.status !== "scheduled") {
    return post;
  }
  if (post.visibleAt.getTime() > now.getTime()) {
    return post;
  }

  return {
    ...post,
    status: "published",
    publishedAt: now,
  };
}
