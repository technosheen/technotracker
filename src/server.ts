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
import { planExplicitWorkday } from "./plan-workday.js";

const SERVER_VERSION = "0.1.0";
const WIDGET_URI = "ui://technotracker/dashboard.html";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const widgetPath = path.resolve(process.cwd(), "dist", "widget", "index.html");

const meetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  showAs: z.literal("busy").default("busy"),
  webUrl: z.string().url().optional()
});

const mailSchema = z.object({
  id: z.string(),
  subject: z.string(),
  sender: z.string(),
  preview: z.string(),
  receivedAt: z.string().datetime(),
  webUrl: z.string().url().optional()
});

const teamsSchema = z.object({
  id: z.string(),
  author: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  webUrl: z.string().url().optional()
});

const jiraIssueSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/),
  summary: z.string(),
  description: z.string().default(""),
  status: z.string(),
  priority: z.enum([
    "Highest",
    "High",
    "Medium",
    "Low",
    "Lowest",
    "Unprioritized"
  ]),
  dueDate: z.string().date().nullable().default(null),
  updatedAt: z.string().datetime(),
  assignee: z.string().nullable().default(null),
  mentionsCurrentUser: z.boolean().default(false),
  blocked: z.boolean().default(false)
});

export function createPlannerMcpServer(): McpServer {
  const server = new McpServer({
    name: "technotracker",
    version: SERVER_VERSION
  });

  registerAppTool(
    server,
    "generate_workday_plan",
    {
      title: "Generate workday plan",
      description:
        "Build a deterministic schedule and exactly eight-hour timesheet from Jira issues, meetings, unread mail, and Teams messages explicitly selected by the user or other approved ChatGPT apps. This tool is stateless and cannot retrieve private data or write to external systems.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Planner date in YYYY-MM-DD format."),
        issues: z
          .array(jiraIssueSchema)
          .default([])
          .describe("Jira issues selected from the user's approved Jira app."),
        meetings: z
          .array(meetingSchema)
          .default([])
          .describe("Real meetings selected from the user's calendar."),
        mail: z
          .array(mailSchema)
          .default([])
          .describe("High-signal unread messages selected for planning."),
        teams: z
          .array(teamsSchema)
          .default([])
          .describe("Teams messages selected for planning.")
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
    async ({ date, issues, meetings, mail, teams }) => {
      try {
        const rundown = planExplicitWorkday({
          ...(date ? { date } : {}),
          issues,
          meetings,
          mail,
          teams
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${rundown.summary} The embedded planner shows the schedule and exactly ${rundown.timesheet.totalMinutes / 60} timesheet hours.`
            }
          ],
          structuredContent: rundown
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
    "TechnoTracker dashboard",
    WIDGET_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "A compact schedule, priorities, blockers, action items, and eight-hour timesheet dashboard."
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
