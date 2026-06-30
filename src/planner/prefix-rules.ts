const HUB_PREFIX = /^HUB-/;
const DTC_PREFIX = /^DTC-/;


export function calendarTitleForIssue(key: string): string {
  if (HUB_PREFIX.test(key)) return `HUBSPOT | ${key}`;
  if (DTC_PREFIX.test(key)) return `DTC | ${key}`;
  return `INTERNAL | ${key}`;
}

export function timesheetCodeForIssue(key: string): string {
  if (HUB_PREFIX.test(key) || DTC_PREFIX.test(key)) return key;
  return "INT-58";
}

export const MEETING_TIMESHEET_CODE = "INT-58";
