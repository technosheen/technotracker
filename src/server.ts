import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  JiraIssueSchema,
  MailMessageSchema,
  MeetingSchema,
  TeamsMessageSchema,
  TimesheetConfigurationSchema
} from "./contracts.js";
import { planExplicitWorkday } from "./plan-workday.js";

const SERVER_VERSION = "0.2.0";
const WIDGET_URI = "ui://technotracker/workday.html";
const widgetPath = path.resolve(process.cwd(), "dist", "widget", "index.html");

export function createPlannerMcpServer(): McpServer {
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
        ui: { resourceUri: WIDGET_URI }
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
          }
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
            "Normalized tasks or tickets selected from the user's approved Jira, Azure DevOps, Linear, Asana, ClickUp, Monday, Trello, GitHub, or Notion app."
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
        ui: { resourceUri: WIDGET_URI }
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
            }
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

  registerAppResource(
    server,
    "TechnoTracker workday",
    WIDGET_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "Interactive onboarding and a compact schedule, priorities, blockers, action items, and balanced timesheet.",
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: []
          }
        }
      }
    },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: readWidgetHtml()
        }
      ]
    })
  );

  return server;
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
