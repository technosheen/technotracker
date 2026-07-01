import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import React, { useEffect, useMemo, useState } from "react";
import {
  AppPayloadSchema,
  type ActualEntry,
  type ReconciliationDraft,
  type ReconciliationResult
} from "../contracts.js";
import { finalizeWorkdayReconciliation } from "../planner/reconciliation.js";
import {
  RECONCILIATION_STORAGE_KEY,
  pruneDraftStore,
  saveDatedDraft,
  type ReconciliationDraftStore
} from "./reconciliation-storage.js";

export function ReconciliationWidget({
  app,
  draft,
  result,
  preview,
  onPayload
}: {
  app: McpApp | null;
  draft: ReconciliationDraft;
  result?: ReconciliationResult;
  preview: boolean;
  onPayload: (payload: unknown) => void;
}) {
  const [entries, setEntries] = useState<ActualEntry[]>(() =>
    result?.entries ?? restoreEntries(draft) ?? draft.entries
  );
  const [status, setStatus] = useState<"editing" | "finalizing" | "final">(
    result ? "final" : "editing"
  );
  const [error, setError] = useState("");
  const activeResult = result;
  const unconfirmedCount = entries.filter(
    (entry) => entry.confirmationState === "suggested"
  ).length;
  const actualTotal = useMemo(
    () => entries.reduce((total, entry) => total + entry.actualMinutes, 0),
    [entries]
  );

  useEffect(() => {
    if (status === "final") return;
    persistDraft(draft, entries);
  }, [draft, entries, status]);

  useEffect(() => {
    if (!app) return;
    const context = activeResult
      ? {
          text: reconciliationResultSummary(activeResult),
          structuredContent: { technotrackerReconciliation: activeResult }
        }
      : {
          text: reconciliationDraftSummary(draft, entries),
          structuredContent: {
            technotrackerReconciliationDraft: {
              date: draft.date,
              entries
            }
          }
        };
    void app.updateModelContext({
      content: [{ type: "text", text: context.text }],
      structuredContent: context.structuredContent
    });
  }, [app, activeResult, draft.date]);

  function updateEntry(id: string, patch: Partial<ActualEntry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry
      )
    );
    setStatus("editing");
    setError("");
  }

  function confirmAll() {
    setEntries((current) =>
      current.map((entry) => ({
        ...entry,
        confirmationState: "confirmed"
      }))
    );
  }

  function addUnplannedWork() {
    const sequence = nextUnplannedSequence(entries, draft.date);
    setEntries((current) => [
      ...current,
      {
        id: `actual:unplanned:${draft.date}:${sequence}`,
        plannedItemId: null,
        category: "unplanned",
        title: "Unplanned work",
        plannedIssueKey: null,
        issueKey: null,
        plannedMinutes: 0,
        actualMinutes: 30,
        completionStatus: "unplanned",
        notes: "",
        sourceReferences: [
          { type: "user", id: `manual:${draft.date}:${sequence}` }
        ],
        confirmationState: "confirmed",
        timesheetCode: draft.configuration.internalCode
      }
    ]);
  }

  async function finalize() {
    setError("");
    if (unconfirmedCount > 0) {
      setError(`Confirm ${unconfirmedCount} suggested item(s) before finalizing.`);
      return;
    }
    setStatus("finalizing");
    try {
      if (preview || !app) {
        const nextResult = finalizeWorkdayReconciliation({ draft, entries });
        onPayload({
          view: "reconciliation",
          phase: "final",
          draft,
          result: nextResult
        });
        return;
      }
      const response = await app.callServerTool({
        name: "finalize_workday_reconciliation",
        arguments: { draft, entries }
      });
      const parsed = AppPayloadSchema.safeParse(response.structuredContent);
      if (parsed.success) onPayload(parsed.data);
    } catch (finalizeError) {
      setStatus("editing");
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "Could not finalize reconciliation."
      );
    }
  }

  async function editInChat() {
    if (!app) return;
    await app.sendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Update this TechnoTracker reconciliation from my instructions. Examples: “standup ran 30 minutes long,” “replace HUB-12 with DTC-44,” or “move unfinished work to tomorrow.” Then call finalize_workday_reconciliation only after I confirm all suggestions."
        }
      ]
    });
  }

  return (
    <main className="reconciliation-shell">
      <header className="planner-header reconciliation-header">
        <div>
          <p className="date">{formatDate(draft.date)} · End of day</p>
          <h1>Reconcile actual work</h1>
          <p className="summary">
            Confirm app-derived suggestions, record deviations, and carry
            unfinished work forward. Nothing is written to connected systems.
          </p>
        </div>
        <div className="hours" aria-label="Actual duration">
          <strong>{formatDuration(actualTotal)}</strong>
          <span>actual captured</span>
        </div>
      </header>

      <div className="reconciliation-toolbar">
        <div>
          <strong>{unconfirmedCount}</strong>
          <span>suggestions need confirmation</span>
        </div>
        <div className="toolbar-actions">
          {unconfirmedCount > 0 ? (
            <button type="button" className="secondary-button" onClick={confirmAll}>
              Confirm all
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={addUnplannedWork}>
            Add unplanned work
          </button>
          {!preview ? (
            <button type="button" className="text-button" onClick={editInChat}>
              Edit in chat
            </button>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="actual-entries-heading">
        <div className="section-heading">
          <h2 id="actual-entries-heading">Actual entries</h2>
          <span>{entries.length}</span>
        </div>
        <div className="actual-entry-list">
          {entries.map((entry) => (
            <ActualEntryRow
              key={entry.id}
              entry={entry}
              disabled={status === "finalizing" || Boolean(activeResult)}
              onChange={(patch) => updateEntry(entry.id, patch)}
            />
          ))}
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      {activeResult ? (
        <ReconciliationSummary result={activeResult} />
      ) : (
        <footer className="reconciliation-footer">
          <p>
            Drafts stay in this widget and browser for 14 days. Finalization is
            repeatable and does not submit the timesheet.
          </p>
          <button
            type="button"
            className="primary-button"
            disabled={status === "finalizing" || unconfirmedCount > 0}
            onClick={finalize}
          >
            {status === "finalizing" ? "Finalizing…" : "Finalize timesheet"}
          </button>
        </footer>
      )}
    </main>
  );
}

function ActualEntryRow({
  entry,
  disabled,
  onChange
}: {
  entry: ActualEntry;
  disabled: boolean;
  onChange: (patch: Partial<ActualEntry>) => void;
}) {
  return (
    <article className={`actual-entry ${entry.confirmationState}`}>
      <div className="actual-entry-heading">
        <div>
          <span className={`entry-kind ${entry.category}`}>{entry.category}</span>
          <input
            aria-label="Entry title"
            value={entry.title}
            disabled={disabled}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
        <label className="confirm-control">
          <input
            type="checkbox"
            checked={entry.confirmationState === "confirmed"}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                confirmationState: event.target.checked
                  ? "confirmed"
                  : "suggested"
              })
            }
          />
          {entry.confirmationState === "confirmed" ? "Confirmed" : "Confirm"}
        </label>
      </div>

      <div className="actual-fields">
        <label className="field">
          <span>Status</span>
          <select
            value={entry.completionStatus}
            disabled={disabled}
            onChange={(event) => {
              const completionStatus =
                event.target.value as ActualEntry["completionStatus"];
              onChange({
                completionStatus,
                ...(completionStatus === "skipped" ? { actualMinutes: 0 } : {})
              });
            }}
          >
            <option value="completed">Completed</option>
            <option value="partial">Partial</option>
            <option value="skipped">Skipped</option>
            <option value="replaced">Replaced</option>
            <option value="unplanned">Unplanned</option>
          </select>
        </label>
        <label className="field">
          <span>Actual minutes</span>
          <input
            type="number"
            min="0"
            step="1"
            value={entry.actualMinutes}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                actualMinutes: Math.max(0, Number(event.target.value) || 0)
              })
            }
          />
        </label>
        <label className="field">
          <span>Issue key</span>
          <input
            value={entry.issueKey ?? ""}
            placeholder="Optional"
            disabled={disabled}
            onChange={(event) =>
              onChange({ issueKey: event.target.value.trim() || null })
            }
          />
        </label>
        <label className="field">
          <span>Timesheet code</span>
          <input
            value={entry.timesheetCode}
            disabled={disabled}
            onChange={(event) => onChange({ timesheetCode: event.target.value })}
          />
        </label>
      </div>

      <label className="field entry-notes">
        <span>Notes</span>
        <input
          value={entry.notes}
          placeholder="What changed?"
          disabled={disabled}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
      <small>
        Planned {formatDuration(entry.plannedMinutes)}
        {entry.sourceReferences.length > 0
          ? ` · ${entry.sourceReferences.map((source) => source.type).join(", ")}`
          : ""}
      </small>
    </article>
  );
}

function ReconciliationSummary({ result }: { result: ReconciliationResult }) {
  return (
    <div className="reconciliation-results">
      <section>
        <SectionTitle title="Changes" count={result.changes.length} />
        <ul className="result-list">
          {result.changes.map((change, index) => (
            <li key={`${change.entryId}:${change.type}:${index}`}>
              {change.summary}
            </li>
          ))}
          {result.changes.length === 0 ? <li>No deviations recorded.</li> : null}
        </ul>
      </section>
      <section>
        <SectionTitle title="Carryover" count={result.carryover.length} />
        <ul className="result-list">
          {result.carryover.map((item) => (
            <li key={item.entryId}>
              <strong>{item.issueKey ?? "Unassigned"}</strong> · {item.title} ·{" "}
              {formatDuration(item.remainingMinutes)} remaining
            </li>
          ))}
          {result.carryover.length === 0 ? <li>No work carries forward.</li> : null}
        </ul>
      </section>
      {result.warnings.length > 0 ? (
        <section className="warning-panel">
          <SectionTitle title="Warnings" count={result.warnings.length} />
          <ul className="result-list">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="timesheet reconciled-timesheet">
        <div className="section-heading">
          <h2>Final timesheet</h2>
          <span>{result.timesheet.entries.length}</span>
        </div>
        <ul>
          {result.timesheet.entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.code}</strong>
                <span>{entry.description}</span>
              </div>
              <time>{formatDuration(entry.minutes)}</time>
            </li>
          ))}
        </ul>
        <div className="timesheet-total">
          <span>{result.approvalState.replaceAll("_", " ")}</span>
          <strong>{formatDuration(result.timesheet.totalMinutes)}</strong>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  );
}

function restoreEntries(draft: ReconciliationDraft): ActualEntry[] | null {
  const store = readDraftStore();
  return store[draft.date]?.entries ?? null;
}

function readDraftStore(): ReconciliationDraftStore {
  const widgetStore = getOpenAi()?.widgetState?.technotrackerReconciliationDrafts;
  if (widgetStore) return pruneDraftStore(widgetStore);
  try {
    return pruneDraftStore(
      JSON.parse(localStorage.getItem(RECONCILIATION_STORAGE_KEY) ?? "{}")
    );
  } catch {
    return {};
  }
}

function persistDraft(draft: ReconciliationDraft, entries: ActualEntry[]) {
  const nextStore = saveDatedDraft(readDraftStore(), draft, entries);
  try {
    localStorage.setItem(RECONCILIATION_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // Widget-state persistence remains available when local storage is blocked.
  }
  const openai = getOpenAi();
  if (openai?.setWidgetState) {
    void openai.setWidgetState({
      ...(openai.widgetState ?? {}),
      technotrackerReconciliationDrafts: nextStore
    });
  }
}

type ChatGptWindow = Window & {
  openai?: {
    widgetState?: {
      technotrackerConfiguration?: unknown;
      technotrackerReconciliationDrafts?: unknown;
    };
    setWidgetState?: (state: unknown) => void | Promise<void>;
  };
};

function getOpenAi() {
  return (window as ChatGptWindow).openai;
}

function nextUnplannedSequence(entries: ActualEntry[], date: string) {
  let sequence = 1;
  const ids = new Set(entries.map((entry) => entry.id));
  while (ids.has(`actual:unplanned:${date}:${sequence}`)) sequence += 1;
  return sequence;
}

function reconciliationDraftSummary(
  draft: ReconciliationDraft,
  entries: ActualEntry[]
) {
  return `TechnoTracker reconciliation draft for ${draft.date}: ${entries.length} entries, ${entries.filter((entry) => entry.confirmationState === "suggested").length} suggestions still need confirmation.`;
}

function reconciliationResultSummary(result: ReconciliationResult) {
  return `TechnoTracker reconciliation finalized for ${result.date}: ${result.timesheet.totalMinutes} minutes, ${result.carryover.length} carryover items, approval ${result.approvalState}.`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${remainder}m`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}
