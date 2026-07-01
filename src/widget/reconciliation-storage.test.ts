import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  type DailyRundown
} from "../contracts.js";
import { prepareWorkdayReconciliation } from "../planner/reconciliation.js";
import {
  draftSourcesMatch,
  mergeDraftStores,
  pruneDraftStore,
  saveDatedDraft
} from "./reconciliation-storage.js";

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

  it("does not restore a same-day draft against a regenerated schedule", () => {
    const original = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const regenerated = prepareWorkdayReconciliation({
      originalRundown: {
        ...rundown,
        schedule: [
          {
            kind: "work",
            id: "new-work",
            issueKey: "HUB-99",
            title: "New work",
            start: "2026-06-30T13:00:00.000Z",
            end: "2026-06-30T14:00:00.000Z",
            showAs: "free",
            plannerOwned: true,
            score: 10
          }
        ]
      },
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });

    expect(draftSourcesMatch(original, original)).toBe(true);
    expect(draftSourcesMatch(original, regenerated)).toBe(false);
  });

  it("does not restore suggestions prepared from different refreshed context", () => {
    const original = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const refreshed = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION,
      refreshedContext: {
        suggestions: [
          {
            id: "actual:unplanned:review",
            category: "unplanned",
            title: "Production review",
            actualMinutes: 30,
            completionStatus: "unplanned"
          }
        ]
      }
    });

    expect(draftSourcesMatch(original, refreshed)).toBe(false);
  });

  it("merges local and widget drafts using the most recently saved day", () => {
    const draft = prepareWorkdayReconciliation({
      originalRundown: rundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const older = saveDatedDraft(
      {},
      draft,
      draft.entries,
      new Date("2026-06-30T19:00:00.000Z")
    );
    const newer = saveDatedDraft(
      {},
      draft,
      draft.entries,
      new Date("2026-06-30T20:00:00.000Z")
    );

    expect(mergeDraftStores(older, newer)["2026-06-30"]?.savedAt).toBe(
      "2026-06-30T20:00:00.000Z"
    );
  });
});
