import { describe, expect, it } from "vitest";

import { normalizeMeetingsToDay } from "./rundown.js";

describe("normalizeMeetingsToDay", () => {
  const dayStart = "2026-06-29T13:00:00.000Z";
  const dayEnd = "2026-06-29T21:00:00.000Z";

  it("removes meetings entirely outside the workday", () => {
    expect(
      normalizeMeetingsToDay(
        [
          meeting("before", "2026-06-29T11:00:00.000Z", "2026-06-29T12:00:00.000Z"),
          meeting("after", "2026-06-29T22:00:00.000Z", "2026-06-29T23:00:00.000Z")
        ],
        dayStart,
        dayEnd
      )
    ).toEqual([]);
  });

  it("clips meetings that cross a workday boundary", () => {
    expect(
      normalizeMeetingsToDay(
        [
          meeting("early", "2026-06-29T12:30:00.000Z", "2026-06-29T13:30:00.000Z"),
          meeting("late", "2026-06-29T20:30:00.000Z", "2026-06-29T21:30:00.000Z")
        ],
        dayStart,
        dayEnd
      )
    ).toMatchObject([
      { id: "early", start: dayStart, end: "2026-06-29T13:30:00.000Z" },
      { id: "late", start: "2026-06-29T20:30:00.000Z", end: dayEnd }
    ]);
  });
});

function meeting(id: string, start: string, end: string) {
  return { id, title: id, start, end, showAs: "busy" as const };
}
