import type { MediaPlaybackFacts } from "./types.js";

export const WATCH_FRACTION_THRESHOLD = 0.9;
export const WATCH_REMAINING_MS_THRESHOLD = 3_000;

/**
 * Count a video as watched after 90% playback, or when at most 3 seconds remain.
 * The latter prevents very short credits/tails from keeping a message unread.
 */
export function isVideoWatched(input: MediaPlaybackFacts): boolean {
  const { durationMs, playbackPositionMs } = input;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
  if (!Number.isFinite(playbackPositionMs) || playbackPositionMs < 0) return false;

  const clamped = Math.min(playbackPositionMs, durationMs);
  const fraction = clamped / durationMs;
  const remaining = durationMs - clamped;
  return fraction >= WATCH_FRACTION_THRESHOLD || remaining <= WATCH_REMAINING_MS_THRESHOLD;
}
