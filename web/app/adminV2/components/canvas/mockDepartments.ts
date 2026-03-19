/**
 * Company org chart: department tiles only. Global utilities live in Command Center (InspectorPanel).
 */
import type { DepartmentKey } from "@/lib/departmentColors";
import type { DepartmentNodeData } from "./DepartmentNode";

export type AgentState = { name: string; status: string };

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
  /** Top-level KPI (dominant) e.g. "42 active jobs" */
  primarySignal?: string;
  secondaryContext?: string;
  agentSummary?: string[];
  /** Manager/agent rollup: compact system summary */
  agentRollup?: string;
  /** Agent status reporting up */
  agentStates?: AgentState[];
  /** One short insight e.g. "Top performer: Scheduling Agent" */
  topPerformer?: string;
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
    primarySignal: "42 active jobs",
    agentRollup: "3 agents active · 1 needs review",
    agentStates: [
      { name: "Dispatch Agent", status: "Healthy" },
      { name: "Scheduling Agent", status: "Attention" },
    ],
    topPerformer: "Top performer: Scheduling Agent",
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
    primarySignal: "12 deals in pipeline",
    agentRollup: "2 agents active · all healthy",
    agentStates: [
      { name: "Follow-up Agent", status: "Healthy" },
      { name: "Scoring Agent", status: "Healthy" },
    ],
    topPerformer: "Top performer: Follow-up Agent",
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
    primarySignal: "8 invoices open",
    agentRollup: "2 agents active · 1 exception state",
    agentStates: [
      { name: "Billing Agent", status: "Attention" },
      { name: "Reconciliation Agent", status: "Healthy" },
    ],
    topPerformer: "Top performer: Reconciliation Agent",
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
    primarySignal: "5 active cases",
    agentRollup: "2 agents active · 1 escalation pending",
    agentStates: [
      { name: "Support Agent", status: "Healthy" },
      { name: "Escalation Agent", status: "Attention" },
    ],
    topPerformer: "Top performer: Support Agent",
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
    primarySignal: "1,240 runs today",
    agentRollup: "4 agents active · 1 needs review",
    agentStates: [
      { name: "Processing Agent", status: "Healthy" },
      { name: "Monitoring Agent", status: "Attention" },
    ],
    topPerformer: "Top performer: Processing Agent",
  },
];
