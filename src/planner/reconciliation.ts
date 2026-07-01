import {
  ActualEntrySchema,
  ReconciliationDraftSchema,
  ReconciliationResultSchema,
  ReconciliationSuggestionSchema,
  TimesheetConfigurationSchema,
  type ActualEntry,
  type DailyRundown,
  type JiraIssue,
  type Meeting,
  type ReconciliationDraft,
  type ReconciliationResult,
  type ReconciliationSuggestion,
  type TimesheetConfiguration,
  type TimesheetEntry
} from "../contracts.js";
import { timesheetCodeForIssue } from "./prefix-rules.js";
import { durationMinutes } from "./time.js";

export interface PrepareReconciliationInput {
  originalRundown: DailyRundown;
  configuration: TimesheetConfiguration;
  refreshedContext?: {
    meetings?: Meeting[];
    workItems?: JiraIssue[];
    suggestions?: ReconciliationSuggestion[];
  };
}

export interface FinalizeReconciliationInput {
  draft: ReconciliationDraft;
  entries: ActualEntry[];
}

export function prepareWorkdayReconciliation(
  input: PrepareReconciliationInput
): ReconciliationDraft {
  const configuration = TimesheetConfigurationSchema.parse(input.configuration);
  const meetings = new Map(
    (input.refreshedContext?.meetings ?? []).map((meeting) => [
      meeting.id,
      meeting
    ])
  );
  const workItems = new Map(
    (input.refreshedContext?.workItems ?? []).map((item) => [item.key, item])
  );

  const entries = input.originalRundown.schedule
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((item): ActualEntry => {
      const plannedMinutes = Math.max(0, durationMinutes(item));
      const refreshedMeeting = item.kind === "meeting" ? meetings.get(item.id) : null;
      const actualMinutes = refreshedMeeting
        ? Math.max(0, durationMinutes(refreshedMeeting))
        : plannedMinutes;
      const issueKey = item.kind === "work" ? item.issueKey : null;
      const workItem = issueKey ? workItems.get(issueKey) : null;
      const sourceReferences: ActualEntry["sourceReferences"] = [
        {
          type: "planner",
          id: item.id,
          label: "Original workday plan"
        }
      ];
      if (refreshedMeeting) {
        sourceReferences.push({
          type: "calendar",
          id: refreshedMeeting.id,
          label: refreshedMeeting.title,
          ...(refreshedMeeting.webUrl ? { url: refreshedMeeting.webUrl } : {})
        });
      }
      if (workItem) {
        sourceReferences.push({
          type: "work_item",
          id: workItem.key,
          label: workItem.status
        });
      }

      return ActualEntrySchema.parse({
        id: `actual:${item.kind}:${item.id}`,
        plannedItemId: item.id,
        category: item.kind,
        title: refreshedMeeting?.title ?? item.title,
        plannedIssueKey: issueKey,
        issueKey,
        plannedMinutes,
        actualMinutes,
        completionStatus: deriveCompletionStatus(workItem?.status),
        notes:
          refreshedMeeting && actualMinutes !== plannedMinutes
            ? `Calendar duration changed from ${plannedMinutes} to ${actualMinutes} minutes.`
            : "",
        sourceReferences,
        confirmationState: "suggested",
        timesheetCode:
          item.kind === "meeting"
            ? configuration.meetingCode
            : timesheetCodeForIssue(
                item.issueKey,
                configuration.prefixMappings,
                configuration.internalCode
              )
      });
    });

  for (const rawSuggestion of input.refreshedContext?.suggestions ?? []) {
    const suggestion = ReconciliationSuggestionSchema.parse(rawSuggestion);
    const index = suggestion.plannedItemId
      ? entries.findIndex(
          (entry) => entry.plannedItemId === suggestion.plannedItemId
        )
      : -1;
    if (index >= 0) {
      const current = entries[index]!;
      entries[index] = ActualEntrySchema.parse({
        ...current,
        ...suggestion,
        plannedIssueKey: current.plannedIssueKey,
        sourceReferences:
          (suggestion.sourceReferences?.length ?? 0) > 0
            ? suggestion.sourceReferences
            : current.sourceReferences,
        confirmationState: "suggested",
        timesheetCode:
          suggestion.timesheetCode ??
          codeForSuggestion(suggestion, configuration)
      });
      continue;
    }

    entries.push(
      ActualEntrySchema.parse({
        ...suggestion,
        plannedItemId: null,
        category: suggestion.category ?? "unplanned",
        plannedIssueKey: null,
        issueKey: suggestion.issueKey ?? null,
        plannedMinutes: 0,
        completionStatus: suggestion.completionStatus ?? "unplanned",
        notes: suggestion.notes ?? "",
        sourceReferences: suggestion.sourceReferences ?? [],
        confirmationState: "suggested",
        timesheetCode:
          suggestion.timesheetCode ??
          codeForSuggestion(suggestion, configuration)
      })
    );
  }

  assertUniqueEntryIds(entries);
  return ReconciliationDraftSchema.parse({
    version: 1,
    date: input.originalRundown.date,
    originalRundown: input.originalRundown,
    configuration,
    entries,
    preparedAt: deterministicTimestamp(input.originalRundown.date, "prepared")
  });
}

export function finalizeWorkdayReconciliation(
  input: FinalizeReconciliationInput
): ReconciliationResult {
  const draft = ReconciliationDraftSchema.parse(input.draft);
  const entries = input.entries.map((entry) => ActualEntrySchema.parse(entry));
  assertUniqueEntryIds(entries);

  const unconfirmed = entries.filter(
    (entry) => entry.confirmationState !== "confirmed"
  );
  if (unconfirmed.length > 0) {
    throw new Error(
      `Confirm all app-derived suggestions before finalizing: ${unconfirmed
        .map((entry) => entry.id)
        .join(", ")}`
    );
  }

  const changes = buildChanges(draft.entries, entries, draft.configuration);
  const carryover = entries.flatMap((entry) => {
    if (
      entry.category !== "work" ||
      !["partial", "skipped", "replaced"].includes(entry.completionStatus)
    ) {
      return [];
    }
    const remainingMinutes =
      entry.completionStatus === "partial"
        ? Math.max(0, entry.plannedMinutes - entry.actualMinutes)
        : entry.plannedMinutes;
    if (remainingMinutes === 0) return [];
    return [
      {
        entryId: entry.id,
        plannedItemId: entry.plannedItemId,
        issueKey: entry.plannedIssueKey,
        title: entry.title,
        remainingMinutes,
        reason: entry.completionStatus as "partial" | "skipped" | "replaced"
      }
    ];
  });
  const { timesheet, warnings, requiresReview } = generateReconciledTimesheet(
    entries,
    draft.configuration
  );
  if (timesheet.trimmedMinutes > 0) {
    changes.push({
      entryId: "timesheet",
      type: "trimmed",
      summary: `Trimmed ${timesheet.trimmedMinutes} excess minutes to cap the day at ${timesheet.targetMinutes} minutes.`
    });
  }
  const approvalState =
    draft.configuration.approvalRequired || requiresReview
      ? "requires_review"
      : "approved";

  return ReconciliationResultSchema.parse({
    version: 1,
    date: draft.date,
    entries,
    changes,
    carryover,
    warnings,
    approvalState,
    timesheet,
    finalizedAt: deterministicTimestamp(draft.date, "finalized")
  });
}

export function generateReconciledTimesheet(
  entries: ActualEntry[],
  inputConfiguration: TimesheetConfiguration
): {
  timesheet: ReconciliationResult["timesheet"];
  warnings: string[];
  requiresReview: boolean;
} {
  const configuration = TimesheetConfigurationSchema.parse(inputConfiguration);
  const targetMinutes = Math.round(configuration.targetHours * 60);
  const warnings: string[] = [];
  const timesheetEntries: TimesheetEntry[] = [];

  for (const entry of entries) {
    if (entry.actualMinutes === 0) continue;
    if (entry.category === "meeting" && !configuration.countMeetings) continue;
    const minutes = roundToIncrement(
      entry.actualMinutes,
      configuration.roundingMinutes
    );
    if (minutes === 0) continue;
    timesheetEntries.push({
      id: `reconciled:${entry.id}`,
      code: entry.timesheetCode,
      description: entry.title,
      minutes,
      source:
        entry.category === "meeting"
          ? "meeting"
          : entry.category === "internal"
            ? "internal"
            : "work_item"
    });
  }

  let totalMinutes = sumMinutes(timesheetEntries);
  const balancesShortDays = [
    "fixed_day",
    "project_budget",
    "billable_split"
  ].includes(configuration.timeTrackingBasis);
  if (totalMinutes < targetMinutes && balancesShortDays) {
    timesheetEntries.push({
      id: "reconciled:balance",
      code: configuration.internalCode,
      description: "Internal planning, administration, and follow-ups",
      minutes: targetMinutes - totalMinutes,
      source: "internal"
    });
    totalMinutes = targetMinutes;
  }

  let trimmedMinutes = 0;
  if (
    totalMinutes > targetMinutes &&
    configuration.overtimePolicy === "cap_at_target"
  ) {
    let excess = totalMinutes - targetMinutes;
    for (let index = timesheetEntries.length - 1; index >= 0 && excess > 0; index -= 1) {
      const entry = timesheetEntries[index]!;
      if (entry.source === "meeting") continue;
      const reduction = Math.min(entry.minutes, excess);
      entry.minutes -= reduction;
      excess -= reduction;
      trimmedMinutes += reduction;
      if (entry.minutes === 0) timesheetEntries.splice(index, 1);
    }
    totalMinutes = sumMinutes(timesheetEntries);
    if (trimmedMinutes > 0) {
      warnings.push(
        `Capped the timesheet at ${targetMinutes} minutes by trimming ${trimmedMinutes} minutes from the final non-meeting work.`
      );
    }
    if (totalMinutes > targetMinutes) {
      warnings.push(
        `${totalMinutes - targetMinutes} excess meeting minutes could not be trimmed because meetings are protected.`
      );
    }
  }

  const requiresReview =
    configuration.overtimePolicy === "flag_for_review" &&
    totalMinutes !== targetMinutes;
  if (requiresReview) {
    warnings.push(
      `Actual time is ${totalMinutes} minutes versus the ${targetMinutes}-minute target. Review is required.`
    );
  }

  return {
    timesheet: {
      entries: timesheetEntries,
      totalMinutes,
      targetMinutes,
      trimmedMinutes
    },
    warnings,
    requiresReview
  };
}

function buildChanges(
  plannedEntries: ActualEntry[],
  actualEntries: ActualEntry[],
  configuration: TimesheetConfiguration
): ReconciliationResult["changes"] {
  const planned = new Map(plannedEntries.map((entry) => [entry.id, entry]));
  return actualEntries.flatMap((entry) => {
    const original = planned.get(entry.id);
    if (!original) {
      return [
        {
          entryId: entry.id,
          type: "unplanned_work" as const,
          summary: `Added unplanned work: ${entry.title}.`
        }
      ];
    }
    const changes: ReconciliationResult["changes"] = [];
    if (entry.actualMinutes !== original.plannedMinutes) {
      changes.push({
        entryId: entry.id,
        type: "duration_changed",
        summary: `${entry.title}: ${original.plannedMinutes} planned minutes, ${entry.actualMinutes} actual minutes.`
      });
    }
    if (entry.completionStatus !== "completed") {
      changes.push({
        entryId: entry.id,
        type:
          entry.completionStatus === "replaced"
            ? "work_replaced"
            : "status_changed",
        summary: `${entry.title} marked ${entry.completionStatus}.`
      });
    }
    const plannedCode =
      original.category === "meeting"
        ? configuration.meetingCode
        : original.plannedIssueKey
          ? timesheetCodeForIssue(
              original.plannedIssueKey,
              configuration.prefixMappings,
              configuration.internalCode
            )
          : configuration.internalCode;
    if (entry.timesheetCode !== plannedCode) {
      changes.push({
        entryId: entry.id,
        type: "code_changed",
        summary: `${entry.title}: timesheet code changed from ${plannedCode} to ${entry.timesheetCode}.`
      });
    }
    if (
      entry.actualMinutes === 0 ||
      (entry.category === "meeting" && !configuration.countMeetings)
    ) {
      changes.push({
        entryId: entry.id,
        type: "excluded",
        summary: `${entry.title} is excluded from the final timesheet.`
      });
    }
    return changes;
  });
}

function codeForSuggestion(
  suggestion: ReconciliationSuggestion,
  configuration: TimesheetConfiguration
): string {
  if (suggestion.category === "meeting") return configuration.meetingCode;
  if (!suggestion.issueKey) return configuration.internalCode;
  return timesheetCodeForIssue(
    suggestion.issueKey,
    configuration.prefixMappings,
    configuration.internalCode
  );
}

function deriveCompletionStatus(
  status?: string
): ActualEntry["completionStatus"] {
  if (status && /done|closed|resolved|complete/i.test(status)) return "completed";
  return "completed";
}

function assertUniqueEntryIds(entries: ActualEntry[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate reconciliation entry ID: ${entry.id}`);
    }
    ids.add(entry.id);
  }
}

function sumMinutes(entries: TimesheetEntry[]) {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}

function roundToIncrement(minutes: number, increment: number): number {
  if (minutes === 0) return 0;
  return Math.max(increment, Math.round(minutes / increment) * increment);
}

function deterministicTimestamp(date: string, phase: "prepared" | "finalized") {
  return `${date}T${phase === "prepared" ? "12:00:00" : "23:59:59"}.000Z`;
}
