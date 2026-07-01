import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  type DailyRundown
} from "../contracts.js";
import { prepareWorkdayReconciliation } from "../planner/reconciliation.js";
import { pruneDraftStore, saveDatedDraft } from "./reconciliation-storage.js";

const rundown: DailyRundown = {
  date: "2026-06-30",
  summary: "Plan",
  priorities: [],
  blockers: [],
  actionItems: [],
  schedule: [],
  timesheet: { entries: [], totalMinutes: 480 }
};

describe("reconciliation draft storage", () => {
  it("restores valid dated drafts and expires drafts older than 14 days", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const now = new Date("2026-06-30T20:00:00.000Z");
    const current = saveDatedDraft({}, draft, draft.entries, now);
    const store = {
      ...current,
      "2026-06-01": {
        ...current["2026-06-30"]!,
        savedAt: "2026-06-01T20:00:00.000Z",
        draft: { ...draft, date: "2026-06-01" }
      }
    };

    expect(pruneDraftStore(store, now)).toEqual(current);
  });

  it("drops malformed entries without affecting other local configuration", () => {
    const mixed = {
      "2026-06-30": {
        savedAt: "2026-06-30T20:00:00.000Z",
        draft: { broken: true },
        entries: []
      },
      unrelatedConfiguration: { role: "Developer" }
    };

    expect(
      pruneDraftStore(mixed, new Date("2026-06-30T21:00:00.000Z"))
    ).toEqual({});
    expect(mixed.unrelatedConfiguration).toEqual({ role: "Developer" });
  });
});
