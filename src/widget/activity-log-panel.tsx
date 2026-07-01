import React from "react";
import type { ActivityEntry } from "./activity-log.js";

const activityTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit"
});

export function ActivityLogPanel({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="activity-log" aria-label="Activity">
      <div className="section-heading">
        <h2>Activity</h2>
        <span>{entries.length}</span>
      </div>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id} className={`activity-row ${entry.kind}`}>
            <time>{activityTimeFormatter.format(new Date(entry.at))}</time>
            <span>{entry.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
