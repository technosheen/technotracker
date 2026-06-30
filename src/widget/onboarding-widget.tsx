import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import React, { useState } from "react";
import {
  TimesheetConfigurationSchema,
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
  ["other", "Other"]
] as const;

const CALENDAR_TOOLS = [
  ["outlook", "Outlook"],
  ["google_calendar", "Google Calendar"],
  ["apple_calendar", "Apple Calendar"],
  ["other", "Other"]
] as const;

const COMMUNICATION_TOOLS = [
  ["teams", "Microsoft Teams"],
  ["slack", "Slack"],
  ["outlook_mail", "Outlook Mail"],
  ["gmail", "Gmail"],
  ["other", "Other"]
] as const;

const REQUIRED_FIELDS = [
  ["project_code", "Project code"],
  ["ticket", "Ticket / task"],
  ["description", "Description"],
  ["billable", "Billable flag"],
  ["work_category", "Work category"]
] as const;

type Step = 1 | 2 | 3;

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
          text:
            "Use my saved TechnoTracker configuration. Gather today's relevant work context from my approved apps and generate my workday plan."
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
          [3, "Timesheets"]
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
          </div>
        ) : null}

        {step === 3 ? (
          <div className="form-section">
            <div className="section-copy">
              <h2>Company timesheet rules</h2>
              <p>
                Configure the output you will copy into your company’s timesheet
                system.
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

            <ChoiceGroup
              legend="Required fields"
              options={REQUIRED_FIELDS}
              selected={configuration.requiredFields}
              onChange={(requiredFields) => patch({ requiredFields })}
            />

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
          {step < 3 ? (
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
              Build today’s plan
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
    `- Timesheet: ${configuration.timesheetSystem}; ${configuration.roundingMinutes}-minute rounding`,
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

type ChatGptWindow = Window & {
  openai?: {
    widgetState?: { technotrackerConfiguration?: unknown };
    setWidgetState?: (state: unknown) => Promise<void>;
  };
};

function getChatGptWidgetState() {
  return (window as ChatGptWindow).openai?.widgetState;
}

function persistChatGptWidgetState(configuration: TimesheetConfiguration) {
  const openai = (window as ChatGptWindow).openai;
  if (openai?.setWidgetState) {
    void openai.setWidgetState({
      technotrackerConfiguration: configuration
    });
  }
}
