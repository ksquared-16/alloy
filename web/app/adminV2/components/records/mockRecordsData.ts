import type { DepartmentKey } from "@/lib/departmentColors";

export type RecordRow = Record<string, string>;

export const MOCK_COMPANY_RECORDS: RecordRow[] = [
  { id: "4821", customer: "Johnson", technician: "Mike", status: "Scheduled", time: "10:00", pct: "65%" },
  { id: "4822", customer: "Adams", technician: "Sarah", status: "In Progress", time: "11:30", pct: "30%" },
  { id: "4819", customer: "Lee", technician: "Mike", status: "Completed", time: "09:00", pct: "100%" },
];

export const MOCK_COMPANY_COLUMNS = [
  { key: "id", label: "Job ID" },
  { key: "customer", label: "Customer" },
  { key: "technician", label: "Technician" },
  { key: "status", label: "Status" },
  { key: "time", label: "Scheduled Time" },
  { key: "pct", label: "Completion %" },
];

export const MOCK_OPERATIONS_RECORDS: RecordRow[] = [
  { id: "4821", customer: "Johnson", technician: "Mike", status: "Scheduled", time: "10:00", pct: "65%" },
  { id: "4822", customer: "Adams", technician: "Sarah", status: "In Progress", time: "11:30", pct: "30%" },
  { id: "4823", customer: "Brown", technician: "Mike", status: "Scheduled", time: "14:00", pct: "0%" },
];

export const MOCK_FINANCE_RECORDS: RecordRow[] = [
  { id: "INV-1033", customer: "Johnson", amount: "$240", status: "Paid", due: "Mar 10" },
  { id: "INV-1034", customer: "Adams", amount: "$180", status: "Open", due: "Mar 15" },
];

export const MOCK_FINANCE_COLUMNS = [
  { key: "id", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status" },
  { key: "due", label: "Due" },
];

export const MOCK_SALES_RECORDS: RecordRow[] = [
  { id: "P1", name: "Johnson", stage: "Proposal", value: "$480" },
  { id: "P2", name: "Adams", stage: "Follow-up", value: "$320" },
];

export const MOCK_SALES_COLUMNS = [
  { key: "id", label: "Lead" },
  { key: "name", label: "Name" },
  { key: "stage", label: "Stage" },
  { key: "value", label: "Value" },
];

export const MOCK_CUSTOMER_SUCCESS_RECORDS: RecordRow[] = [
  { id: "C-882", customer: "Johnson", status: "Open", sla: "2h" },
];

export const MOCK_CUSTOMER_SUCCESS_COLUMNS = [
  { key: "id", label: "Case" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "sla", label: "SLA" },
];

export const MOCK_AI_SYSTEMS_RECORDS: RecordRow[] = [
  { id: "run-1", workflow: "Schedule Assign", status: "Success", time: "2m ago" },
  { id: "run-2", workflow: "Invoice Send", status: "Success", time: "5m ago" },
];

export const MOCK_AI_SYSTEMS_COLUMNS = [
  { key: "id", label: "Run" },
  { key: "workflow", label: "Workflow" },
  { key: "status", label: "Status" },
  { key: "time", label: "Time" },
];

export type RecordsScope = { level: "company" } | { level: "department"; key: DepartmentKey };

export function getRecordsForScope(scope: RecordsScope): {
  columns: { key: string; label: string }[];
  rows: RecordRow[];
} {
  if (scope.level === "company") {
    return { columns: MOCK_COMPANY_COLUMNS, rows: MOCK_COMPANY_RECORDS };
  }
  switch (scope.key) {
    case "operations":
      return { columns: MOCK_COMPANY_COLUMNS, rows: MOCK_OPERATIONS_RECORDS };
    case "finance":
      return { columns: MOCK_FINANCE_COLUMNS, rows: MOCK_FINANCE_RECORDS };
    case "sales":
      return { columns: MOCK_SALES_COLUMNS, rows: MOCK_SALES_RECORDS };
    case "customerSuccess":
      return { columns: MOCK_CUSTOMER_SUCCESS_COLUMNS, rows: MOCK_CUSTOMER_SUCCESS_RECORDS };
    case "aiSystems":
      return { columns: MOCK_AI_SYSTEMS_COLUMNS, rows: MOCK_AI_SYSTEMS_RECORDS };
    default:
      return { columns: MOCK_COMPANY_COLUMNS, rows: MOCK_COMPANY_RECORDS };
  }
}
