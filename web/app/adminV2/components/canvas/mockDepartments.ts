import type { DepartmentKey } from "@/lib/departmentColors";
import type { DepartmentNodeData } from "./DepartmentNode";

export type MockDepartment = {
  id: string;
  key: DepartmentKey;
  name: string;
  primaryKpi: string;
  primaryValue: string;
  secondaryKpi: string;
  secondaryValue: string;
  health: DepartmentNodeData["health"];
  alertCount: number;
};

export const MOCK_DEPARTMENTS: MockDepartment[] = [
  {
    id: "dept-operations",
    key: "operations",
    name: "Operations",
    primaryKpi: "Jobs Active",
    primaryValue: "42",
    secondaryKpi: "Utilization",
    secondaryValue: "78%",
    health: "good",
    alertCount: 0,
  },
  {
    id: "dept-sales",
    key: "sales",
    name: "Sales",
    primaryKpi: "Pipeline",
    primaryValue: "12",
    secondaryKpi: "Conversion",
    secondaryValue: "24%",
    health: "good",
    alertCount: 0,
  },
  {
    id: "dept-finance",
    key: "finance",
    name: "Finance",
    primaryKpi: "Invoices Open",
    primaryValue: "8",
    secondaryKpi: "Collected",
    secondaryValue: "94%",
    health: "attention",
    alertCount: 2,
  },
  {
    id: "dept-customer-success",
    key: "customerSuccess",
    name: "Customer Success",
    primaryKpi: "Active Cases",
    primaryValue: "5",
    secondaryKpi: "SLA Met",
    secondaryValue: "98%",
    health: "good",
    alertCount: 0,
  },
  {
    id: "dept-ai-systems",
    key: "aiSystems",
    name: "AI Systems",
    primaryKpi: "Runs Today",
    primaryValue: "1,240",
    secondaryKpi: "Success Rate",
    secondaryValue: "99.2%",
    health: "good",
    alertCount: 1,
  },
];
