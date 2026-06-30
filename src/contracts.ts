import { z } from "zod";

// Shared contracts for the MCP tool, planner, and embedded UI.

export const JiraIssueSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/),
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
  source: z.enum(["meeting", "jira", "internal"])
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
    totalMinutes: z.literal(480)
  })
});

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
