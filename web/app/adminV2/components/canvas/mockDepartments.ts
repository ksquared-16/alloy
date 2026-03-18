/**
 * Company org chart: department tiles only. Global utilities live in Command Center (InspectorPanel).
 */
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
  compact1Label: string;
  compact1Value: string;
  compact2Label: string;
  compact2Value: string;
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
    compact1Label: "Throughput",
    compact1Value: "312",
    compact2Label: "Queue depth",
    compact2Value: "14",
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
    compact1Label: "Leads touched",
    compact1Value: "48",
    compact2Label: "Win rate",
    compact2Value: "18%",
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
    compact1Label: "Reconciled",
    compact1Value: "428",
    compact2Label: "Margin",
    compact2Value: "31%",
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
    compact1Label: "CSAT pulse",
    compact1Value: "4.6",
    compact2Label: "Escalations",
    compact2Value: "1",
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
    compact1Label: "Model runs",
    compact1Value: "1,240",
    compact2Label: "Cost / 1k",
    compact2Value: "$0.42",
  },
];
