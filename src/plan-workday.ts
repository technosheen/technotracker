import type {
  DailyRundown,
  JiraIssue,
  MailMessage,
  Meeting,
  TeamsMessage,
  TimesheetConfiguration
} from "./contracts.js";
import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  TimesheetConfigurationSchema
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
  configuration?: TimesheetConfiguration;
}

export function planExplicitWorkday(input: ExplicitWorkdayInput): DailyRundown {
  const configuration = TimesheetConfigurationSchema.parse(
    input.configuration ?? DEFAULT_TIMESHEET_CONFIGURATION
  );
  const timeZone = input.timeZone ?? configuration.timeZone;
  const date = input.date ?? dateInTimeZone(new Date(), timeZone);

  return createDailyRundown({
    date,
    issues: input.issues,
    meetings: input.meetings,
    mail: input.mail,
    teams: input.teams,
    dayStart: zonedBoundary(
      date,
      input.workdayStart ?? configuration.workdayStart,
      timeZone
    ),
    dayEnd: zonedBoundary(
      date,
      input.workdayEnd ?? configuration.workdayEnd,
      timeZone
    ),
    configuration
  });
}
