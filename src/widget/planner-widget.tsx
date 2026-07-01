import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import React, { useEffect, useMemo, useState } from "react";
import {
  AppPayloadSchema,
  DEFAULT_TIMESHEET_CONFIGURATION,
  type AppPayload,
  type DailyRundown,
  type ScheduleItem,
  type TimesheetConfiguration,
  type TimesheetEntry
} from "../contracts.js";
import { adjustScheduleItem } from "../planner/schedule-edit.js";
import { prepareWorkdayReconciliation } from "../planner/reconciliation.js";
import { ActivityLogPanel } from "./activity-log-panel.js";
import { OnboardingWidget } from "./onboarding-widget.js";
import {
  previewReconciliationDraft,
  previewRundown
} from "./preview-data.js";
import { ReconciliationWidget } from "./reconciliation-widget.js";
import { useActivityLog } from "./use-activity-log.js";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit"
});

export function PlannerWidget() {
  const previewMode = new URLSearchParams(window.location.search).get("preview");
  const preview = previewMode !== null;
  const [payload, setPayload] = useState<AppPayload | null>(() =>
    preview
      ? previewMode === "plan"
        ? {
            view: "plan",
            configuration: DEFAULT_TIMESHEET_CONFIGURATION,
            rundown: previewRundown
          }
        : previewMode === "reconcile"
          ? {
              view: "reconciliation",
              phase: "draft",
              draft: previewReconciliationDraft
            }
        : {
            view: "onboarding",
            configuration: DEFAULT_TIMESHEET_CONFIGURATION
          }
      : null
  );
  const { app, error } = useApp({
    appInfo: { name: "TechnoTracker", version: "0.5.0" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      createdApp.ontoolresult = (result) => {
        const parsed = AppPayloadSchema.safeParse(result.structuredContent);
        if (parsed.success) setPayload(parsed.data);
      };
    }
  });
  useHostStyles(app, app?.getHostContext());

  if (!preview && error) {
    return <Status message={`Connection failed: ${error.message}`} tone="error" />;
  }
  if (!preview && !app) return <Status message="Connecting to ChatGPT…" />;
  if (!payload) return <Status message="Waiting for TechnoTracker…" />;

  if (payload.view === "onboarding") {
    return (
      <OnboardingWidget
        app={app}
        initialConfiguration={payload.configuration}
        preview={preview}
      />
    );
  }

  if (payload.view === "reconciliation") {
    return (
      <ReconciliationWidget
        app={app}
        draft={payload.draft}
        {...(payload.phase === "final" ? { result: payload.result } : {})}
        preview={preview}
        onPayload={(nextPayload) => {
          const parsed = AppPayloadSchema.safeParse(nextPayload);
          if (parsed.success) setPayload(parsed.data);
        }}
      />
    );
  }

  return (
    <WorkdayPlan
      app={app}
      configuration={payload.configuration}
      rundown={payload.rundown}
      preview={preview}
      onPayload={(nextPayload) => {
        const parsed = AppPayloadSchema.safeParse(nextPayload);
        if (parsed.success) setPayload(parsed.data);
      }}
    />
  );
}

function WorkdayPlan({
  app,
  configuration,
  rundown,
  preview,
  onPayload
}: {
  app: McpApp | null;
  configuration: TimesheetConfiguration;
  rundown: DailyRundown;
  preview: boolean;
  onPayload: (payload: unknown) => void;
}) {
  const [actionStatus, setActionStatus] = useState("");
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const { entries: activityEntries, log } = useActivityLog(rundown.date);
  const focusMinutes = useMemo(
    () =>
      rundown.schedule.reduce(
        (total, item) =>
          item.kind === "work"
            ? total + (Date.parse(item.end) - Date.parse(item.start)) / 60_000
            : total,
        0
      ),
    [rundown.schedule]
  );

  useEffect(() => {
    const planSignature = rundown.schedule
      .map((item) => `${item.id}:${item.start}:${item.end}`)
      .join("|");
    log(
      "plan_generated",
      `Workday plan generated: ${rundown.timesheet.totalMinutes / 60}h balanced across ${rundown.schedule.length} schedule item(s).`,
      `activity:${rundown.date}:plan:${planSignature}`
    );
    // Log once when this plan is first shown, not on every subsequent re-render.
  }, []);

  async function nudgeScheduleItem(item: ScheduleItem, deltaMinutes: number) {
    if (item.kind !== "work") return;
    const start = new Date(Date.parse(item.start) + deltaMinutes * 60_000).toISOString();
    const end = new Date(Date.parse(item.end) + deltaMinutes * 60_000).toISOString();
    setReschedulingId(item.id);
    setActionStatus("");
    try {
      let updatedRundown: DailyRundown;
      if (preview || !app) {
        updatedRundown = adjustScheduleItem({
          rundown,
          configuration,
          itemId: item.id,
          start,
          end
        });
      } else {
        const response = await app.callServerTool({
          name: "adjust_schedule_item",
          arguments: { rundown, configuration, itemId: item.id, start, end }
        });
        const parsed = AppPayloadSchema.safeParse(response.structuredContent);
        if (!parsed.success || parsed.data.view !== "plan") {
          throw new Error("Could not adjust the schedule item.");
        }
        updatedRundown = parsed.data.rundown;
      }
      log(
        "schedule_adjusted",
        `Moved "${item.title}" ${deltaMinutes > 0 ? "later" : "earlier"} by ${Math.abs(deltaMinutes)} minutes.`,
        `activity:${rundown.date}:schedule:${item.id}:${start}:${end}`
      );
      onPayload({ view: "plan", configuration, rundown: updatedRundown });
    } catch (error) {
      setActionStatus(
        error instanceof Error ? error.message : "Could not adjust the schedule item."
      );
    } finally {
      setReschedulingId(null);
    }
  }

  async function reconcileDay() {
    setActionStatus("Preparing reconciliation…");
    if (preview || !app) {
      onPayload({
        view: "reconciliation",
        phase: "draft",
        draft: prepareWorkdayReconciliation({
          originalRundown: rundown,
          configuration
        })
      });
      return;
    }
    try {
      const response = await app.callServerTool({
        name: "prepare_workday_reconciliation",
        arguments: {
          originalRundown: rundown,
          configuration,
          refreshedContext: { meetings: [], workItems: [], suggestions: [] }
        }
      });
      onPayload(response.structuredContent);
    } catch (error) {
      setActionStatus(
        error instanceof Error ? error.message : "Could not start reconciliation."
      );
    }
  }

  async function remindMe() {
    if (!app) {
      setActionStatus("Ask ChatGPT to remind you at the end of your workday.");
      return;
    }
    try {
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Remind me at ${configuration.workdayEnd} ${configuration.timeZone} today to reconcile this TechnoTracker plan. When I respond, gather refreshed context from only my approved apps and call prepare_workday_reconciliation.`
          }
        ]
      });
      log(
        "reminder_sent",
        `Reminder requested for ${configuration.workdayEnd} ${configuration.timeZone}.`
      );
      setActionStatus("Reminder request sent to ChatGPT.");
    } catch (error) {
      setActionStatus(
        error instanceof Error
          ? error.message
          : "Could not send the reminder request."
      );
    }
  }

  return (
    <main className="planner-shell">
      <header className="planner-header">
        <div>
          <p className="date">{formatDate(rundown.date)}</p>
          <h1>Workday plan</h1>
          <p className="summary">{rundown.summary}</p>
        </div>
        <div className="hours" aria-label="Timesheet total">
          <strong>{rundown.timesheet.totalMinutes / 60}</strong>
          <span>hours balanced</span>
        </div>
      </header>

      <section className="metrics" aria-label="Plan summary">
        <Metric value={rundown.priorities.length} label="Priorities" />
        <Metric value={rundown.blockers.length} label="Blockers" tone="danger" />
        <Metric value={formatDuration(focusMinutes)} label="Focus time" />
      </section>

      <section className="plan-actions" aria-label="End-of-day actions">
        <div>
          <strong>Close the loop later</strong>
          <span>
            Confirm actual work, record deviations, and rebuild the timesheet.
          </span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="primary-button" onClick={reconcileDay}>
            Reconcile day
          </button>
          <button type="button" className="secondary-button" onClick={remindMe}>
            Remind me
          </button>
        </div>
      </section>
      {actionStatus ? <p className="action-status">{actionStatus}</p> : null}

      <div className="content-grid">
        <section>
          <SectionHeading title="Schedule" count={rundown.schedule.length} />
          <ol className="timeline">
            {rundown.schedule.map((item) => (
              <ScheduleRow
                key={`${item.kind}-${item.id}`}
                item={item}
                busy={reschedulingId === item.id}
                onNudge={(deltaMinutes) => nudgeScheduleItem(item, deltaMinutes)}
              />
            ))}
          </ol>
        </section>

        <aside>
          <section>
            <SectionHeading title="Priorities" count={rundown.priorities.length} />
            <ol className="priorities">
              {rundown.priorities.map(({ issue, rationale }) => (
                <li key={issue.key}>
                  <div>
                    <strong>{issue.key}</strong>
                    <span>{issue.status}</span>
                  </div>
                  <p>{issue.summary}</p>
                  <small>{rationale.join(" · ")}</small>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <SectionHeading title="Attention" count={rundown.actionItems.length} />
            {rundown.blockers.length > 0 ? (
              <ul className="blockers">
                {rundown.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
            <ul className="actions">
              {rundown.actionItems.map((action) => (
                <li key={action}>{action}</li>
              ))}
              {rundown.actionItems.length === 0 ? (
                <li className="muted">No additional actions.</li>
              ) : null}
            </ul>
          </section>

          <section className="timesheet">
            <SectionHeading title="Timesheet" count={rundown.timesheet.entries.length} />
            <ul>
              {rundown.timesheet.entries.map((entry) => (
                <TimesheetRow key={entry.id} entry={entry} />
              ))}
            </ul>
            <div className="timesheet-total">
              <span>Total</span>
              <strong>{formatDuration(rundown.timesheet.totalMinutes)}</strong>
            </div>
          </section>

          <ActivityLogPanel entries={activityEntries} />
        </aside>
      </div>
    </main>
  );
}

function Status({
  message,
  tone = "neutral"
}: {
  message: string;
  tone?: "neutral" | "error";
}) {
  return (
    <main className={`status ${tone}`}>
      <span className="status-mark" />
      <p>{message}</p>
    </main>
  );
}

function Metric({
  value,
  label,
  tone = "normal"
}: {
  value: string | number;
  label: string;
  tone?: "normal" | "danger";
}) {
  return (
    <div className={`metric ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  );
}

function ScheduleRow({
  item,
  busy,
  onNudge
}: {
  item: ScheduleItem;
  busy?: boolean;
  onNudge?: (deltaMinutes: number) => void;
}) {
  const duration = (Date.parse(item.end) - Date.parse(item.start)) / 60_000;
  return (
    <li className={`timeline-row ${item.kind}`}>
      <time>
        {timeFormatter.format(new Date(item.start))}
        <span>{formatDuration(duration)}</span>
      </time>
      <div>
        <strong>{item.title}</strong>
        <span>{item.kind === "meeting" ? "Busy meeting" : `${item.issueKey} · Free`}</span>
        {item.kind === "work" && onNudge ? (
          <div className="schedule-nudge" aria-label={`Move ${item.title}`}>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => onNudge(-15)}
            >
              ← Earlier
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => onNudge(15)}
            >
              Later →
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TimesheetRow({ entry }: { entry: TimesheetEntry }) {
  return (
    <li>
      <div>
        <strong>{entry.code}</strong>
        <span>{entry.description}</span>
      </div>
      <time>{formatDuration(entry.minutes)}</time>
    </li>
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${remainder}m`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}
