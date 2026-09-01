import { describe, expect, it } from "vitest";
import { isRecipientVisible, publishIfDue, scheduleFor } from "./scheduling.js";

const now = new Date("2026-09-01T12:00:00.000Z");

describe("scheduling", () => {
  it("keeps a future post hidden", () => {
    const post = scheduleFor(new Date("2026-09-01T13:00:00.000Z"), now);
    expect(isRecipientVisible(post)).toBe(false);
    expect(publishIfDue(post, now)).toEqual(post);
  });

  it("publishes a due post exactly once at the domain layer", () => {
    const scheduled = scheduleFor(new Date("2026-09-01T13:00:00.000Z"), now);
    const due = new Date("2026-09-01T13:00:01.000Z");
    const published = publishIfDue(scheduled, due);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toEqual(due);
    expect(isRecipientVisible(published)).toBe(true);
    expect(publishIfDue(published, new Date("2026-09-02T00:00:00.000Z"))).toBe(published);
  });

  it("rejects scheduling in the past", () => {
    expect(() => scheduleFor(new Date("2026-09-01T11:59:59.000Z"), now)).toThrow(/future/);
  });
});
