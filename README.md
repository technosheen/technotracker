# TechnoTracker

An OpenAI Apps SDK application that turns explicitly selected work context into
a deterministic schedule and balanced timesheet. Its MCP UI first asks about
the user's job, approved work tools, working hours, and company timesheet rules,
then renders the resulting workday plan inside ChatGPT.

## Architecture

```text
src/
  server.ts          Streamable HTTP MCP server and Apps SDK tool registrations
  contracts.ts       Zod schemas and domain types
  plan-workday.ts    Explicit-input planning use case
  planner/           Priority, scheduling, overlap, and timesheet logic
  widget/            React onboarding and planner UI bundled as one resource
```

There is no standalone API, dashboard, database, connector adapter, or
application credential store. ChatGPT retrieves context through separately
approved apps and passes only selected data to `generate_workday_plan`.
TechnoTracker never asks for app passwords, access tokens, or tenant-wide
Microsoft permissions.

## MCP tools

- `show_technotracker_onboarding` renders the interactive setup flow.
- `save_technotracker_configuration` validates app-submitted configuration. It
  is app-only, idempotent, and does not write to an external system.
- `generate_workday_plan` accepts normalized work items, meetings, messages,
  and the validated configuration, then renders the plan.

The widget keeps a versioned, non-sensitive preference snapshot in ChatGPT
widget state and browser storage, and sends a concise configuration summary to
the current conversation. Durable cross-device profiles would require an
authenticated storage service and are intentionally out of scope.

## Behavior

- Onboarding supports Jira, Azure DevOps, Linear, Asana, ClickUp, Monday,
  Trello, GitHub, Notion, Outlook, Google Calendar, Teams, Slack, and email.
- Work item prefix labels and timesheet codes are configurable. Defaults remain
  `HUB-* => HUBSPOT | HUB-*` and `DTC-* => DTC | DTC-*`.
- Meeting and internal codes are configurable and default to `INT-58`.
- Target hours are configurable from 1 to 16 hours in quarter-hour increments;
  the default is exactly 8 hours.
- Entries can be rounded to 1, 5, 6, 10, 15, or 30 minutes.
- Meetings are immutable busy intervals.
- Generated work blocks are free and never overlap meetings.
- Work blocks receive a 15-minute meeting buffer.
- Every generated timesheet exactly matches the configured daily target.
- MCP tools perform no external writes.

## Local development

Requirements: Node.js 22+ and npm 11+.

```bash
cp .env.example .env
npm install
npm run dev
```

The MCP endpoint is `http://localhost:8000/mcp`.

- Onboarding preview: `http://localhost:8000/preview?preview=1`
- Plan preview: `http://localhost:8000/preview?preview=plan`

## Connect to ChatGPT

1. Run `npm run dev`.
2. Expose port `8000` through an HTTPS development tunnel.
3. Enable developer mode in ChatGPT.
4. Add `https://<tunnel-host>/mcp` as an app.
5. Ask ChatGPT to run `show_technotracker_onboarding`.
6. Complete setup, then add only the organization-approved work apps selected
   during onboarding.
7. Choose **Build today's plan**. ChatGPT gathers relevant context through those
   apps and calls `generate_workday_plan`.

The planner app does not inherit credentials from those apps and requires no
OpenAI API key. It receives only tool arguments selected for the current call.

## Validation

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

Tests cover default and custom prefix rules, onboarding tool metadata, priority
scoring, overlap detection, meeting buffers, boundary clipping, free/busy
behavior, configurable rounding, and exact target-hour balancing.

Implementation follows the
[OpenAI Apps SDK documentation](https://developers.openai.com/apps-sdk) and
[official Apps SDK examples](https://github.com/openai/openai-apps-sdk-examples).
