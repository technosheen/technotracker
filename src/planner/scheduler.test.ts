import { describe, expect, it } from "vitest";

import type { JiraIssue, Meeting } from "../contracts.js";
import { rankIssues } from "./priority.js";
import { scheduleWork } from "./scheduler.js";
import { overlaps } from "./time.js";

const issue: JiraIssue = {
  key: "HUB-235",
  summary: "Shared fragments",
  description: "",
  status: "Ready for QA",
  priority: "High",
  dueDate: null,
  updatedAt: "2026-06-29T12:00:00.000Z",
  assignee: "Sean",
  mentionsCurrentUser: true,
  blocked: false
};

const meeting: Meeting = {
  id: "meeting-1",
  title: "Standup",
  start: "2026-06-29T13:30:00.000Z",
  end: "2026-06-29T14:00:00.000Z",
  showAs: "busy"
};

describe("deterministic scheduler", () => {
  it("never overlaps meetings and marks work free", () => {
    const blocks = scheduleWork(rankIssues([issue], "2026-06-29"), [meeting], {
      dayStart: "2026-06-29T13:00:00.000Z",
      dayEnd: "2026-06-29T21:00:00.000Z"
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.showAs).toBe("free");
    expect(blocks[0]?.plannerOwned).toBe(true);
    expect(overlaps(blocks[0]!, meeting)).toBe(false);
    expect(blocks[0]?.start).toBe("2026-06-29T14:15:00.000Z");
  });

  it("preserves overlapping source meetings without placing work over either", () => {
    const overlappingMeeting: Meeting = {
      id: "meeting-2",
      title: "Incident review",
      start: "2026-06-29T13:45:00.000Z",
      end: "2026-06-29T14:30:00.000Z",
      showAs: "busy"
    };
    const blocks = scheduleWork(rankIssues([issue], "2026-06-29"), [meeting, overlappingMeeting], {
      dayStart: "2026-06-29T13:00:00.000Z",
      dayEnd: "2026-06-29T21:00:00.000Z"
    });

    expect(blocks[0]?.start).toBe("2026-06-29T14:45:00.000Z");
    expect([meeting, overlappingMeeting].every((item) => !overlaps(blocks[0]!, item))).toBe(true);
  });
});
