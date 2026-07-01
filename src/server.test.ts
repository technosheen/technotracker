import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_TIMESHEET_CONFIGURATION,
  type DailyRundown
} from "./contracts.js";
import { prepareWorkdayReconciliation } from "./planner/reconciliation.js";
import { createHttpApp } from "./server.js";

describe("Apps SDK MCP server", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createHttpApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("advertises onboarding, planner, and reconciliation tools", async () => {
    const response = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    });

    expect(response).toContain('"name":"show_technotracker_onboarding"');
    expect(response).toContain('"name":"save_technotracker_configuration"');
    expect(response).toContain('"name":"generate_workday_plan"');
    expect(response).toContain('"name":"prepare_workday_reconciliation"');
    expect(response).toContain('"name":"finalize_workday_reconciliation"');
    expect(response).toContain('"readOnlyHint":true');
    expect(response).toContain('"visibility":["app"]');
    expect(response).toContain(
      '"openai/outputTemplate":"ui://technotracker/apps-sdk/workday.html"'
    );
    expect(response).toContain(
      '"resourceUri":"ui://technotracker/workday.html"'
    );
  });

  it("publishes MCP-UI and ChatGPT Apps SDK resources", async () => {
    const listed = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 4,
      method: "resources/list",
      params: {}
    });

    expect(listed).toContain('"uri":"ui://technotracker/workday.html"');
    expect(listed).toContain(
      '"uri":"ui://technotracker/apps-sdk/workday.html"'
    );
    expect(listed).toContain('"mimeType":"text/html;profile=mcp-app"');
    expect(listed).toContain('"mimeType":"text/html+skybridge"');

    const template = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "ui://technotracker/apps-sdk/workday.html" }
    });

    expect(template).toContain("MCPUIAppsSdkAdapter");
    expect(template).toContain('"mimeType":"text/html+skybridge"');
  });

  it("returns a meeting-safe, exactly eight-hour plan", async () => {
    const response = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "generate_workday_plan",
        arguments: {
          date: "2026-06-30",
          issues: [
            {
              key: "HUB-235",
              summary: "Shared fragments",
              status: "In Progress",
              priority: "High",
              updatedAt: "2026-06-30T12:00:00.000Z",
              assignee: "Sean Mahoney"
            }
          ],
          meetings: [
            {
              id: "meeting-1",
              title: "Planning",
              start: "2026-06-30T14:00:00.000Z",
              end: "2026-06-30T15:00:00.000Z"
            }
          ],
          mail: [],
          teams: []
        }
      }
    });

    expect(response).toContain('"totalMinutes":480');
    expect(response).toContain('"showAs":"busy"');
    expect(response).toContain('"showAs":"free"');
    expect(response).toContain('"type":"resource"');
    expect(response).toContain('"mimeType":"text/html;profile=mcp-app"');
  });

  it("renders onboarding with validated defaults", async () => {
    const response = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "show_technotracker_onboarding",
        arguments: {}
      }
    });

    expect(response).toContain('"view":"onboarding"');
    expect(response).toContain('"targetHours":8');
    expect(response).toContain('"meetingCode":"INT-58"');
  });

  it("supports model- and widget-driven reconciliation calls", async () => {
    const originalRundown = reconciliationRundown();
    const prepared = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "prepare_workday_reconciliation",
        arguments: {
          originalRundown,
          configuration: DEFAULT_TIMESHEET_CONFIGURATION,
          refreshedContext: {
            meetings: [],
            workItems: [],
            suggestions: []
          }
        }
      }
    });
    expect(prepared).toContain('"view":"reconciliation"');
    expect(prepared).toContain('"phase":"draft"');
    expect(prepared).toContain('"confirmationState":"suggested"');

    const draft = prepareWorkdayReconciliation({
      originalRundown,
      configuration: DEFAULT_TIMESHEET_CONFIGURATION
    });
    const finalized = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "finalize_workday_reconciliation",
        arguments: {
          draft,
          entries: draft.entries.map((entry) => ({
            ...entry,
            confirmationState: "confirmed"
          }))
        }
      }
    });
    expect(finalized).toContain('"phase":"final"');
    expect(finalized).toContain('"totalMinutes":480');
    expect(finalized).toContain('"approvalState":"approved"');
  });
});

function reconciliationRundown(): DailyRundown {
  return {
    date: "2026-06-30",
    summary: "One work block.",
    priorities: [],
    blockers: [],
    actionItems: [],
    schedule: [
      {
        kind: "work",
        id: "work-1",
        issueKey: "HUB-12",
        title: "Shared module",
        start: "2026-06-30T13:00:00.000Z",
        end: "2026-06-30T15:00:00.000Z",
        showAs: "free",
        plannerOwned: true,
        score: 80
      }
    ],
    timesheet: {
      entries: [
        {
          id: "timesheet:work-1",
          code: "HUB-12",
          description: "Shared module",
          minutes: 120,
          source: "work_item"
        },
        {
          id: "timesheet:balance",
          code: "INT-58",
          description: "Internal",
          minutes: 360,
          source: "internal"
        }
      ],
      totalMinutes: 480
    }
  };
}

async function callMcp(baseUrl: string, request: object): Promise<string> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  expect(response.ok).toBe(true);
  return response.text();
}
