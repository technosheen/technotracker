import { describe, expect, it } from "vitest";

import { assertNoOverlaps, overlaps } from "./time.js";

describe("overlap detection", () => {
  const first = { start: "2026-06-29T13:00:00.000Z", end: "2026-06-29T14:00:00.000Z" };

  it("detects intersecting intervals", () => {
    expect(
      overlaps(first, {
        start: "2026-06-29T13:30:00.000Z",
        end: "2026-06-29T14:30:00.000Z"
      })
    ).toBe(true);
  });

  it("allows adjacent intervals", () => {
    expect(
      overlaps(first, {
        start: "2026-06-29T14:00:00.000Z",
        end: "2026-06-29T15:00:00.000Z"
      })
    ).toBe(false);
  });

  it("rejects a schedule containing overlaps", () => {
    expect(() =>
      assertNoOverlaps([
        first,
        { start: "2026-06-29T13:15:00.000Z", end: "2026-06-29T13:45:00.000Z" }
      ])
    ).toThrow(/Overlapping intervals/);
  });
});
