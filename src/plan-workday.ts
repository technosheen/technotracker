import type {
  DailyRundown,
  JiraIssue,
  MailMessage,
  Meeting,
  TeamsMessage
} from "./contracts.js";
import {
  createDailyRundown,
  dateInTimeZone,
  zonedBoundary
} from "./planner/index.js";

export interface ExplicitWorkdayInput {
  date?: string;
  issues: JiraIssue[];
  meetings: Meeting[];
  mail: MailMessage[];
  teams: TeamsMessage[];
  timeZone?: string;
  workdayStart?: string;
  workdayEnd?: string;
}

export function planExplicitWorkday(input: ExplicitWorkdayInput): DailyRundown {
  const timeZone = input.timeZone ?? "America/New_York";
  const date = input.date ?? dateInTimeZone(new Date(), timeZone);

  return createDailyRundown({
    date,
    issues: input.issues,
    meetings: input.meetings,
    mail: input.mail,
    teams: input.teams,
    dayStart: zonedBoundary(date, input.workdayStart ?? "09:00", timeZone),
    dayEnd: zonedBoundary(date, input.workdayEnd ?? "17:00", timeZone)
  });
}
