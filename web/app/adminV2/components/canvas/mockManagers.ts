import type { DepartmentKey } from "@/lib/departmentColors";

export type MockManager = {
  id: string;
  departmentKey: DepartmentKey;
  name: string;
};

const BY_DEPARTMENT: Record<DepartmentKey, MockManager[]> = {
  operations: [
    { id: "mgr-ops-scheduling", departmentKey: "operations", name: "Scheduling Manager" },
    { id: "mgr-ops-dispatch", departmentKey: "operations", name: "Dispatch Manager" },
    { id: "mgr-ops-completion", departmentKey: "operations", name: "Completion Manager" },
  ],
  sales: [
    { id: "mgr-sales-pipeline", departmentKey: "sales", name: "Pipeline Manager" },
    { id: "mgr-sales-followup", departmentKey: "sales", name: "Follow-Up Manager" },
    { id: "mgr-sales-conversion", departmentKey: "sales", name: "Conversion Manager" },
  ],
  finance: [
    { id: "mgr-fin-billing", departmentKey: "finance", name: "Billing Manager" },
    { id: "mgr-fin-collections", departmentKey: "finance", name: "Collections Manager" },
    { id: "mgr-fin-reporting", departmentKey: "finance", name: "Reporting Manager" },
  ],
  customerSuccess: [
    { id: "mgr-cs-support", departmentKey: "customerSuccess", name: "Support Manager" },
    { id: "mgr-cs-success", departmentKey: "customerSuccess", name: "Success Manager" },
    { id: "mgr-cs-retention", departmentKey: "customerSuccess", name: "Retention Manager" },
  ],
  aiSystems: [
    { id: "mgr-ai-ops", departmentKey: "aiSystems", name: "Operations AI" },
    { id: "mgr-ai-dispatch", departmentKey: "aiSystems", name: "Dispatch AI" },
    { id: "mgr-ai-billing", departmentKey: "aiSystems", name: "Billing AI" },
  ],
};

export function getManagersForDepartment(key: DepartmentKey): MockManager[] {
  return BY_DEPARTMENT[key];
}
