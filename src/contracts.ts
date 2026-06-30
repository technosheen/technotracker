import { z } from "zod";

// Shared contracts for the MCP tool, planner, and embedded UI.

export const WorkToolSchema = z.enum([
  "jira",
  "azure_devops",
  "linear",
  "asana",
  "clickup",
  "monday",
  "trello",
  "github",
  "notion",
  "other"
]);

export const CalendarToolSchema = z.enum([
  "outlook",
  "google_calendar",
  "apple_calendar",
  "other"
]);

export const CommunicationToolSchema = z.enum([
  "teams",
  "slack",
  "outlook_mail",
  "gmail",
  "other"
]);

export const TimesheetSystemSchema = z.enum([
  "manual",
  "csv",
  "tempo",
  "harvest",
  "clockify",
  "replicon",
  "workday",
  "sap",
  "other"
]);

export const PrefixMappingSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((value) => value.toUpperCase().replace(/-+$/, "")),
  label: z.string().trim().min(1).max(60),
  timesheetCode: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe("Use {ticket} to keep the source ticket key.")
});

export const TimesheetConfigurationSchema = z
  .object({
    version: z.literal(1).default(1),
    role: z.string().trim().max(100).default(""),
    team: z.string().trim().max(100).default(""),
    timeZone: z.string().trim().min(1).default("America/New_York"),
    workdayStart: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
    workdayEnd: z.string().regex(/^\d{2}:\d{2}$/).default("17:00"),
    targetHours: z.number().min(1).max(16).multipleOf(0.25).default(8),
    workTools: z.array(WorkToolSchema).default(["jira"]),
    calendarTools: z.array(CalendarToolSchema).default(["outlook"]),
    communicationTools: z
      .array(CommunicationToolSchema)
      .default(["teams", "outlook_mail"]),
    timesheetSystem: TimesheetSystemSchema.default("manual"),
    timesheetSystemOther: z.string().trim().max(100).default(""),
    roundingMinutes: z
      .union([
        z.literal(1),
        z.literal(5),
        z.literal(6),
        z.literal(10),
        z.literal(15),
        z.literal(30)
      ])
      .default(15),
    meetingCode: z.string().trim().min(1).max(60).default("INT-58"),
    internalCode: z.string().trim().min(1).max(60).default("INT-58"),
    countMeetings: z.boolean().default(true),
    requiredFields: z
      .array(
        z.enum([
          "project_code",
          "ticket",
          "description",
          "billable",
          "work_category"
        ])
      )
      .default(["ticket", "description"]),
    prefixMappings: z
      .array(PrefixMappingSchema)
      .max(20)
      .default([
        { prefix: "HUB", label: "HUBSPOT", timesheetCode: "{ticket}" },
        { prefix: "DTC", label: "DTC", timesheetCode: "{ticket}" }
      ])
  })
  .superRefine((configuration, context) => {
    if (configuration.workdayEnd <= configuration.workdayStart) {
      context.addIssue({
        code: "custom",
        path: ["workdayEnd"],
        message: "Workday end must be after the start."
      });
    }
    if (
      configuration.timesheetSystem === "other" &&
      !configuration.timesheetSystemOther
    ) {
      context.addIssue({
        code: "custom",
        path: ["timesheetSystemOther"],
        message: "Name the timesheet system."
      });
    }
  });

export const DEFAULT_TIMESHEET_CONFIGURATION =
  TimesheetConfigurationSchema.parse({});

export const JiraIssueSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_./#:-]*$/),
  source: WorkToolSchema.optional(),
  summary: z.string(),
  description: z.string().default(""),
  status: z.string(),
  priority: z.enum(["Highest", "High", "Medium", "Low", "Lowest", "Unprioritized"]),
  dueDate: z.string().date().nullable().default(null),
  updatedAt: z.string().datetime(),
  assignee: z.string().nullable().default(null),
  mentionsCurrentUser: z.boolean().default(false),
  blocked: z.boolean().default(false)
});

export const MailMessageSchema = z.object({
  id: z.string(),
  subject: z.string(),
  sender: z.string(),
  preview: z.string(),
  receivedAt: z.string().datetime(),
  webUrl: z.string().url().optional()
});

export const TeamsMessageSchema = z.object({
  id: z.string(),
  author: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  webUrl: z.string().url().optional()
});

export const MeetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  showAs: z.literal("busy").default("busy"),
  webUrl: z.string().url().optional()
});

export const WorkBlockSchema = z.object({
  id: z.string(),
  issueKey: z.string(),
  title: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  showAs: z.literal("free"),
  plannerOwned: z.literal(true),
  score: z.number()
});

export const ScheduleItemSchema = z.discriminatedUnion("kind", [
  MeetingSchema.extend({ kind: z.literal("meeting") }),
  WorkBlockSchema.extend({ kind: z.literal("work") })
]);

export const TimesheetEntrySchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string(),
  minutes: z.number().int().positive(),
  source: z.enum(["meeting", "work_item", "jira", "internal"])
});

export const DailyRundownSchema = z.object({
  date: z.string().date(),
  summary: z.string(),
  priorities: z.array(
    z.object({
      issue: JiraIssueSchema,
      score: z.number(),
      rationale: z.array(z.string())
    })
  ),
  blockers: z.array(z.string()),
  actionItems: z.array(z.string()),
  schedule: z.array(ScheduleItemSchema),
  timesheet: z.object({
    entries: z.array(TimesheetEntrySchema),
    totalMinutes: z.number().int().positive()
  })
});

export const OnboardingPayloadSchema = z.object({
  view: z.literal("onboarding"),
  configuration: TimesheetConfigurationSchema
});

export const PlanPayloadSchema = z.object({
  view: z.literal("plan"),
  configuration: TimesheetConfigurationSchema,
  rundown: DailyRundownSchema
});

export const AppPayloadSchema = z.discriminatedUnion("view", [
  OnboardingPayloadSchema,
  PlanPayloadSchema
]);

export const DailyRundownRequestSchema = z.object({
  date: z.string().date().optional(),
  captures: z
    .object({
      meetings: z
        .array(
          MeetingSchema.refine(
            (meeting) => new Date(meeting.end) > new Date(meeting.start),
            { message: "Meeting end must be after its start." }
          )
        )
        .default([]),
      mail: z.array(MailMessageSchema).default([]),
      teams: z.array(TeamsMessageSchema).default([])
    })
    .default({ meetings: [], mail: [], teams: [] })
});

export const CalendarSyncRequestSchema = z.object({
  schedule: z.array(ScheduleItemSchema)
});

export const CalendarSyncResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skippedMeetings: z.number().int().nonnegative()
});

export const MicrosoftAuthStatusSchema = z.object({
  mode: z.enum(["manual", "delegated", "client_credentials", "demo"]),
  status: z.enum(["connected", "disconnected"]),
  account: z
    .object({
      name: z.string().nullable(),
      username: z.string()
    })
    .nullable()
});

export const MicrosoftDeviceLoginSchema = z.object({
  sessionId: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  message: z.string(),
  expiresIn: z.number().int().positive()
});

export const MicrosoftDeviceLoginStatusSchema = z.object({
  status: z.enum(["pending", "connected", "failed"]),
  account: z
    .object({
      name: z.string().nullable(),
      username: z.string()
    })
    .optional(),
  error: z.string().optional()
});

export type JiraIssue = z.infer<typeof JiraIssueSchema>;
export type MailMessage = z.infer<typeof MailMessageSchema>;
export type TeamsMessage = z.infer<typeof TeamsMessageSchema>;
export type Meeting = z.infer<typeof MeetingSchema>;
export type WorkBlock = z.infer<typeof WorkBlockSchema>;
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;
export type TimesheetEntry = z.infer<typeof TimesheetEntrySchema>;
export type DailyRundown = z.infer<typeof DailyRundownSchema>;
export type CalendarSyncResponse = z.infer<typeof CalendarSyncResponseSchema>;
export type MicrosoftAuthStatus = z.infer<typeof MicrosoftAuthStatusSchema>;
export type MicrosoftDeviceLogin = z.infer<typeof MicrosoftDeviceLoginSchema>;
export type MicrosoftDeviceLoginStatus = z.infer<typeof MicrosoftDeviceLoginStatusSchema>;
export type DailyRundownRequest = z.infer<typeof DailyRundownRequestSchema>;
export type TimesheetConfiguration = z.infer<
  typeof TimesheetConfigurationSchema
>;
export type PrefixMapping = z.infer<typeof PrefixMappingSchema>;
export type AppPayload = z.infer<typeof AppPayloadSchema>;
