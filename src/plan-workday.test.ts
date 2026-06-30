import { describe, expect, it } from "vitest";

import { planExplicitWorkday } from "./plan-workday.js";

describe("planExplicitWorkday", () => {
  it("creates a meeting-safe plan and an exactly eight-hour timesheet", () => {
    const rundown = planExplicitWorkday({
      date: "2026-06-30",
      issues: [
        {
          key: "HUB-235",
          summary: "Shared fragments",
          description: "",
          status: "In Progress",
          priority: "High",
          dueDate: null,
          updatedAt: "2026-06-30T12:00:00.000Z",
          assignee: "Sean Mahoney",
          mentionsCurrentUser: false,
          blocked: false
        }
      ],
      meetings: [
        {
          id: "meeting-1",
          title: "Stand-up",
          start: "2026-06-30T14:00:00.000Z",
          end: "2026-06-30T14:30:00.000Z",
          showAs: "busy"
        }
      ],
      mail: [],
      teams: []
    });

    const meeting = rundown.schedule.find((item) => item.kind === "meeting");
    const work = rundown.schedule.find((item) => item.kind === "work");

    expect(rundown.timesheet.totalMinutes).toBe(480);
    expect(meeting).toBeDefined();
    expect(work).toBeDefined();
    expect(Date.parse(work!.start)).toBeGreaterThanOrEqual(Date.parse(meeting!.end));
  });
});
