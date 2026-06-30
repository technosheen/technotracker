# TechnoTracker

A stateless OpenAI Apps SDK application that turns explicitly selected Jira,
Outlook, and Microsoft Teams context into a deterministic workday schedule and
an exactly eight-hour timesheet. It exposes one read-only MCP tool and renders
the result with MCP UI inside ChatGPT.

## Architecture

```text
src/
  server.ts          Streamable HTTP MCP server and Apps SDK registrations
  contracts.ts       Zod schemas and domain types
  plan-workday.ts    Explicit-input planning use case
  planner/           Priority, scheduling, overlap, and timesheet logic
  widget/            React MCP UI bundled as one HTML resource
```

There is no standalone API, dashboard, database, connector adapter, or
application credential store. ChatGPT retrieves context through the user's
separately approved apps and passes only the selected data to
`generate_workday_plan`.

## Behavior

- `HUB-*` work is titled `HUBSPOT | HUB-*`.
- `DTC-*` work is titled `DTC | DTC-*`.
- Meetings and internal time use `INT-58`.
- Meetings are immutable busy intervals.
- Generated work blocks are free and never overlap meetings.
- Work blocks receive a 15-minute meeting buffer.
- The timesheet always totals exactly 480 minutes.
- The MCP tool is stateless, read-only, and performs no external writes.

## Local development

Requirements: Node.js 22+ and npm 11+.

```bash
cp .env.example .env
npm install
npm run dev
```

The MCP endpoint is `http://localhost:8000/mcp`. The local visual preview is
`http://localhost:8000/preview?preview=1`.

## Connect to ChatGPT

1. Run `npm run dev`.
2. Expose port `8000` through an HTTPS development tunnel.
3. Enable developer mode in ChatGPT.
4. Add `https://<tunnel-host>/mcp` as an app.
5. Add the organization-approved Jira, Outlook, and Teams apps to the same
   conversation.
6. Ask ChatGPT to gather the relevant context and generate a workday plan.

The planner app does not inherit credentials from those apps and requires no
OpenAI API key. It receives only tool arguments selected for the current call.

## Validation

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

Tests cover prefix rules, priority scoring, overlap detection, meeting buffers,
boundary clipping, free/busy behavior, and exact timesheet balancing.

Implementation follows the
[OpenAI Apps SDK documentation](https://developers.openai.com/apps-sdk) and
[official Apps SDK examples](https://github.com/openai/openai-apps-sdk-examples).
