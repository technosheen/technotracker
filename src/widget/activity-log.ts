export const ACTIVITY_LOG_STORAGE_KEY = "technotracker.activity.log.v1";
export const ACTIVITY_LOG_RETENTION_DAYS = 14;
export const ACTIVITY_LOG_MAX_ENTRIES_PER_DAY = 50;

export type ActivityKind =
  | "plan_generated"
  | "schedule_adjusted"
  | "reconciliation_prepared"
  | "reconciliation_finalized"
  | "reminder_sent";

const ACTIVITY_KINDS: ReadonlySet<string> = new Set<ActivityKind>([
  "plan_generated",
  "schedule_adjusted",
  "reconciliation_prepared",
  "reconciliation_finalized",
  "reminder_sent"
]);

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  message: string;
}

export type ActivityLogStore = Record<string, ActivityEntry[]>;

export function pruneActivityLog(
  input: unknown,
  now: Date = new Date()
): ActivityLogStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const cutoff = now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const retained: ActivityLogStore = {};

  for (const [date, value] of Object.entries(input)) {
    if (!Array.isArray(value)) continue;
    const entries = value
      .filter(isActivityEntry)
      .filter((entry) => Date.parse(entry.at) >= cutoff)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, ACTIVITY_LOG_MAX_ENTRIES_PER_DAY);
    if (entries.length > 0) retained[date] = entries;
  }
  return retained;
}

export function appendActivityEntry(
  store: ActivityLogStore,
  date: string,
  entry: { kind: ActivityKind; message: string; at?: string; id?: string },
  now: Date = new Date()
): ActivityLogStore {
  const existing = store[date] ?? [];
  const at = entry.at ?? now.toISOString();
  const id = entry.id ?? `activity:${date}:${existing.length}:${at}`;
  if (existing.some((candidate) => candidate.id === id)) {
    return pruneActivityLog(store, now);
  }
  const nextEntry: ActivityEntry = {
    id,
    at,
    kind: entry.kind,
    message: entry.message
  };
  return pruneActivityLog({ ...store, [date]: [nextEntry, ...existing] }, now);
}

export function mergeActivityLogs(
  ...stores: ActivityLogStore[]
): ActivityLogStore {
  const merged: ActivityLogStore = {};
  for (const store of stores) {
    for (const [date, entries] of Object.entries(store)) {
      const byId = new Map(
        [...(merged[date] ?? []), ...entries].map((entry) => [entry.id, entry])
      );
      merged[date] = [...byId.values()];
    }
  }
  return pruneActivityLog(merged);
}

function isActivityEntry(value: unknown): value is ActivityEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActivityEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.at === "string" &&
    Number.isFinite(Date.parse(candidate.at)) &&
    typeof candidate.kind === "string" &&
    ACTIVITY_KINDS.has(candidate.kind)
  );
}
