import type {
  DailyRundown,
  JiraIssue,
  MailMessage,
  Meeting,
  ScheduleItem,
  TeamsMessage,
  TimesheetConfiguration
} from "../contracts.js";
import { rankIssues } from "./priority.js";
import { scheduleWork } from "./scheduler.js";
import { generateTimesheet } from "./timesheet.js";

export interface DailyInputs {
  date: string;
  issues: JiraIssue[];
  meetings: Meeting[];
  mail: MailMessage[];
  teams: TeamsMessage[];
  dayStart: string;
  dayEnd: string;
  configuration: TimesheetConfiguration;
}

export function createDailyRundown(input: DailyInputs): DailyRundown {
  const meetings = normalizeMeetingsToDay(input.meetings, input.dayStart, input.dayEnd);
  const priorities = rankIssues(input.issues, input.date);
  const workBlocks = scheduleWork(priorities, meetings, {
    dayStart: input.dayStart,
    dayEnd: input.dayEnd,
    prefixMappings: input.configuration.prefixMappings
  });
  const schedule: ScheduleItem[] = [
    ...meetings.map((meeting) => ({ ...meeting, kind: "meeting" as const })),
    ...workBlocks.map((block) => ({ ...block, kind: "work" as const }))
  ].sort((a, b) => a.start.localeCompare(b.start));

  const blockers = priorities
    .filter(({ issue }) => issue.blocked)
    .map(({ issue }) => `${issue.key}: ${issue.summary}`);
  const actionItems = [
    ...priorities
      .filter(({ issue }) => issue.mentionsCurrentUser)
      .map(({ issue }) => `Respond on ${issue.key}: ${issue.summary}`),
    ...input.mail.slice(0, 3).map((message) => `Review email from ${message.sender}: ${message.subject}`),
    ...input.teams.slice(0, 2).map((message) => `Follow up with ${message.author}: ${message.content.slice(0, 90)}`)
  ];

  return {
    date: input.date,
    summary: `${priorities.length} active priorities, ${blockers.length} blockers, ${meetings.length} meetings, and ${workBlocks.length} protected focus blocks.`,
    priorities,
    blockers,
    actionItems,
    schedule,
    timesheet: generateTimesheet(schedule, input.configuration)
  };
}

export function normalizeMeetingsToDay(
  meetings: Meeting[],
  dayStart: string,
  dayEnd: string
): Meeting[] {
  const startMs = new Date(dayStart).getTime();
  const endMs = new Date(dayEnd).getTime();
  return meetings.flatMap((meeting) => {
    const meetingStartMs = new Date(meeting.start).getTime();
    const meetingEndMs = new Date(meeting.end).getTime();
    if (meetingEndMs <= startMs || meetingStartMs >= endMs) return [];
    return [
      {
        ...meeting,
        start: new Date(Math.max(meetingStartMs, startMs)).toISOString(),
        end: new Date(Math.min(meetingEndMs, endMs)).toISOString()
      }
    ];
  });
}
