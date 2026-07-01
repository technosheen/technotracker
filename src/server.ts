import {
  registerAppResource,
  registerAppTool
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createUIResource } from "@mcp-ui/server";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ActualEntrySchema,
  DEFAULT_TIMESHEET_CONFIGURATION,
  DailyRundownSchema,
  JiraIssueSchema,
  MailMessageSchema,
  MeetingSchema,
  ReconciliationDraftSchema,
  ReconciliationSuggestionSchema,
  TeamsMessageSchema,
  TimesheetConfigurationSchema
} from "./contracts.js";
import { planExplicitWorkday } from "./plan-workday.js";
import {
  finalizeWorkdayReconciliation,
  prepareWorkdayReconciliation
} from "./planner/reconciliation.js";
import { adjustScheduleItem } from "./planner/schedule-edit.js";

const SERVER_VERSION = "0.5.0";
const WIDGET_URI = "ui://technotracker/workday.html" as const;
const APPS_TEMPLATE_URI = "ui://technotracker/apps-sdk/workday.html" as const;
const widgetPath = path.resolve(process.cwd(), "dist", "widget", "index.html");

export function createPlannerMcpServer(): McpServer {
  const widgetHtml = readWidgetHtml();
  const mcpUiResource = createUIResource({
    uri: WIDGET_URI,
    encoding: "text",
    content: { type: "rawHtml", htmlString: widgetHtml },
    metadata: {
      title: "TechnoTracker workday",
      description:
        "Interactive work-tool onboarding, company time policy, a balanced workday plan, and end-of-day reconciliation."
    }
  });
  const appsSdkTemplate = createUIResource({
    uri: APPS_TEMPLATE_URI,
    encoding: "text",
    content: { type: "rawHtml", htmlString: widgetHtml },
    adapters: {
      appsSdk: {
        enabled: true,
        config: { intentHandling: "prompt" }
      }
    },
    metadata: {
      "openai/widgetDescription":
        "Configure work apps and company time policy, review a deterministic schedule, and confirm actual work before finalizing a timesheet.",
      "openai/widgetPrefersBorder": true,
      "openai/widgetCSP": {
        connect_domains: [],
        resource_domains: []
      }
    }
  });

  const server = new McpServer({
    name: "technotracker",
    version: SERVER_VERSION
  });

  registerAppTool(
    server,
    "show_technotracker_onboarding",
    {
      title: "Set up TechnoTracker",
      description:
        "Use this when the user wants to configure TechnoTracker, change their work tools, or define company timesheet rules. It opens an interactive onboarding form and never requests credentials.",
      inputSchema: {
        existingConfiguration: TimesheetConfigurationSchema.optional().describe(
          "A previously saved TechnoTracker configuration from the conversation."
        )
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": APPS_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Opening TechnoTracker setup…",
        "openai/toolInvocation/invoked": "TechnoTracker setup ready",
        "openai/widgetAccessible": true
      }
    },
    async ({ existingConfiguration }) => {
      const configuration = TimesheetConfigurationSchema.parse(
        existingConfiguration ?? DEFAULT_TIMESHEET_CONFIGURATION
      );
      return {
        content: [
          {
            type: "text" as const,
            text:
              "Use the embedded onboarding form to describe your work tools and company timesheet rules. Do not enter passwords, API keys, or access tokens."
          },
          mcpUiResource
        ],
        structuredContent: {
          view: "onboarding" as const,
          configuration
        }
      };
    }
  );

  registerAppTool(
    server,
    "save_technotracker_configuration",
    {
      title: "Validate TechnoTracker configuration",
      description:
        "Validate a TechnoTracker onboarding configuration submitted from the embedded app. This stores no credentials and performs no external writes.",
      inputSchema: {
        configuration: TimesheetConfigurationSchema
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { visibility: ["app"] }
      }
    },
    async ({ configuration }) => {
      const validated = TimesheetConfigurationSchema.parse(configuration);
      return {
        content: [
          {
            type: "text" as const,
            text: "TechnoTracker configuration validated."
          }
        ],
        structuredContent: { configuration: validated }
      };
    }
  );

  registerAppTool(
    server,
    "generate_workday_plan",
    {
      title: "Generate workday plan",
      description:
        "Use this after onboarding and after gathering explicitly selected work context from the user's approved ChatGPT apps. It builds a deterministic meeting-safe schedule and a balanced timesheet using the user's company rules. It cannot retrieve private data or write to external systems.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Planner date in YYYY-MM-DD format."),
        issues: z
          .array(JiraIssueSchema)
          .default([])
          .describe("Legacy Jira issues selected from the user's approved Jira app."),
        workItems: z
          .array(JiraIssueSchema)
          .default([])
          .describe(
            "Normalized tasks or work items selected from the user's approved project, source-control, CRM, knowledge, design, data, deployment, or development apps."
          ),
        meetings: z
          .array(MeetingSchema)
          .default([])
          .describe("Real meetings selected from the user's calendar."),
        mail: z
          .array(MailMessageSchema)
          .default([])
          .describe("High-signal unread messages selected for planning."),
        teams: z
          .array(TeamsMessageSchema)
          .default([])
          .describe("Teams messages selected for planning."),
        configuration: TimesheetConfigurationSchema.optional().describe(
          "The user's validated TechnoTracker onboarding configuration. Use defaults only when the user has not onboarded."
        )
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": APPS_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Building your workday…",
        "openai/toolInvocation/invoked": "Workday plan ready",
        "openai/widgetAccessible": true
      }
    },
    async ({
      date,
      issues,
      workItems,
      meetings,
      mail,
      teams,
      configuration
    }) => {
      try {
        const validatedConfiguration = TimesheetConfigurationSchema.parse(
          configuration ?? DEFAULT_TIMESHEET_CONFIGURATION
        );
        const normalizedWorkItems = [
          ...new Map(
            [...issues, ...workItems].map((item) => [
              `${item.source ?? "jira"}:${item.key}`,
              item
            ])
          ).values()
        ];
        const rundown = planExplicitWorkday({
          ...(date ? { date } : {}),
          issues: normalizedWorkItems,
          meetings,
          mail,
          teams,
          configuration: validatedConfiguration
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${rundown.summary} The embedded planner shows the schedule and a balanced ${rundown.timesheet.totalMinutes / 60}-hour timesheet for ${validatedConfiguration.timesheetSystem}.`
            },
            mcpUiResource
          ],
          structuredContent: {
            view: "plan" as const,
            configuration: validatedConfiguration,
            rundown
          }
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The TechnoTracker request failed.";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }]
        };
      }
    }
  );

  registerAppTool(
    server,
    "adjust_schedule_item",
    {
      title: "Adjust a schedule item",
      description:
        "Use this to move a single planned work block to a new time without regenerating the whole plan, for example when the user says a task should happen earlier or later today. Preserve the block's duration. Meetings are immutable and cannot be adjusted. It performs no external writes.",
      inputSchema: {
        rundown: DailyRundownSchema,
        configuration: TimesheetConfigurationSchema,
        itemId: z.string().trim().min(1).max(200).describe("The schedule item id to move."),
        start: z.string().datetime().describe("The new start time, ISO 8601."),
        end: z.string().datetime().describe("The new end time, ISO 8601.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": APPS_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Adjusting the schedule…",
        "openai/toolInvocation/invoked": "Schedule updated",
        "openai/widgetAccessible": true
      }
    },
    async ({ rundown, configuration, itemId, start, end }) => {
      try {
        const validatedConfiguration = TimesheetConfigurationSchema.parse(configuration);
        const updatedRundown = adjustScheduleItem({
          rundown,
          configuration: validatedConfiguration,
          itemId,
          start,
          end
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Moved the item to ${start}–${end}. The timesheet stays balanced at ${updatedRundown.timesheet.totalMinutes / 60} hours.`
            },
            mcpUiResource
          ],
          structuredContent: {
            view: "plan" as const,
            configuration: validatedConfiguration,
            rundown: updatedRundown
          }
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerAppTool(
    server,
    "prepare_workday_reconciliation",
    {
      title: "Prepare workday reconciliation",
      description:
        "Use this when the user wants to reconcile a generated workday plan. Pass the original rundown plus refreshed context gathered from only the user's approved apps. It suggests actual work for explicit confirmation and performs no external writes.",
      inputSchema: {
        originalRundown: DailyRundownSchema,
        configuration: TimesheetConfigurationSchema,
        refreshedContext: z
          .object({
            meetings: z.array(MeetingSchema).default([]),
            workItems: z.array(JiraIssueSchema).default([]),
            suggestions: z.array(ReconciliationSuggestionSchema).default([])
          })
          .default({ meetings: [], workItems: [], suggestions: [] })
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": APPS_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Preparing actual work…",
        "openai/toolInvocation/invoked": "Reconciliation ready",
        "openai/widgetAccessible": true
      }
    },
    async ({ originalRundown, configuration, refreshedContext }) => {
      try {
        const draft = prepareWorkdayReconciliation({
          originalRundown,
          configuration,
          refreshedContext
        });
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Review every suggested actual, adjust durations, status, issue keys, and timesheet codes, then explicitly confirm each suggestion before finalizing."
            },
            mcpUiResource
          ],
          structuredContent: {
            view: "reconciliation" as const,
            phase: "draft" as const,
            draft
          }
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerAppTool(
    server,
    "finalize_workday_reconciliation",
    {
      title: "Finalize workday reconciliation",
      description:
        "Use this after the user confirms all suggested actual entries, including chat edits such as longer meetings, replaced tickets, and unfinished work moved to tomorrow. It deterministically returns deviations, carryover, warnings, approval state, and a reconciled timesheet without writing to Jira, calendars, or timesheet systems.",
      inputSchema: {
        draft: ReconciliationDraftSchema,
        entries: z.array(ActualEntrySchema)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": APPS_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Reconciling your day…",
        "openai/toolInvocation/invoked": "Day reconciled",
        "openai/widgetAccessible": true
      }
    },
    async ({ draft, entries }) => {
      try {
        const result = finalizeWorkdayReconciliation({ draft, entries });
        return {
          content: [
            {
              type: "text" as const,
              text: `Reconciliation complete: ${result.timesheet.totalMinutes} minutes, ${result.carryover.length} carryover item(s), approval ${result.approvalState}.`
            },
            mcpUiResource
          ],
          structuredContent: {
            view: "reconciliation" as const,
            phase: "final" as const,
            draft,
            result
          }
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerAppResource(
    server,
    "TechnoTracker MCP-UI workday",
    WIDGET_URI,
    {
      mimeType: mcpUiResource.resource.mimeType,
      description:
        "Portable MCP-UI resource for onboarding, planning, and reconciliation."
    },
    async () => ({
      contents: [mcpUiResource.resource]
    })
  );

  server.registerResource(
    "TechnoTracker Apps SDK template",
    APPS_TEMPLATE_URI,
    {
      mimeType: appsSdkTemplate.resource.mimeType,
      description: "ChatGPT Apps SDK template generated by @mcp-ui/server."
    },
    async () => ({
      contents: [appsSdkTemplate.resource]
    })
  );

  return server;
}

function toolError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "The TechnoTracker request failed.";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }]
  };
}

export function createHttpApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      name: "technotracker",
      version: SERVER_VERSION
    });
  });

  app.get("/preview", (_request, response) => {
    response.type("html").send(readWidgetHtml());
  });

  app.all("/mcp", async (request, response) => {
    const server = createPlannerMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("Apps SDK MCP request failed", error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        });
      }
    }
  });

  return app;
}

function readWidgetHtml(): string {
  if (!fs.existsSync(widgetPath)) {
    throw new Error(
      `Planner widget not found at ${widgetPath}. Run npm run build.`
    );
  }
  return fs.readFileSync(widgetPath, "utf8");
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.CHATGPT_APP_PORT ?? "8000", 10);
  createHttpApp().listen(port, () => {
    console.log(`TechnoTracker MCP listening on http://localhost:${port}/mcp`);
  });
}
