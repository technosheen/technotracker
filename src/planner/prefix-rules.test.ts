import { describe, expect, it } from "vitest";

import { calendarTitleForIssue, timesheetCodeForIssue } from "./prefix-rules.js";

describe("prefix rules", () => {
  it.each([
    ["HUB-235", "HUBSPOT | HUB-235"],
    ["DTC-5238", "DTC | DTC-5238"],
    ["OPS-12", "INTERNAL | OPS-12"]
  ])("maps %s to %s", (key, expected) => {
    expect(calendarTitleForIssue(key)).toBe(expected);
  });

  it("uses INT-58 for non-HUB/DTC work", () => {
    expect(timesheetCodeForIssue("OPS-12")).toBe("INT-58");
  });
});
