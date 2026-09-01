import { describe, expect, it } from "vitest";
import { isVideoWatched } from "./watch.js";

describe("watch completion", () => {
  it("does not mark a video watched just because it was started", () => {
    expect(isVideoWatched({ durationMs: 60_000, playbackPositionMs: 5_000 })).toBe(false);
  });

  it("marks a video watched at 90 percent", () => {
    expect(isVideoWatched({ durationMs: 60_000, playbackPositionMs: 54_000 })).toBe(true);
  });

  it("marks a video watched when only a tiny tail remains", () => {
    expect(isVideoWatched({ durationMs: 120_000, playbackPositionMs: 118_000 })).toBe(true);
  });
});
