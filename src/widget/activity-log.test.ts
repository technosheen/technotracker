import { describe, expect, it } from "vitest";
import {
  appendActivityEntry,
  mergeActivityLogs,
  pruneActivityLog
} from "./activity-log.js";

describe("activity log", () => {
  it("appends newest-first and keeps entries within the retention window", () => {
    const now = new Date("2026-06-30T20:00:00.000Z");
    let store = appendActivityEntry(
      {},
      "2026-06-30",
      { kind: "plan_generated", message: "Workday plan generated." },
      now
    );
    store = appendActivityEntry(
      store,
      "2026-06-30",
      { kind: "schedule_adjusted", message: "Moved DTC-44 to 5pm." },
      now
    );

    expect(store["2026-06-30"]).toHaveLength(2);
    expect(store["2026-06-30"]?.[0]?.kind).toBe("schedule_adjusted");
    expect(store["2026-06-30"]?.[1]?.kind).toBe("plan_generated");
  });

  it("expires entries older than 14 days", () => {
    const now = new Date("2026-06-30T20:00:00.000Z");
    const store = {
      "2026-06-30": [
        { id: "activity:2026-06-30:0:2026-06-30T20:00:00.000Z", at: "2026-06-30T20:00:00.000Z", kind: "plan_generated" as const, message: "Recent" }
      ],
      "2026-06-01": [
        { id: "activity:2026-06-01:0:2026-06-01T20:00:00.000Z", at: "2026-06-01T20:00:00.000Z", kind: "plan_generated" as const, message: "Old" }
      ]
    };

    expect(pruneActivityLog(store, now)).toEqual({
      "2026-06-30": store["2026-06-30"]
    });
  });

  it("drops malformed entries without throwing", () => {
    const mixed = {
      "2026-06-30": [{ broken: true }, "not-an-entry"],
      unrelatedConfiguration: { role: "Developer" }
    };

    expect(pruneActivityLog(mixed, new Date("2026-06-30T21:00:00.000Z"))).toEqual({});
  });

  it("deduplicates stable event ids and merges local and widget stores", () => {
    const now = new Date("2026-06-30T20:00:00.000Z");
    const first = appendActivityEntry(
      {},
      "2026-06-30",
      {
        id: "plan:2026-06-30:v1",
        kind: "plan_generated",
        message: "Workday plan generated."
      },
      now
    );
    const duplicate = appendActivityEntry(
      first,
      "2026-06-30",
      {
        id: "plan:2026-06-30:v1",
        kind: "plan_generated",
        message: "Workday plan generated."
      },
      now
    );
    const widget = appendActivityEntry(
      {},
      "2026-06-30",
      {
        id: "schedule:2026-06-30:work-1",
        kind: "schedule_adjusted",
        message: "Moved work."
      },
      now
    );

    expect(duplicate["2026-06-30"]).toHaveLength(1);
    expect(mergeActivityLogs(duplicate, widget)["2026-06-30"]).toHaveLength(2);
  });
});
