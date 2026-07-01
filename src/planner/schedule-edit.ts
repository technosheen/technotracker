import {
  DailyRundownSchema,
  TimesheetConfigurationSchema,
  type DailyRundown,
  type TimesheetConfiguration
} from "../contracts.js";
import { generateTimesheet } from "./timesheet.js";
import { overlaps, toMillis, zonedBoundary } from "./time.js";

const MEETING_BUFFER_MS = 15 * 60_000;

export interface AdjustScheduleItemInput {
  rundown: DailyRundown;
  configuration: TimesheetConfiguration;
  itemId: string;
  start: string;
  end: string;
}

export function adjustScheduleItem(input: AdjustScheduleItemInput): DailyRundown {
  const configuration = TimesheetConfigurationSchema.parse(input.configuration);
  const { rundown, itemId, start, end } = input;

  const item = rundown.schedule.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Schedule item "${itemId}" was not found in the plan.`);
  }
  if (item.kind !== "work") {
    throw new Error("Meetings are immutable busy intervals and cannot be rescheduled.");
  }
  if (toMillis(end) <= toMillis(start)) {
    throw new Error("End must be after start.");
  }
  const originalDuration = toMillis(item.end) - toMillis(item.start);
  const adjustedDuration = toMillis(end) - toMillis(start);
  if (adjustedDuration !== originalDuration) {
    throw new Error(
      `Moving "${item.title}" must preserve its ${originalDuration / 60_000}-minute duration.`
    );
  }

  const dayStart = zonedBoundary(rundown.date, configuration.workdayStart, configuration.timeZone);
  const dayEnd = zonedBoundary(rundown.date, configuration.workdayEnd, configuration.timeZone);
  if (toMillis(start) < toMillis(dayStart) || toMillis(end) > toMillis(dayEnd)) {
    throw new Error(
      `"${item.title}" must stay within the workday (${configuration.workdayStart}–${configuration.workdayEnd} ${configuration.timeZone}).`
    );
  }

  const candidate = { start, end };
  for (const other of rundown.schedule) {
    if (other.id === itemId) continue;
    const bufferedOther =
      other.kind === "meeting"
        ? {
            start: new Date(toMillis(other.start) - MEETING_BUFFER_MS).toISOString(),
            end: new Date(toMillis(other.end) + MEETING_BUFFER_MS).toISOString()
          }
        : other;
    if (overlaps(candidate, bufferedOther)) {
      throw new Error(`Moving "${item.title}" to that time would overlap "${other.title}".`);
    }
  }

  const schedule = rundown.schedule
    .map((scheduleItem) =>
      scheduleItem.id === itemId ? { ...scheduleItem, start, end } : scheduleItem
    )
    .sort((a, b) => a.start.localeCompare(b.start));

  return DailyRundownSchema.parse({
    ...rundown,
    schedule,
    timesheet: generateTimesheet(schedule, configuration)
  });
}
