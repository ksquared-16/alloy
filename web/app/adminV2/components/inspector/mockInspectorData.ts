import type { DepartmentKey } from "@/lib/departmentColors";

export type InspectorDepartmentSummary = {
  departmentName: string;
  health: string;
  aiSummary: string;
};

export type InspectorMetrics = { label: string; value: string }[];

export type InspectorActivityItem = {
  id: string;
  text: string;
  time: string;
};

export type InspectorAction = {
  id: string;
  label: string;
};

export type InspectorHistoryItem = {
  id: string;
  text: string;
  time: string;
};

export type InspectorDepartmentData = {
  summary: InspectorDepartmentSummary;
  metrics: InspectorMetrics;
  activity: InspectorActivityItem[];
  actions: InspectorAction[];
  history: InspectorHistoryItem[];
};

const BY_DEPARTMENT: Record<DepartmentKey, InspectorDepartmentData> = {
  operations: {
    summary: {
      departmentName: "Operations",
      health: "Good",
      aiSummary: "Scheduling and dispatch are running within targets. Utilization is healthy.",
    },
    metrics: [
      { label: "Jobs Active", value: "42" },
      { label: "Utilization", value: "78%" },
      { label: "Completion Rate", value: "94%" },
      { label: "Delays", value: "3" },
    ],
    activity: [
      { id: "a1", text: "Scheduling Agent assigned job #4821", time: "2m ago" },
      { id: "a2", text: "Dispatch run completed for 12 jobs", time: "15m ago" },
      { id: "a3", text: "Completion Manager updated 3 records", time: "1h ago" },
    ],
    actions: [
      { id: "act1", label: "Optimize schedule" },
      { id: "act2", label: "Investigate delays" },
      { id: "act3", label: "Review technician utilization" },
    ],
    history: [
      { id: "h1", text: "Zoom into Operations", time: "Just now" },
      { id: "h2", text: "KPI refresh", time: "5m ago" },
    ],
  },
  sales: {
    summary: {
      departmentName: "Sales",
      health: "Good",
      aiSummary: "Pipeline and follow-up automation are active. Conversion trending up.",
    },
    metrics: [
      { label: "Pipeline", value: "12" },
      { label: "Conversion", value: "24%" },
      { label: "Revenue", value: "$12,400" },
    ],
    activity: [
      { id: "a1", text: "Pipeline Manager updated stage", time: "5m ago" },
      { id: "a2", text: "Follow-up task completed", time: "1h ago" },
    ],
    actions: [
      { id: "act1", label: "Review pipeline" },
      { id: "act2", label: "Run conversion report" },
    ],
    history: [
      { id: "h1", text: "Zoom into Sales", time: "Just now" },
    ],
  },
  finance: {
    summary: {
      departmentName: "Finance",
      health: "Attention",
      aiSummary: "Two open exceptions in collections. Billing accuracy remains high.",
    },
    metrics: [
      { label: "Invoices Open", value: "8" },
      { label: "Collected", value: "94%" },
      { label: "Exceptions", value: "2" },
      { label: "Margin", value: "31%" },
    ],
    activity: [
      { id: "a1", text: "Billing Agent sent invoice #1033", time: "10m ago" },
      { id: "a2", text: "Collections exception flagged", time: "45m ago" },
      { id: "a3", text: "Reporting Manager ran daily summary", time: "2h ago" },
    ],
    actions: [
      { id: "act1", label: "Reconcile exceptions" },
      { id: "act2", label: "Run collections report" },
    ],
    history: [
      { id: "h1", text: "Zoom into Finance", time: "Just now" },
    ],
  },
  customerSuccess: {
    summary: {
      departmentName: "Customer Success",
      health: "Good",
      aiSummary: "Active cases within SLA. Retention metrics stable.",
    },
    metrics: [
      { label: "Active Cases", value: "5" },
      { label: "SLA Met", value: "98%" },
    ],
    activity: [
      { id: "a1", text: "Support Manager closed case #882", time: "20m ago" },
      { id: "a2", text: "Success Manager sent check-in", time: "1h ago" },
    ],
    actions: [
      { id: "act1", label: "Review open cases" },
      { id: "act2", label: "Run SLA report" },
    ],
    history: [
      { id: "h1", text: "Zoom into Customer Success", time: "Just now" },
    ],
  },
  aiSystems: {
    summary: {
      departmentName: "AI Systems",
      health: "Good",
      aiSummary: "Runs at 99.2% success. One minor exception in document parsing.",
    },
    metrics: [
      { label: "Runs Today", value: "1,240" },
      { label: "Success Rate", value: "99.2%" },
      { label: "Exceptions", value: "1" },
    ],
    activity: [
      { id: "a1", text: "Document parsing run completed", time: "1m ago" },
      { id: "a2", text: "Scheduling optimization ran", time: "30m ago" },
    ],
    actions: [
      { id: "act1", label: "Review exceptions" },
      { id: "act2", label: "Re-run failed workflow" },
    ],
    history: [
      { id: "h1", text: "Zoom into AI Systems", time: "Just now" },
    ],
  },
};

export function getInspectorDepartmentData(key: DepartmentKey): InspectorDepartmentData {
  return BY_DEPARTMENT[key];
}