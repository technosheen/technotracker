import {
  ActualEntrySchema,
  ReconciliationDraftSchema,
  type ActualEntry,
  type ReconciliationDraft
} from "../contracts.js";

export const RECONCILIATION_STORAGE_KEY =
  "technotracker.reconciliation.drafts.v1";
export const DRAFT_RETENTION_DAYS = 14;

export interface StoredReconciliationDraft {
  savedAt: string;
  draft: ReconciliationDraft;
  entries: ActualEntry[];
}

export type ReconciliationDraftStore = Record<
  string,
  StoredReconciliationDraft
>;

export function pruneDraftStore(
  input: unknown,
  now = new Date()
): ReconciliationDraftStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const cutoff = now.getTime() - DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const retained: ReconciliationDraftStore = {};

  for (const [date, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Partial<StoredReconciliationDraft>;
    const savedAt = Date.parse(candidate.savedAt ?? "");
    const draft = ReconciliationDraftSchema.safeParse(candidate.draft);
    const entries = Array.isArray(candidate.entries)
      ? candidate.entries.map((entry) => ActualEntrySchema.safeParse(entry))
      : [];
    if (
      !Number.isFinite(savedAt) ||
      savedAt < cutoff ||
      !draft.success ||
      draft.data.date !== date ||
      entries.some((entry) => !entry.success)
    ) {
      continue;
    }
    retained[date] = {
      savedAt: candidate.savedAt!,
      draft: draft.data,
      entries: entries.map((entry) => entry.data!)
    };
  }
  return retained;
}

export function saveDatedDraft(
  store: ReconciliationDraftStore,
  draft: ReconciliationDraft,
  entries: ActualEntry[],
  now = new Date()
): ReconciliationDraftStore {
  return pruneDraftStore(
    {
      ...store,
      [draft.date]: {
        savedAt: now.toISOString(),
        draft,
        entries
      }
    },
    now
  );
}
