import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import React, { useState } from "react";
import {
  TimesheetConfigurationSchema,
  type ConnectedTool,
  type TimesheetConfiguration
} from "../contracts.js";

const STORAGE_KEY = "technotracker.configuration.v1";

const WORK_TOOLS = [
  ["jira", "Jira"],
  ["azure_devops", "Azure DevOps"],
  ["linear", "Linear"],
  ["asana", "Asana"],
  ["clickup", "ClickUp"],
  ["monday", "Monday"],
  ["trello", "Trello"],
  ["github", "GitHub"],
  ["notion", "Notion"],
  ["hubspot", "HubSpot"],
  ["confluence", "Confluence"],
  ["google_drive", "Google Drive"],
  ["figma", "Figma"],
  ["supabase", "Supabase"],
  ["vercel", "Vercel"],
  ["xcode", "Xcode"],
  ["other_work", "Other"]
] as const;

const CALENDAR_TOOLS = [
  ["outlook", "Outlook"],
  ["google_calendar", "Google Calendar"],
  ["apple_calendar", "Apple Calendar"],
  ["other_calendar", "Other"]
] as const;

const COMMUNICATION_TOOLS = [
  ["teams", "Microsoft Teams"],
  ["slack", "Slack"],
  ["outlook_mail", "Outlook Mail"],
  ["gmail", "Gmail"],
  ["other_communication", "Other"]
] as const;

const REQUIRED_FIELDS = [
  ["project_code", "Project code"],
  ["ticket", "Ticket / task"],
  ["description", "Description"],
  ["billable", "Billable flag"],
  ["work_category", "Work category"]
] as const;

const TOOL_LABELS = new Map<ConnectedTool, string>([
  ...WORK_TOOLS,
  ...CALENDAR_TOOLS,
  ...COMMUNICATION_TOOLS
]);

type Step = 1 | 2 | 3 | 4;

export function OnboardingWidget({
  app,
  initialConfiguration,
  preview
}: {
  app: McpApp | null;
  initialConfiguration: TimesheetConfiguration;
  preview: boolean;
}) {
  const [step, setStep] = useState<Step>(1);
  const [configuration, setConfiguration] = useState<TimesheetConfiguration>(
    () => loadSavedConfiguration() ?? initialConfiguration
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  function patch(values: Partial<TimesheetConfiguration>) {
    setConfiguration((current) => ({ ...current, ...values }));
  }

  function selectedTools(): ConnectedTool[] {
    return [
      ...configuration.workTools,
      ...configuration.calendarTools,
      ...configuration.communicationTools
    ];
  }

  const selectedToolList = selectedTools();
  const connectionCounts = selectedToolList.reduce(
    (counts, tool) => {
      counts[connectionStatus(tool)] += 1;
      return counts;
    },
    { connected: 0, needs_connection: 0, manual: 0 }
  );

  function connectionStatus(tool: ConnectedTool) {
    return (
      configuration.toolConnections.find((connection) => connection.tool === tool)
        ?.status ?? "needs_connection"
    );
  }

  function setConnectionStatus(
    tool: ConnectedTool,
    status: TimesheetConfiguration["toolConnections"][number]["status"]
  ) {
    patch({
      toolConnections: [
        ...configuration.toolConnections.filter(
          (connection) => connection.tool !== tool
        ),
        { tool, status }
      ]
    });
  }

  async function save() {
    const parsed = TimesheetConfigurationSchema.safeParse(configuration);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the configuration.");
      setStatus("error");
      return;
    }

    setStatus("saving");
    setError("");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
      persistChatGptWidgetState(parsed.data);

      if (app) {
        await app.callServerTool({
          name: "save_technotracker_configuration",
          arguments: { configuration: parsed.data }
        });
        await app.updateModelContext({
          content: [
            {
              type: "text",
              text: configurationSummary(parsed.data)
            }
          ],
          structuredContent: {
            technotrackerConfiguration: parsed.data
          }
        });
      }

      setConfiguration(parsed.data);
      setStatus("saved");
    } catch (saveError) {
      setStatus("error");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save the setup."
      );
    }
  }

  async function continueInChat() {
    if (!app) return;
    await app.sendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text: workflowPrompt(configuration)
        }
      ]
    });
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <div>
          <p className="date">TechnoTracker setup</p>
          <h1>Fit the plan to your work.</h1>
          <p className="summary">
            Tell ChatGPT which tools supply your work context and how your company
            expects time to be recorded.
          </p>
        </div>
        <div className="privacy-note">
          <strong>No credentials</strong>
          <span>Connect work apps separately in ChatGPT.</span>
        </div>
      </header>

      <nav className="stepper" aria-label="Onboarding progress">
        {[
          [1, "Your day"],
          [2, "Your tools"],
          [3, "Time policy"],
          [4, "Workflow"]
        ].map(([number, label]) => (
          <button
            type="button"
            className={step === number ? "active" : ""}
            key={number}
            onClick={() => setStep(number as Step)}
          >
            <span>{number}</span>
            {label}
          </button>
        ))}
      </nav>

      <section className="onboarding-panel">
        {step === 1 ? (
          <div className="form-section">
            <div className="section-copy">
              <h2>Your working day</h2>
              <p>Set the boundaries used to schedule focus time and balance hours.</p>
            </div>
            <div className="form-grid">
              <Field label="Role">
                <input
                  value={configuration.role}
                  placeholder="Senior CMS engineer"
                  onChange={(event) => patch({ role: event.target.value })}
                />
              </Field>
              <Field label="Team">
                <input
                  value={configuration.team}
                  placeholder="Digital experience"
                  onChange={(event) => patch({ team: event.target.value })}
                />
              </Field>
              <Field label="Time zone">
                <input
                  value={configuration.timeZone}
                  placeholder="America/New_York"
                  onChange={(event) => patch({ timeZone: event.target.value })}
                />
              </Field>
              <Field label="Target hours">
                <input
                  type="number"
                  min="1"
                  max="16"
                  step="0.25"
                  value={configuration.targetHours}
                  onChange={(event) =>
                    patch({ targetHours: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Day starts">
                <input
                  type="time"
                  value={configuration.workdayStart}
                  onChange={(event) => patch({ workdayStart: event.target.value })}
                />
              </Field>
              <Field label="Day ends">
                <input
                  type="time"
                  value={configuration.workdayEnd}
                  onChange={(event) => patch({ workdayEnd: event.target.value })}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="form-section">
            <div className="section-copy">
              <h2>Your work toolset</h2>
              <p>
                These choices tell ChatGPT where to look after you approve the
                corresponding apps.
              </p>
            </div>
            <ChoiceGroup
              legend="Tasks and projects"
              options={WORK_TOOLS}
              selected={configuration.workTools}
              onChange={(workTools) => patch({ workTools })}
            />
            <ChoiceGroup
              legend="Calendar"
              options={CALENDAR_TOOLS}
              selected={configuration.calendarTools}
              onChange={(calendarTools) => patch({ calendarTools })}
            />
            <ChoiceGroup
              legend="Messages and email"
              options={COMMUNICATION_TOOLS}
              selected={configuration.communicationTools}
              onChange={(communicationTools) => patch({ communicationTools })}
            />
            <div className="connections">
              <div className="connection-heading">
                <div>
                  <h3>Connect your selected tools</h3>
                  <p>
                    Connect in ChatGPT, then return here and mark the tool connected.
                    If an app is blocked by company policy, choose manual import.
                  </p>
                </div>
              </div>
              <div className="connection-summary" aria-live="polite">
                <strong>
                  {connectionCounts.needs_connection === 0
                    ? "All selected tools are ready"
                    : `${connectionCounts.needs_connection} ${
                        connectionCounts.needs_connection === 1 ? "tool needs" : "tools need"
                      } attention`}
                </strong>
                <span>
                  {connectionCounts.connected} connected · {connectionCounts.manual} manual
                </span>
              </div>
              <ul className="connection-list">
                {selectedToolList.map((tool) => (
                  <ConnectionRow
                    key={tool}
                    label={TOOL_LABELS.get(tool) ?? tool}
                    status={connectionStatus(tool)}
                    onStatusChange={(nextStatus) =>
                      setConnectionStatus(tool, nextStatus)
                    }
                  />
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="form-section">
            <div className="section-copy">
              <h2>Company time policy</h2>
              <p>
                Capture how time is measured, entered, reviewed, and submitted.
              </p>
            </div>
            <div className="form-grid">
              <Field label="Timesheet system">
                <select
                  value={configuration.timesheetSystem}
                  onChange={(event) =>
                    patch({
                      timesheetSystem: event.target
                        .value as TimesheetConfiguration["timesheetSystem"]
                    })
                  }
                >
                  <option value="manual">Manual entry</option>
                  <option value="csv">CSV / spreadsheet</option>
                  <option value="tempo">Tempo</option>
                  <option value="harvest">Harvest</option>
                  <option value="clockify">Clockify</option>
                  <option value="replicon">Replicon</option>
                  <option value="workday">Workday</option>
                  <option value="sap">SAP</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              {configuration.timesheetSystem === "other" ? (
                <Field label="System name">
                  <input
                    value={configuration.timesheetSystemOther}
                    placeholder="Company timesheet"
                    onChange={(event) =>
                      patch({ timesheetSystemOther: event.target.value })
                    }
                  />
                </Field>
              ) : null}
              <Field label="Round entries to">
                <select
                  value={configuration.roundingMinutes}
                  onChange={(event) =>
                    patch({
                      roundingMinutes: Number(
                        event.target.value
                      ) as TimesheetConfiguration["roundingMinutes"]
                    })
                  }
                >
                  {[1, 5, 6, 10, 15, 30].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minute{minutes === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="How time is measured">
                <select
                  value={configuration.timeTrackingBasis}
                  onChange={(event) =>
                    patch({
                      timeTrackingBasis: event.target
                        .value as TimesheetConfiguration["timeTrackingBasis"]
                    })
                  }
                >
                  <option value="fixed_day">Fixed daily target</option>
                  <option value="actual_time">Actual time worked</option>
                  <option value="billable_split">Billable / non-billable split</option>
                  <option value="project_budget">Project budget allocation</option>
                </select>
              </Field>
              <Field label="Entry cadence">
                <select
                  value={configuration.entryCadence}
                  onChange={(event) =>
                    patch({
                      entryCadence: event.target
                        .value as TimesheetConfiguration["entryCadence"]
                    })
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="per_task">As work is completed</option>
                </select>
              </Field>
              <Field label="Submission timing">
                <input
                  value={configuration.submissionTiming}
                  placeholder="Friday by 4 PM"
                  onChange={(event) =>
                    patch({ submissionTiming: event.target.value })
                  }
                />
              </Field>
              <Field label="Meeting code">
                <input
                  value={configuration.meetingCode}
                  onChange={(event) => patch({ meetingCode: event.target.value })}
                />
              </Field>
              <Field label="Internal / balance code">
                <input
                  value={configuration.internalCode}
                  onChange={(event) => patch({ internalCode: event.target.value })}
                />
              </Field>
            </div>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={configuration.countMeetings}
                onChange={(event) => patch({ countMeetings: event.target.checked })}
              />
              <span>
                <strong>Count meetings as worked time</strong>
                <small>Otherwise meeting time is balanced into internal work.</small>
              </span>
            </label>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={configuration.approvalRequired}
                onChange={(event) =>
                  patch({ approvalRequired: event.target.checked })
                }
              />
              <span>
                <strong>Manager approval is required</strong>
                <small>Flag the generated sheet as a draft until reviewed.</small>
              </span>
            </label>

            <ChoiceGroup
              legend="Required fields"
              options={REQUIRED_FIELDS}
              selected={configuration.requiredFields}
              onChange={(requiredFields) => patch({ requiredFields })}
            />
          </div>
        ) : null}

        {step === 4 ? (
          <div className="form-section">
            <div className="section-copy">
              <h2>Your preferred workflow</h2>
              <p>
                Choose when TechnoTracker should plan, reconcile, and prepare time
                entries.
              </p>
            </div>
            <div className="form-grid">
              <Field label="Workflow">
                <select
                  value={configuration.workflow}
                  onChange={(event) =>
                    patch({
                      workflow: event.target
                        .value as TimesheetConfiguration["workflow"]
                    })
                  }
                >
                  <option value="morning_plan">Morning plan only</option>
                  <option value="end_of_day_reconcile">
                    End-of-day reconciliation
                  </option>
                  <option value="plan_and_reconcile">
                    Morning plan + end-of-day reconciliation
                  </option>
                  <option value="weekly_summary">Weekly summary</option>
                </select>
              </Field>
              <Field label="Run preference">
                <select
                  value={configuration.automationPreference}
                  onChange={(event) =>
                    patch({
                      automationPreference: event.target
                        .value as TimesheetConfiguration["automationPreference"]
                    })
                  }
                >
                  <option value="manual">Run manually</option>
                  <option value="daily_prompt">Prompt me each workday</option>
                  <option value="scheduled">Use a scheduled trigger</option>
                </select>
              </Field>
              <Field label="Entry descriptions">
                <select
                  value={configuration.descriptionStyle}
                  onChange={(event) =>
                    patch({
                      descriptionStyle: event.target
                        .value as TimesheetConfiguration["descriptionStyle"]
                    })
                  }
                >
                  <option value="concise">Concise</option>
                  <option value="detailed">Detailed</option>
                  <option value="company_template">Company template</option>
                </select>
              </Field>
              <Field label="Overtime handling">
                <select
                  value={configuration.overtimePolicy}
                  onChange={(event) =>
                    patch({
                      overtimePolicy: event.target
                        .value as TimesheetConfiguration["overtimePolicy"]
                    })
                  }
                >
                  <option value="cap_at_target">Cap at target hours</option>
                  <option value="include_actual">Include actual time</option>
                  <option value="flag_for_review">Flag for review</option>
                </select>
              </Field>
            </div>

            <fieldset className="mapping-list">
              <legend>Ticket prefix mappings</legend>
              <p>Use {"{ticket}"} when the timesheet code should be the ticket key.</p>
              {configuration.prefixMappings.map((mapping, index) => (
                <div className="mapping-row" key={`${mapping.prefix}-${index}`}>
                  <input
                    aria-label={`Prefix ${index + 1}`}
                    value={mapping.prefix}
                    onChange={(event) =>
                      patch({
                        prefixMappings: configuration.prefixMappings.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, prefix: event.target.value }
                              : item
                        )
                      })
                    }
                  />
                  <input
                    aria-label={`Label ${index + 1}`}
                    value={mapping.label}
                    onChange={(event) =>
                      patch({
                        prefixMappings: configuration.prefixMappings.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, label: event.target.value }
                              : item
                        )
                      })
                    }
                  />
                  <input
                    aria-label={`Timesheet code ${index + 1}`}
                    value={mapping.timesheetCode}
                    onChange={(event) =>
                      patch({
                        prefixMappings: configuration.prefixMappings.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, timesheetCode: event.target.value }
                              : item
                        )
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove mapping ${index + 1}`}
                    onClick={() =>
                      patch({
                        prefixMappings: configuration.prefixMappings.filter(
                          (_, itemIndex) => itemIndex !== index
                        )
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  patch({
                    prefixMappings: [
                      ...configuration.prefixMappings,
                      { prefix: "NEW", label: "Project", timesheetCode: "{ticket}" }
                    ]
                  })
                }
              >
                Add mapping
              </button>
            </fieldset>
          </div>
        ) : null}
      </section>

      <footer className="onboarding-actions">
        <p aria-live="polite" className={status === "error" ? "error-copy" : ""}>
          {status === "saved"
            ? "Setup saved. ChatGPT can use these rules in this conversation."
            : status === "error"
              ? error
              : "Preferences only. Never enter passwords or access tokens."}
        </p>
        <div>
          {step > 1 ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep((step - 1) as Step)}
            >
              Back
            </button>
          ) : null}
          {step < 4 ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => setStep((step + 1) as Step)}
            >
              Continue
            </button>
          ) : status === "saved" && !preview ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void continueInChat()}
            >
              Start my workflow
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={status === "saving"}
              onClick={() => void save()}
            >
              {status === "saving" ? "Saving…" : "Save setup"}
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ConnectionRow({
  label,
  status,
  onStatusChange
}: {
  label: string;
  status: TimesheetConfiguration["toolConnections"][number]["status"];
  onStatusChange: (
    status: TimesheetConfiguration["toolConnections"][number]["status"]
  ) => void;
}) {
  return (
    <li className={`connection-row ${status}`}>
      <div className="connection-state">
        <strong>{label}</strong>
        <span>
          {status === "connected"
            ? "Ready to use"
            : status === "manual"
              ? "You’ll provide the data"
              : "Connection required"}
        </span>
      </div>
      <div className="connection-actions">
        {status === "needs_connection" ? (
          <>
            <a
              href="https://chatgpt.com/apps"
              target="_blank"
              rel="noreferrer"
              className="connect-link"
            >
              Connect in ChatGPT
            </a>
            <button type="button" onClick={() => onStatusChange("connected")}>
              Already connected
            </button>
            <button type="button" onClick={() => onStatusChange("manual")}>
              Use manual import
            </button>
          </>
        ) : status === "connected" ? (
          <>
            <span className="status-badge">Connected</span>
            <button type="button" onClick={() => onStatusChange("manual")}>
              Use manual instead
            </button>
          </>
        ) : (
          <>
            <span className="status-badge">Manual import</span>
            <button type="button" onClick={() => onStatusChange("connected")}>
              Mark connected
            </button>
            <a
              href="https://chatgpt.com/apps"
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Connect instead
            </a>
          </>
        )}
      </div>
    </li>
  );
}

function ChoiceGroup<T extends string>({
  legend,
  options,
  selected,
  onChange
}: {
  legend: string;
  options: readonly (readonly [T, string])[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      <div>
        {options.map(([value, label]) => {
          const checked = selected.includes(value);
          return (
            <label key={value} className={checked ? "selected" : ""}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((item) => item !== value)
                      : [...selected, value]
                  )
                }
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function loadSavedConfiguration(): TimesheetConfiguration | null {
  const widgetState = getChatGptWidgetState();
  const candidates = [
    widgetState?.technotrackerConfiguration,
    readLocalConfiguration()
  ];
  for (const candidate of candidates) {
    const parsed = TimesheetConfigurationSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function readLocalConfiguration(): unknown {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function configurationSummary(configuration: TimesheetConfiguration): string {
  return [
    "TechnoTracker configuration:",
    `- Role/team: ${configuration.role || "not specified"} / ${configuration.team || "not specified"}`,
    `- Workday: ${configuration.workdayStart}-${configuration.workdayEnd} ${configuration.timeZone}; ${configuration.targetHours} target hours`,
    `- Work tools: ${configuration.workTools.join(", ") || "none selected"}`,
    `- Calendar: ${configuration.calendarTools.join(", ") || "none selected"}`,
    `- Communication: ${configuration.communicationTools.join(", ") || "none selected"}`,
    `- App connections: ${configuration.toolConnections
      .filter((connection) =>
        selectedConfigurationTools(configuration).includes(connection.tool)
      )
      .map((connection) => `${connection.tool}=${connection.status}`)
      .join(", ") || "none selected"}`,
    `- Timesheet: ${configuration.timesheetSystem}; ${configuration.roundingMinutes}-minute rounding`,
    `- Policy: ${configuration.timeTrackingBasis}; ${configuration.entryCadence}; submit ${configuration.submissionTiming}; approval ${configuration.approvalRequired ? "required" : "not required"}`,
    `- Workflow: ${configuration.workflow}; ${configuration.automationPreference}; ${configuration.descriptionStyle} descriptions; overtime ${configuration.overtimePolicy}`,
    `- Meetings: ${configuration.countMeetings ? configuration.meetingCode : "excluded"}`,
    `- Internal code: ${configuration.internalCode}`,
    `- Prefix mappings: ${configuration.prefixMappings
      .map(
        (mapping) =>
          `${mapping.prefix} -> ${mapping.label} / ${mapping.timesheetCode}`
      )
      .join("; ")}`
  ].join("\n");
}

function selectedConfigurationTools(
  configuration: TimesheetConfiguration
): ConnectedTool[] {
  return [
    ...configuration.workTools,
    ...configuration.calendarTools,
    ...configuration.communicationTools
  ];
}

function workflowPrompt(configuration: TimesheetConfiguration): string {
  const base =
    "Use my saved TechnoTracker configuration and only my approved, connected apps.";
  switch (configuration.workflow) {
    case "morning_plan":
      return `${base} Gather today's relevant work context and generate my morning workday plan.`;
    case "end_of_day_reconcile":
      return `${base} Reconcile today's completed work against meetings and tasks, then prepare my timesheet draft.`;
    case "weekly_summary":
      return `${base} Gather this week's completed work and prepare a weekly time summary using my company rules.`;
    default:
      return `${base} Generate today's workday plan now and remind me to reconcile actual work at the end of the day.`;
  }
}

type ChatGptWindow = Window & {
  openai?: {
    widgetState?: {
      technotrackerConfiguration?: unknown;
      technotrackerReconciliationDrafts?: unknown;
      technotrackerActivityLog?: unknown;
    };
    setWidgetState?: (state: unknown) => void | Promise<void>;
  };
};

function getChatGptWidgetState() {
  return (window as ChatGptWindow).openai?.widgetState;
}

function persistChatGptWidgetState(configuration: TimesheetConfiguration) {
  const openai = (window as ChatGptWindow).openai;
  if (openai?.setWidgetState) {
    void openai.setWidgetState({
      ...(openai.widgetState ?? {}),
      technotrackerConfiguration: configuration
    });
  }
}
