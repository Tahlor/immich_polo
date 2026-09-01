import { z } from "zod";

export const PostStatusSchema = z.enum(["scheduled", "published", "cancelled", "failed"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const MediaTypeSchema = z.enum(["image", "video"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export interface PostTiming {
  status: PostStatus;
  visibleAt: Date;
  publishedAt: Date | null;
}

export interface PostViewState {
  firstSeenAt: Date | null;
  watchedAt: Date | null;
  playbackPositionMs: number | null;
}

export interface MediaPlaybackFacts {
  durationMs: number;
  playbackPositionMs: number;
}

export function parseAbsoluteInstant(value: string): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) {
    throw new Error(`Invalid absolute timestamp: ${value}`);
  }
  return result;
}
