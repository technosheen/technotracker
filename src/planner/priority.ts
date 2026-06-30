import type { JiraIssue } from "../contracts.js";

const PRIORITY_POINTS: Record<JiraIssue["priority"], number> = {
  Highest: 45,
  High: 35,
  Medium: 25,
  Low: 15,
  Lowest: 5,
  Unprioritized: 0
};

const STATUS_POINTS: Record<string, number> = {
  Blocked: 30,
  "In Review": 22,
  "Ready for QA": 20,
  "Dev In Progress": 18,
  "In Progress": 18
};

export interface ScoredIssue {
  issue: JiraIssue;
  score: number;
  rationale: string[];
}

export function scoreIssue(issue: JiraIssue, today: string): ScoredIssue {
  let score = PRIORITY_POINTS[issue.priority] ?? 0;
  const rationale = [`${issue.priority} priority`];

  const statusScore = STATUS_POINTS[issue.status] ?? 0;
  score += statusScore;
  if (statusScore > 0) rationale.push(issue.status);

  if (issue.blocked) {
    score += 30;
    rationale.push("blocked");
  }
  if (issue.mentionsCurrentUser) {
    score += 15;
    rationale.push("mentions you");
  }
  if (issue.dueDate) {
    const days = Math.floor(
      (new Date(`${issue.dueDate}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000
    );
    if (days < 0) {
      score += 40;
      rationale.push("overdue");
    } else if (days === 0) {
      score += 35;
      rationale.push("due today");
    } else if (days <= 2) {
      score += 20;
      rationale.push(`due in ${days} days`);
    }
  }

  return { issue, score, rationale };
}

export function rankIssues(issues: JiraIssue[], today: string): ScoredIssue[] {
  return issues
    .map((issue) => scoreIssue(issue, today))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.issue.updatedAt.localeCompare(a.issue.updatedAt) ||
        a.issue.key.localeCompare(b.issue.key)
    );
}
