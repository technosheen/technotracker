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

  it("balances to a configured target using company codes and rounding", () => {
    const schedule: ScheduleItem[] = [
      {
        kind: "meeting",
        id: "m1",
        title: "Standup",
        start: "2026-06-29T13:00:00.000Z",
        end: "2026-06-29T13:37:00.000Z",
        showAs: "busy"
      },
      {
        kind: "work",
        id: "w1",
        issueKey: "OPS-12",
        title: "OPERATIONS | OPS-12",
        start: "2026-06-29T14:00:00.000Z",
        end: "2026-06-29T15:02:00.000Z",
        showAs: "free",
        plannerOwned: true,
        score: 90
      }
    ];

    const timesheet = generateTimesheet(schedule, {
      version: 1,
      role: "",
      team: "",
      timeZone: "America/New_York",
      workdayStart: "09:00",
      workdayEnd: "16:30",
      targetHours: 7.5,
      workTools: ["jira"],
      calendarTools: ["outlook"],
      communicationTools: ["teams"],
      timesheetSystem: "tempo",
      timesheetSystemOther: "",
      roundingMinutes: 15,
      meetingCode: "MEET",
      internalCode: "ADMIN",
      countMeetings: true,
      requiredFields: ["ticket", "description"],
      prefixMappings: [
        { prefix: "OPS", label: "OPERATIONS", timesheetCode: "OPS-BILLABLE" }
      ]
    });

    expect(timesheet.totalMinutes).toBe(450);
    expect(timesheet.entries[0]).toMatchObject({ code: "MEET", minutes: 30 });
    expect(timesheet.entries[1]).toMatchObject({
      code: "OPS-BILLABLE",
      minutes: 60
    });
    expect(timesheet.entries.at(-1)).toMatchObject({
      code: "ADMIN",
      minutes: 360
    });
  });
});
