import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import type { DailyRundown, ScheduleItem, TimesheetEntry } from "../contracts.js";
import React, { useMemo, useState } from "react";
import { previewRundown } from "./preview-data.js";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit"
});

export function PlannerWidget() {
  const preview = new URLSearchParams(window.location.search).has("preview");
  const [rundown, setRundown] = useState<DailyRundown | null>(() =>
    preview ? previewRundown : null
  );
  const { app, error } = useApp({
    appInfo: { name: "TechnoTracker", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      createdApp.ontoolresult = (result) => {
        setRundown(result.structuredContent as unknown as DailyRundown);
      };
    }
  });
  useHostStyles(app, app?.getHostContext());

  const focusMinutes = useMemo(
    () =>
      rundown?.schedule.reduce(
        (total, item) =>
          item.kind === "work"
            ? total + (Date.parse(item.end) - Date.parse(item.start)) / 60_000
            : total,
        0
      ) ?? 0,
    [rundown]
  );

  if (!preview && error) {
    return <Status message={`Connection failed: ${error.message}`} tone="error" />;
  }
  if (!preview && !app) return <Status message="Connecting to ChatGPT…" />;
  if (!rundown) return <Status message="Waiting for the workday plan…" />;

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

      <div className="content-grid">
        <section>
          <SectionHeading title="Schedule" count={rundown.schedule.length} />
          <ol className="timeline">
            {rundown.schedule.map((item) => (
              <ScheduleRow key={`${item.kind}-${item.id}`} item={item} />
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

function ScheduleRow({ item }: { item: ScheduleItem }) {
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
