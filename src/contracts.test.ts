import { describe, expect, it } from "vitest";

import { TimesheetConfigurationSchema } from "./contracts.js";

describe("timesheet onboarding configuration", () => {
  it("normalizes ticket prefixes", () => {
    const configuration = TimesheetConfigurationSchema.parse({
      prefixMappings: [
        { prefix: "hub-", label: "HubSpot", timesheetCode: "{ticket}" }
      ]
    });

    expect(configuration.prefixMappings[0]?.prefix).toBe("HUB");
  });

  it("rejects inverted workday boundaries", () => {
    expect(() =>
      TimesheetConfigurationSchema.parse({
        workdayStart: "17:00",
        workdayEnd: "09:00"
      })
    ).toThrow("Workday end must be after the start.");
  });

  it("requires a name for an unlisted timesheet system", () => {
    expect(() =>
      TimesheetConfigurationSchema.parse({
        timesheetSystem: "other"
      })
    ).toThrow("Name the timesheet system.");
  });

  it("provides a complete onboarding workflow by default", () => {
    const configuration = TimesheetConfigurationSchema.parse({});

    expect(configuration.toolConnections).toContainEqual({
      tool: "jira",
      status: "needs_connection"
    });
    expect(configuration.timeTrackingBasis).toBe("fixed_day");
    expect(configuration.entryCadence).toBe("daily");
    expect(configuration.workflow).toBe("plan_and_reconcile");
    expect(configuration.automationPreference).toBe("daily_prompt");
  });
});
