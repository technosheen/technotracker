import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  type ActualEntry,
  type DailyRundown,
  type TimesheetConfiguration
} from "../contracts.js";
import {
  finalizeWorkdayReconciliation,
  generateReconciledTimesheet,
  prepareWorkdayReconciliation
} from "./reconciliation.js";

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
      {
        id: "planned:standup",
        code: "INT-58",
        description: "Standup",
        minutes: 30,
        source: "meeting"
      }
    ],
    totalMinutes: 480
  }
};

describe("workday reconciliation", () => {
  it("initializes suggestions from the plan and refreshed context", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION,
      refreshedContext: {
        meetings: [
          {
            id: "standup",
            title: "Standup",
            start: "2026-06-30T13:00:00.000Z",
            end: "2026-06-30T14:00:00.000Z",
            showAs: "busy"
          }
        ],
        workItems: [
          {
            key: "HUB-12",
            summary: "Implement shared module",
            status: "Done",
            priority: "High",
            dueDate: null,
            updatedAt: "2026-06-30T20:00:00.000Z",
            assignee: "Sean",
            mentionsCurrentUser: false,
            blocked: false
          }
        ],
        suggestions: [
          {
            id: "actual:unplanned:review",
            category: "unplanned",
            title: "Production review",
            issueKey: "DTC-99",
            actualMinutes: 45,
            completionStatus: "unplanned",
            sourceReferences: [{ type: "teams", id: "message-1" }]
          }
        ]
      }
    });

    expect(draft.entries).toHaveLength(4);
    expect(draft.entries[0]).toMatchObject({
      actualMinutes: 60,
      confirmationState: "suggested",
      timesheetCode: "INT-58"
    });
    expect(draft.entries[1]?.sourceReferences).toContainEqual(
      expect.objectContaining({ type: "work_item", id: "HUB-12" })
    );
    expect(draft.entries.at(-1)).toMatchObject({
      issueKey: "DTC-99",
      plannedItemId: null,
      timesheetCode: "DTC-99"
    });
  });

  it("reconciles partial, skipped, replaced, and unplanned work", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const entries = confirm(draft.entries);
    entries[0] = { ...entries[0]!, actualMinutes: 60 };
    entries[1] = {
      ...entries[1]!,
      actualMinutes: 45,
      completionStatus: "partial"
    };
    entries[2] = {
      ...entries[2]!,
      issueKey: "DTC-77",
      actualMinutes: 30,
      completionStatus: "replaced",
      timesheetCode: "DTC-77"
    };
    entries.push(unplannedEntry("manual-1", 60));

    const result = finalizeWorkdayReconciliation({ draft, entries });

    expect(result.changes.map((change) => change.type)).toEqual(
      expect.arrayContaining([
        "duration_changed",
        "status_changed",
        "work_replaced",
        "code_changed",
        "unplanned_work"
      ])
    );
    expect(result.carryover).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issueKey: "HUB-12", remainingMinutes: 75 }),
        expect.objectContaining({ issueKey: "DTC-44", remainingMinutes: 60 })
      ])
    );
    expect(result.timesheet.totalMinutes).toBe(480);
  });

  it("carries all skipped planned minutes forward and excludes the zero entry", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const entries = confirm(draft.entries);
    entries[1] = {
      ...entries[1]!,
      actualMinutes: 0,
      completionStatus: "skipped"
    };

    const result = finalizeWorkdayReconciliation({ draft, entries });
    expect(result.carryover).toContainEqual(
      expect.objectContaining({
        issueKey: "HUB-12",
        remainingMinutes: 120,
        reason: "skipped"
      })
    );
    expect(
      result.timesheet.entries.some((entry) => entry.id.includes("hub-12"))
    ).toBe(false);
  });

  it("excludes meetings and zero-minute entries, rounds, then balances fixed policies", () => {
    for (const basis of [
      "fixed_day",
      "project_budget",
      "billable_split"
    ] as const) {
      const configuration = config({
        countMeetings: false,
        roundingMinutes: 15,
        timeTrackingBasis: basis
      });
      const entries = [
        meetingEntry(37),
        workEntry("work-1", "HUB-12", 62),
        workEntry("work-2", "DTC-44", 0)
      ];
      const { timesheet } = generateReconciledTimesheet(entries, configuration);

      expect(timesheet.entries.some((entry) => entry.source === "meeting")).toBe(
        false
      );
      expect(timesheet.entries[0]).toMatchObject({ minutes: 60 });
      expect(timesheet.entries.at(-1)).toMatchObject({
        code: configuration.internalCode,
        minutes: 420
      });
      expect(timesheet.totalMinutes).toBe(480);
    }
  });

  it("applies cap, include-actual, flag-for-review, and actual-time policies", () => {
    const overtimeEntries = [
      meetingEntry(60),
      workEntry("work-1", "HUB-12", 300),
      workEntry("work-2", "DTC-44", 180)
    ];
    const capped = generateReconciledTimesheet(
      overtimeEntries,
      config({ overtimePolicy: "cap_at_target" })
    );
    expect(capped.timesheet.totalMinutes).toBe(480);
    expect(capped.timesheet.trimmedMinutes).toBe(60);
    expect(capped.timesheet.entries.at(-1)).toMatchObject({ minutes: 120 });
    expect(capped.warnings[0]).toContain("trimming 60 minutes");

    const included = generateReconciledTimesheet(
      overtimeEntries,
      config({ overtimePolicy: "include_actual" })
    );
    expect(included.timesheet.totalMinutes).toBe(540);
    expect(included.requiresReview).toBe(false);

    const flagged = generateReconciledTimesheet(
      overtimeEntries,
      config({ overtimePolicy: "flag_for_review" })
    );
    expect(flagged.timesheet.totalMinutes).toBe(540);
    expect(flagged.requiresReview).toBe(true);

    const actualShort = generateReconciledTimesheet(
      [workEntry("work-1", "HUB-12", 120)],
      config({
        timeTrackingBasis: "actual_time",
        overtimePolicy: "include_actual"
      })
    );
    expect(actualShort.timesheet.totalMinutes).toBe(120);
    expect(
      actualShort.timesheet.entries.some(
        (entry) => entry.id === "reconciled:balance"
      )
    ).toBe(false);
  });

  it("rejects unconfirmed suggestions, negative durations, duplicates, and invalid codes", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    expect(() =>
      finalizeWorkdayReconciliation({ draft, entries: draft.entries })
    ).toThrow("Confirm all app-derived suggestions");

    const entries = confirm(draft.entries);
    expect(() =>
      finalizeWorkdayReconciliation({
        draft,
        entries: [entries[0]!, { ...entries[0]! }]
      })
    ).toThrow("Duplicate reconciliation entry ID");
    expect(() =>
      finalizeWorkdayReconciliation({
        draft,
        entries: [{ ...entries[0]!, actualMinutes: -1 }]
      })
    ).toThrow();
    expect(() =>
      finalizeWorkdayReconciliation({
        draft,
        entries: [{ ...entries[0]!, timesheetCode: "" }]
      })
    ).toThrow();
  });

  it("is idempotent for identical confirmed input", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const input = { draft, entries: confirm(draft.entries) };
    expect(finalizeWorkdayReconciliation(input)).toEqual(
      finalizeWorkdayReconciliation(input)
    );
  });
});

function confirm(entries: ActualEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    confirmationState: "confirmed" as const
  }));
}

function config(
  patch: Partial<TimesheetConfiguration>
): TimesheetConfiguration {
  return { ...DEFAULT_TIMESHEET_CONFIGURATION, ...patch };
}

function meetingEntry(minutes: number): ActualEntry {
  return {
    id: "meeting",
    plannedItemId: "meeting",
    category: "meeting",
    title: "Meeting",
    plannedIssueKey: null,
    issueKey: null,
    plannedMinutes: minutes,
    actualMinutes: minutes,
    completionStatus: "completed",
    notes: "",
    sourceReferences: [],
    confirmationState: "confirmed",
    timesheetCode: "INT-58"
  };
}

function workEntry(
  id: string,
  issueKey: string,
  minutes: number
): ActualEntry {
  return {
    id,
    plannedItemId: id,
    category: "work",
    title: issueKey,
    plannedIssueKey: issueKey,
    issueKey,
    plannedMinutes: minutes,
    actualMinutes: minutes,
    completionStatus: "completed",
    notes: "",
    sourceReferences: [],
    confirmationState: "confirmed",
    timesheetCode: issueKey
  };
}

function unplannedEntry(id: string, minutes: number): ActualEntry {
  return {
    ...workEntry(id, "HUB-99", minutes),
    plannedItemId: null,
    category: "unplanned",
    plannedIssueKey: null,
    plannedMinutes: 0,
    completionStatus: "unplanned"
  };
}
