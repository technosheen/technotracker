import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  TimesheetConfigurationSchema,
  type ScheduleItem,
  type TimesheetConfiguration,
  type TimesheetEntry
} from "../contracts.js";
import { timesheetCodeForIssue } from "./prefix-rules.js";
import { durationMinutes } from "./time.js";

export interface Timesheet {
  entries: TimesheetEntry[];
  totalMinutes: number;
}

export function generateTimesheet(
  schedule: ScheduleItem[],
  inputConfiguration: TimesheetConfiguration = DEFAULT_TIMESHEET_CONFIGURATION
): Timesheet {
  const configuration = TimesheetConfigurationSchema.parse(inputConfiguration);
  const targetMinutes = Math.round(configuration.targetHours * 60);
  const entries: TimesheetEntry[] = [];
  let remaining = targetMinutes;

  for (const item of [...schedule].sort((a, b) => a.start.localeCompare(b.start))) {
    if (remaining === 0) break;
    if (item.kind === "meeting" && !configuration.countMeetings) continue;
    const itemMinutes = Math.max(0, durationMinutes(item));
    const roundedMinutes = roundToIncrement(
      itemMinutes,
      configuration.roundingMinutes
    );
    const minutes = Math.min(roundedMinutes, remaining);
    if (minutes === 0) continue;

    entries.push({
      id: `timesheet:${item.id}`,
      code:
        item.kind === "meeting"
          ? configuration.meetingCode
          : timesheetCodeForIssue(
              item.issueKey,
              configuration.prefixMappings,
              configuration.internalCode
            ),
      description: item.title,
      minutes,
      source: item.kind === "meeting" ? "meeting" : "work_item"
    });
    remaining -= minutes;
  }

  if (remaining > 0) {
    entries.push({
      id: "timesheet:balance",
      code: configuration.internalCode,
      description: "Internal planning, administration, and follow-ups",
      minutes: remaining,
      source: "internal"
    });
  }

  const totalMinutes = entries.reduce((total, entry) => total + entry.minutes, 0);
  if (totalMinutes !== targetMinutes) {
    throw new Error(
      `Timesheet must total ${targetMinutes} minutes; received ${totalMinutes}`
    );
  }
  return { entries, totalMinutes };
}

function roundToIncrement(minutes: number, increment: number): number {
  if (minutes === 0) return 0;
  return Math.max(increment, Math.round(minutes / increment) * increment);
}
