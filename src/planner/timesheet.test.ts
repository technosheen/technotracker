import { describe, expect, it } from "vitest";

import type { ScheduleItem } from "../contracts.js";
import { generateTimesheet } from "./timesheet.js";

describe("timesheet balancing", () => {
  it("totals exactly eight hours and maps meetings to INT-58", () => {
    const schedule: ScheduleItem[] = [
      {
        kind: "meeting",
        id: "m1",
        title: "Standup",
        start: "2026-06-29T13:00:00.000Z",
        end: "2026-06-29T14:00:00.000Z",
        showAs: "busy"
      },
      {
        kind: "work",
        id: "w1",
        issueKey: "HUB-235",
        title: "HUBSPOT | HUB-235",
        start: "2026-06-29T14:00:00.000Z",
        end: "2026-06-29T16:00:00.000Z",
        showAs: "free",
        plannerOwned: true,
        score: 90
      }
    ];

    const timesheet = generateTimesheet(schedule);
    expect(timesheet.totalMinutes).toBe(480);
    expect(timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(480);
    expect(timesheet.entries[0]?.code).toBe("INT-58");
    expect(timesheet.entries[1]?.code).toBe("HUB-235");
    expect(timesheet.entries.at(-1)?.source).toBe("internal");
  });
});
