import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("advertises onboarding, app-only validation, and planner tools", async () => {
    const response = await callMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    });

    expect(response).toContain('"name":"show_technotracker_onboarding"');
    expect(response).toContain('"name":"save_technotracker_configuration"');
    expect(response).toContain('"name":"generate_workday_plan"');
    expect(response).toContain('"readOnlyHint":true');
    expect(response).toContain('"visibility":["app"]');
    expect(response).toContain(
      '"resourceUri":"ui://technotracker/workday.html"'
    );
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
});

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
