/**
 * Mock operational data for company-level department tiles.
 * UI-only: quick actions, next-best-action, priority. No backend.
 */
import type { DepartmentKey } from "@/lib/departmentColors";

export type QuickAction = {
  id: string;
  label: string;
};

export type DepartmentActionsConfig = {
  quickActions: QuickAction[];
  nextBestAction: string;
  isPriority: boolean;
};

export const MOCK_DEPARTMENT_ACTIONS: Record<DepartmentKey, DepartmentActionsConfig> = {
  operations: {
    quickActions: [
      { id: "ops-optimize", label: "Optimize" },
      { id: "ops-review-queue", label: "Review queue" },
    ],
    nextBestAction: "3 delayed jobs need review",
    isPriority: true,
  },
  sales: {
    quickActions: [
      { id: "sales-pipeline", label: "Review pipeline" },
      { id: "sales-followup", label: "Trigger follow-up" },
    ],
    nextBestAction: "2 leads ready for follow-up",
    isPriority: false,
  },
  finance: {
    quickActions: [
      { id: "finance-exceptions", label: "Review exceptions" },
      { id: "finance-recon", label: "Run reconciliation" },
    ],
    nextBestAction: "2 exceptions ready for approval",
    isPriority: true,
  },
  customerSuccess: {
    quickActions: [
      { id: "cs-cases", label: "Review cases" },
      { id: "cs-escalate", label: "Escalate issues" },
    ],
    nextBestAction: "1 case approaching SLA",
    isPriority: false,
  },
  aiSystems: {
    quickActions: [
      { id: "ai-inspect", label: "Inspect runs" },
      { id: "ai-failures", label: "Review failures" },
    ],
    nextBestAction: "1 failed run in last hour",
    isPriority: false,
  },
};
