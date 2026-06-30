import type { DailyRundown } from "../contracts.js";

export const previewRundown: DailyRundown = {
  date: "2026-06-30",
  summary:
    "3 active priorities, 1 blocker, 2 meetings, and 3 protected focus blocks.",
  priorities: [
    {
      issue: {
        key: "DTC-5238",
        source: "jira",
        summary: "Boost Coverage component",
        description: "",
        status: "Blocked",
        priority: "High",
        dueDate: "2026-06-30",
        updatedAt: "2026-06-30T13:00:00.000Z",
        assignee: "Damen Golden",
        mentionsCurrentUser: false,
        blocked: true
      },
      score: 140,
      rationale: ["High priority", "Blocked", "due today"]
    },
    {
      issue: {
        key: "HUB-235",
        source: "jira",
        summary: "Shared fragments in HubSpot",
        description: "",
        status: "Ready for QA",
        priority: "High",
        dueDate: null,
        updatedAt: "2026-06-30T13:20:00.000Z",
        assignee: "Sean Mahoney",
        mentionsCurrentUser: true,
        blocked: false
      },
      score: 70,
      rationale: ["High priority", "mentions you"]
    },
    {
      issue: {
        key: "HUB-62",
        source: "jira",
        summary: "Interactive USA map module",
        description: "",
        status: "Dev In Progress",
        priority: "Medium",
        dueDate: null,
        updatedAt: "2026-06-29T18:20:00.000Z",
        assignee: "Sean Mahoney",
        mentionsCurrentUser: false,
        blocked: false
      },
      score: 48,
      rationale: ["Dev In Progress"]
    }
  ],
  blockers: ["DTC-5238: Boost Coverage component"],
  actionItems: [
    "Respond on HUB-235: Shared fragments in HubSpot",
    "Review email from Product: July launch readiness"
  ],
  schedule: [
    {
      id: "meeting-1",
      title: "Daily stand-up",
      start: "2026-06-30T13:00:00.000Z",
      end: "2026-06-30T13:30:00.000Z",
      showAs: "busy",
      kind: "meeting"
    },
    {
      id: "work-1",
      issueKey: "DTC-5238",
      title: "DTC | DTC-5238 | Boost Coverage component",
      start: "2026-06-30T13:45:00.000Z",
      end: "2026-06-30T15:15:00.000Z",
      showAs: "free",
      plannerOwned: true,
      score: 140,
      kind: "work"
    },
    {
      id: "meeting-2",
      title: "HubSpot implementation review",
      start: "2026-06-30T15:30:00.000Z",
      end: "2026-06-30T16:00:00.000Z",
      showAs: "busy",
      kind: "meeting"
    },
    {
      id: "work-2",
      issueKey: "HUB-235",
      title: "HUBSPOT | HUB-235 | Shared fragments",
      start: "2026-06-30T16:15:00.000Z",
      end: "2026-06-30T17:45:00.000Z",
      showAs: "free",
      plannerOwned: true,
      score: 70,
      kind: "work"
    }
  ],
  timesheet: {
    entries: [
      {
        id: "ts-1",
        code: "INT-58",
        description: "Meetings",
        minutes: 60,
        source: "meeting"
      },
      {
        id: "ts-2",
        code: "DTC-5238",
        description: "Boost Coverage component",
        minutes: 150,
        source: "work_item"
      },
      {
        id: "ts-3",
        code: "HUB-235",
        description: "Shared fragments in HubSpot",
        minutes: 150,
        source: "work_item"
      },
      {
        id: "ts-4",
        code: "INT-58",
        description: "Planning and follow-ups",
        minutes: 120,
        source: "internal"
      }
    ],
    totalMinutes: 480
  }
};
