import type { ScheduleItem, TimesheetEntry } from "../contracts.js";
import { MEETING_TIMESHEET_CODE, timesheetCodeForIssue } from "./prefix-rules.js";
import { durationMinutes } from "./time.js";

const WORKDAY_MINUTES = 8 * 60;

export interface Timesheet {
  entries: TimesheetEntry[];
  totalMinutes: 480;
}

export function generateTimesheet(schedule: ScheduleItem[]): Timesheet {
  const entries: TimesheetEntry[] = [];
  let remaining = WORKDAY_MINUTES;

  for (const item of [...schedule].sort((a, b) => a.start.localeCompare(b.start))) {
    if (remaining === 0) break;
    const itemMinutes = Math.max(0, durationMinutes(item));
    const minutes = Math.min(itemMinutes, remaining);
    if (minutes === 0) continue;

    entries.push({
      id: `timesheet:${item.id}`,
      code: item.kind === "meeting" ? MEETING_TIMESHEET_CODE : timesheetCodeForIssue(item.issueKey),
      description: item.title,
      minutes,
      source: item.kind === "meeting" ? "meeting" : "jira"
    });
    remaining -= minutes;
  }

  if (remaining > 0) {
    entries.push({
      id: "timesheet:balance",
      code: MEETING_TIMESHEET_CODE,
      description: "Internal planning, administration, and follow-ups",
      minutes: remaining,
      source: "internal"
    });
  }

  const totalMinutes = entries.reduce((total, entry) => total + entry.minutes, 0);
  if (totalMinutes !== WORKDAY_MINUTES) {
    throw new Error(`Timesheet must total ${WORKDAY_MINUTES} minutes; received ${totalMinutes}`);
  }
  return { entries, totalMinutes: 480 };
}
