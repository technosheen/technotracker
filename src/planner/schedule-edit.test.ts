import { describe, expect, it } from "vitest";
import { DEFAULT_TIMESHEET_CONFIGURATION, type DailyRundown } from "../contracts.js";
import { adjustScheduleItem } from "./schedule-edit.js";

const rundown: DailyRundown = {
  date: "2026-06-30",
  summary: "A planned day.",
  priorities: [],
  blockers: [],
  actionItems: [],
  schedule: [
    {
      kind: "meeting",
      id: "standup",
      title: "Standup",
      start: "2026-06-30T13:00:00.000Z",
      end: "2026-06-30T13:30:00.000Z",
      showAs: "busy"
    },
    {
      kind: "work",
      id: "hub-12",
      issueKey: "HUB-12",
      title: "Implement shared module",
      start: "2026-06-30T14:00:00.000Z",
      end: "2026-06-30T16:00:00.000Z",
      showAs: "free",
      plannerOwned: true,
      score: 90
    },
    {
      kind: "work",
      id: "dtc-44",
      issueKey: "DTC-44",
      title: "Fix checkout bug",
      start: "2026-06-30T16:00:00.000Z",
      end: "2026-06-30T17:00:00.000Z",
      showAs: "free",
      plannerOwned: true,
      score: 70
    }
  ],
  timesheet: {
    entries: [
      { id: "planned:standup", code: "INT-58", description: "Standup", minutes: 30, source: "meeting" },
      {
        id: "planned:hub-12",
        code: "HUB-12",
        description: "Implement shared module",
        minutes: 120,
        source: "work_item"
      },
      {
        id: "planned:dtc-44",
        code: "DTC-44",
        description: "Fix checkout bug",
        minutes: 60,
        source: "work_item"
      }
    ],
    totalMinutes: 210
  }
};

describe("adjustScheduleItem", () => {
  it("moves a work block to a free slot and rebalances the timesheet", () => {
    const updated = adjustScheduleItem({
      rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION,
      itemId: "dtc-44",
      start: "2026-06-30T17:00:00.000Z",
      end: "2026-06-30T18:00:00.000Z"
    });

    const moved = updated.schedule.find((item) => item.id === "dtc-44");
    expect(moved?.start).toBe("2026-06-30T17:00:00.000Z");
    expect(moved?.end).toBe("2026-06-30T18:00:00.000Z");
    expect(updated.schedule.map((item) => item.id)).toEqual(["standup", "hub-12", "dtc-44"]);
    expect(updated.timesheet.totalMinutes).toBe(480);
  });

  it("rejects an unknown item id", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "missing",
        start: "2026-06-30T17:00:00.000Z",
        end: "2026-06-30T18:00:00.000Z"
      })
    ).toThrow(/was not found/);
  });

  it("rejects rescheduling a meeting", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "standup",
        start: "2026-06-30T13:30:00.000Z",
        end: "2026-06-30T14:00:00.000Z"
      })
    ).toThrow(/immutable/);
  });

  it("rejects an end time at or before the start", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "dtc-44",
        start: "2026-06-30T17:00:00.000Z",
        end: "2026-06-30T17:00:00.000Z"
      })
    ).toThrow(/End must be after start/);
  });

  it("rejects a move that silently changes the block duration", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "dtc-44",
        start: "2026-06-30T17:00:00.000Z",
        end: "2026-06-30T18:30:00.000Z"
      })
    ).toThrow(/preserve its 60-minute duration/);
  });

  it("rejects overlapping a meeting's buffer", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "dtc-44",
        start: "2026-06-30T13:35:00.000Z",
        end: "2026-06-30T14:35:00.000Z"
      })
    ).toThrow(/overlap/);
  });

  it("rejects overlapping another work block", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "dtc-44",
        start: "2026-06-30T15:00:00.000Z",
        end: "2026-06-30T16:00:00.000Z"
      })
    ).toThrow(/overlap/);
  });

  it("rejects moving a block outside the workday", () => {
    expect(() =>
      adjustScheduleItem({
        rundown,
        configuration: DEFAULT_TIMESHEET_CONFIGURATION,
        itemId: "dtc-44",
        start: "2026-06-30T21:00:00.000Z",
        end: "2026-06-30T22:00:00.000Z"
      })
    ).toThrow(/within the workday/);
  });
});
