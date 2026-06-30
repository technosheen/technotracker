import type { Meeting, PrefixMapping, WorkBlock } from "../contracts.js";
import type { ScoredIssue } from "./priority.js";
import { calendarTitleForIssue } from "./prefix-rules.js";
import { assertNoOverlaps, overlaps, toMillis } from "./time.js";

const FIFTEEN_MINUTES = 15 * 60_000;
const DEFAULT_BLOCK_MINUTES = 90;

export interface SchedulerOptions {
  dayStart: string;
  dayEnd: string;
  meetingBufferMinutes?: number;
  blockMinutes?: number;
  prefixMappings?: PrefixMapping[];
}

export function scheduleWork(
  priorities: ScoredIssue[],
  meetings: Meeting[],
  options: SchedulerOptions
): WorkBlock[] {
  const bufferMs = (options.meetingBufferMinutes ?? 15) * 60_000;
  const blockMs = (options.blockMinutes ?? DEFAULT_BLOCK_MINUTES) * 60_000;
  const dayEndMs = toMillis(options.dayEnd);
  const protectedMeetings = meetings
    .map((meeting) => ({
      start: new Date(toMillis(meeting.start) - bufferMs).toISOString(),
      end: new Date(toMillis(meeting.end) + bufferMs).toISOString()
    }))
    .sort((a, b) => toMillis(a.start) - toMillis(b.start));

  const blocks: WorkBlock[] = [];
  let cursor = toMillis(options.dayStart);

  for (const priority of priorities) {
    while (cursor + blockMs <= dayEndMs) {
      const candidate = {
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + blockMs).toISOString()
      };
      const conflict = protectedMeetings.find((meeting) => overlaps(candidate, meeting));
      if (conflict) {
        cursor = Math.max(cursor + FIFTEEN_MINUTES, toMillis(conflict.end));
        continue;
      }

      blocks.push({
        id: `planner:${priority.issue.key}:${candidate.start}`,
        issueKey: priority.issue.key,
        title: `${calendarTitleForIssue(
          priority.issue.key,
          options.prefixMappings
        )} | ${priority.issue.summary}`,
        start: candidate.start,
        end: candidate.end,
        showAs: "free",
        plannerOwned: true,
        score: priority.score
      });
      cursor += blockMs;
      break;
    }
    if (cursor + blockMs > dayEndMs) break;
  }

  assertNoOverlaps(blocks);
  for (const block of blocks) {
    if (meetings.some((meeting) => overlaps(block, meeting))) {
      throw new Error(`Planner block ${block.id} overlaps an Outlook meeting`);
    }
  }
  return blocks;
}
