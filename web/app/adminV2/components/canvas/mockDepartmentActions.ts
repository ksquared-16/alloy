/**
 * Mock operational data for company-level department tiles.
 * UI-only: quick actions, next-best-action, priority. No backend.
 */
import type { DepartmentKey } from "@/lib/departmentColors";

export type QuickActionIcon = "gear" | "list" | "mail" | "warning" | "eye" | "check";

export type QuickAction = {
  id: string;
  label: string;
  icon: QuickActionIcon;
};

export type DepartmentActionsConfig = {
  quickActions: QuickAction[];
  nextBestAction: string;
  isPriority: boolean;
};

export const MOCK_DEPARTMENT_ACTIONS: Record<DepartmentKey, DepartmentActionsConfig> = {
  operations: {
    quickActions: [
      { id: "ops-optimize", label: "Optimize", icon: "gear" },
      { id: "ops-review-queue", label: "Review queue", icon: "list" },
    ],
    nextBestAction: "3 delayed jobs need review",
    isPriority: true,
  },
  sales: {
    quickActions: [
      { id: "sales-pipeline", label: "Review pipeline", icon: "list" },
      { id: "sales-followup", label: "Trigger follow-up", icon: "mail" },
    ],
    nextBestAction: "2 leads ready for follow-up",
    isPriority: false,
  },
  finance: {
    quickActions: [
      { id: "finance-exceptions", label: "Review exceptions", icon: "warning" },
      { id: "finance-recon", label: "Run reconciliation", icon: "check" },
    ],
    nextBestAction: "2 exceptions ready for approval",
    isPriority: true,
  },
  customerSuccess: {
    quickActions: [
      { id: "cs-cases", label: "Review cases", icon: "list" },
      { id: "cs-escalate", label: "Escalate issues", icon: "warning" },
    ],
    nextBestAction: "1 case approaching SLA",
    isPriority: false,
  },
  aiSystems: {
    quickActions: [
      { id: "ai-inspect", label: "Inspect runs", icon: "eye" },
      { id: "ai-failures", label: "Review failures", icon: "warning" },
    ],
    nextBestAction: "1 failed run in last hour",
    isPriority: false,
  },
};

/** Mock content for floating action panel (UI-only) */
export type ActionPanelContent = {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
};

export const MOCK_ACTION_PANEL_CONTENT: Record<string, ActionPanelContent> = {
  "ops-optimize": {
    title: "Optimize operations",
    description: "Review and tune workflow settings for this department.",
    primaryLabel: "Open optimizer",
    secondaryLabel: "View history",
  },
  "ops-review-queue": {
    title: "Review queue",
    description: "See delayed and pending items that need attention.",
    primaryLabel: "Open queue",
    secondaryLabel: "Filter by type",
  },
  "sales-pipeline": {
    title: "Review pipeline",
    description: "Inspect deals and stages for this period.",
    primaryLabel: "Open pipeline",
    secondaryLabel: "Export",
  },
  "sales-followup": {
    title: "Trigger follow-up",
    description: "Send reminders or run automated follow-up sequences.",
    primaryLabel: "Run follow-up",
    secondaryLabel: "Schedule",
  },
  "finance-exceptions": {
    title: "Review exceptions",
    description: "Approve or resolve flagged transactions.",
    primaryLabel: "Open exceptions",
    secondaryLabel: "Bulk approve",
  },
  "finance-recon": {
    title: "Run reconciliation",
    description: "Start a reconciliation run for the selected period.",
    primaryLabel: "Run now",
    secondaryLabel: "Configure",
  },
  "cs-cases": {
    title: "Review cases",
    description: "View open cases and SLA status.",
    primaryLabel: "Open cases",
    secondaryLabel: "Assign",
  },
  "cs-escalate": {
    title: "Escalate issues",
    description: "Escalate selected cases to the next tier.",
    primaryLabel: "Escalate",
    secondaryLabel: "Add note",
  },
  "ai-inspect": {
    title: "Inspect runs",
    description: "View recent AI run logs and outcomes.",
    primaryLabel: "Open runs",
    secondaryLabel: "Retry failed",
  },
  "ai-failures": {
    title: "Review failures",
    description: "See failed runs and error details.",
    primaryLabel: "Open failures",
    secondaryLabel: "Notify",
  },
};

export function getActionPanelContent(actionId: string): ActionPanelContent | undefined {
  return MOCK_ACTION_PANEL_CONTENT[actionId];
}
