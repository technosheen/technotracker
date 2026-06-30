import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  type PrefixMapping
} from "../contracts.js";

const DEFAULT_MAPPINGS = DEFAULT_TIMESHEET_CONFIGURATION.prefixMappings;

export function calendarTitleForIssue(
  key: string,
  mappings: PrefixMapping[] = DEFAULT_MAPPINGS
): string {
  const mapping = mappingForIssue(key, mappings);
  if (mapping) return `${mapping.label} | ${key}`;
  return `INTERNAL | ${key}`;
}

export function timesheetCodeForIssue(
  key: string,
  mappings: PrefixMapping[] = DEFAULT_MAPPINGS,
  fallback = "INT-58"
): string {
  const mapping = mappingForIssue(key, mappings);
  return mapping
    ? mapping.timesheetCode.replaceAll("{ticket}", key)
    : fallback;
}

export const MEETING_TIMESHEET_CODE = "INT-58";

function mappingForIssue(
  key: string,
  mappings: PrefixMapping[]
): PrefixMapping | undefined {
  const normalizedKey = key.toUpperCase();
  return mappings.find(({ prefix }) =>
    normalizedKey.startsWith(`${prefix.toUpperCase().replace(/-+$/, "")}-`)
  );
}
