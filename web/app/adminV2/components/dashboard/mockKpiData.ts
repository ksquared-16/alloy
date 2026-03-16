import type { DepartmentKey } from "@/lib/departmentColors";

export type AIKpiSet = {
  transactionsProcessed: string;
  automationRate: string;
  accuracy: string;
  avgProcessingTime: string;
  exceptionDetection?: string;
  autoReconciled?: string;
};

export type BusinessKpiSet = {
  revenue?: string;
  jobsCompleted?: string;
  conversionRate?: string;
  utilization?: string;
  exceptions?: string;
  invoicesOpen?: string;
  collected?: string;
  margin?: string;
  jobsActive?: string;
  completionRate?: string;
  delays?: string;
  activeCases?: string;
  slaMet?: string;
  runsToday?: string;
  successRate?: string;
};

const COMPANY_AI: AIKpiSet = {
  transactionsProcessed: "1,240",
  automationRate: "87%",
  accuracy: "99.2%",
  avgProcessingTime: "2.3s",
};

const COMPANY_BUSINESS: BusinessKpiSet = {
  revenue: "$48,200",
  jobsCompleted: "122",
  conversionRate: "24%",
  utilization: "78%",
  exceptions: "3",
};

const OPERATIONS_AI: AIKpiSet = {
  transactionsProcessed: "312",
  automationRate: "91%",
  accuracy: "98.8%",
  avgProcessingTime: "1.8s",
};

const OPERATIONS_BUSINESS: BusinessKpiSet = {
  jobsActive: "42",
  utilization: "78%",
  completionRate: "94%",
  exceptions: "3",
  delays: "3",
};

const FINANCE_AI: AIKpiSet = {
  transactionsProcessed: "428",
  automationRate: "99.5%",
  accuracy: "99.5%",
  avgProcessingTime: "2.1s",
  exceptionDetection: "12",
};


const FINANCE_BUSINESS: BusinessKpiSet = {
  invoicesOpen: "8",
  collected: "94%",
  exceptions: "2",
  margin: "31%",
};

const SALES_AI: AIKpiSet = {
  transactionsProcessed: "84",
  automationRate: "76%",
  accuracy: "97%",
  avgProcessingTime: "3.1s",
};

const SALES_BUSINESS: BusinessKpiSet = {
  revenue: "$12,400",
  jobsCompleted: "28",
  conversionRate: "24%",
  utilization: "72%",
};

const CUSTOMER_SUCCESS_AI: AIKpiSet = {
  transactionsProcessed: "56",
  automationRate: "82%",
  accuracy: "98%",
  avgProcessingTime: "2.0s",
};

const CUSTOMER_SUCCESS_BUSINESS: BusinessKpiSet = {
  activeCases: "5",
  slaMet: "98%",
  utilization: "85%",
};

const AI_SYSTEMS_AI: AIKpiSet = {
  transactionsProcessed: "1,240",
  automationRate: "99.2%",
  accuracy: "99.2%",
  avgProcessingTime: "0.8s",
};

const AI_SYSTEMS_BUSINESS: BusinessKpiSet = {
  runsToday: "1,240",
  successRate: "99.2%",
  exceptions: "1",
};

const DEPT_AI: Record<DepartmentKey, AIKpiSet> = {
  operations: { ...OPERATIONS_AI, transactionsProcessed: "312" },
  sales: SALES_AI,
  finance: { ...FINANCE_AI, transactionsProcessed: "428" },
  customerSuccess: CUSTOMER_SUCCESS_AI,
  aiSystems: AI_SYSTEMS_AI,
};

const DEPT_BUSINESS: Record<DepartmentKey, BusinessKpiSet> = {
  operations: OPERATIONS_BUSINESS,
  sales: SALES_BUSINESS,
  finance: FINANCE_BUSINESS,
  customerSuccess: CUSTOMER_SUCCESS_BUSINESS,
  aiSystems: AI_SYSTEMS_BUSINESS,
};

export type KpiScope = { level: "company" } | { level: "department"; key: DepartmentKey };

export function getAIKpis(scope: KpiScope): AIKpiSet {
  if (scope.level === "company") return COMPANY_AI;
  return DEPT_AI[scope.key];
}

export function getBusinessKpis(scope: KpiScope): BusinessKpiSet {
  if (scope.level === "company") return COMPANY_BUSINESS;
  return DEPT_BUSINESS[scope.key];
}

export type KpiItem = { label: string; value: string };

const COMPANY_AI_ITEMS: KpiItem[] = [
  { label: "Transactions Processed", value: COMPANY_AI.transactionsProcessed },
  { label: "Automation Rate", value: COMPANY_AI.automationRate },
  { label: "Accuracy", value: COMPANY_AI.accuracy },
  { label: "Avg Processing Time", value: COMPANY_AI.avgProcessingTime },
];

const COMPANY_BUSINESS_ITEMS: KpiItem[] = [
  { label: "Revenue", value: COMPANY_BUSINESS.revenue ?? "—" },
  { label: "Jobs Completed", value: COMPANY_BUSINESS.jobsCompleted ?? "—" },
  { label: "Conversion Rate", value: COMPANY_BUSINESS.conversionRate ?? "—" },
  { label: "Utilization", value: COMPANY_BUSINESS.utilization ?? "—" },
  { label: "Exceptions", value: COMPANY_BUSINESS.exceptions ?? "—" },
];

function deptAIItems(key: DepartmentKey): KpiItem[] {
  const a = DEPT_AI[key];
  const labels =
    key === "operations"
      ? ["Automated Assignments", "Optimization Rate", "Accuracy", "Avg Scheduling Time"]
      : key === "finance"
        ? ["Auto-Reconciled", "Accuracy", "Exception Detection", "Avg Processing Time"]
        : ["Transactions Processed", "Automation Rate", "Accuracy", "Avg Processing Time"];
  return [
    { label: labels[0], value: a.transactionsProcessed },
    { label: labels[1], value: a.automationRate },
    { label: labels[2], value: a.accuracy },
    { label: labels[3], value: a.avgProcessingTime },
  ];
}

function deptBusinessItems(key: DepartmentKey): KpiItem[] {
  const b = DEPT_BUSINESS[key];
  if (key === "operations")
    return [
      { label: "Jobs Active", value: b.jobsActive ?? "—" },
      { label: "Utilization", value: b.utilization ?? "—" },
      { label: "Completion Rate", value: b.completionRate ?? "—" },
      { label: "Delays", value: b.delays ?? "—" },
    ];
  if (key === "finance")
    return [
      { label: "Invoices Open", value: b.invoicesOpen ?? "—" },
      { label: "Collected", value: b.collected ?? "—" },
      { label: "Exceptions", value: b.exceptions ?? "—" },
      { label: "Margin", value: b.margin ?? "—" },
    ];
  if (key === "customerSuccess")
    return [
      { label: "Active Cases", value: b.activeCases ?? "—" },
      { label: "SLA Met", value: b.slaMet ?? "—" },
      { label: "Utilization", value: b.utilization ?? "—" },
    ];
  if (key === "aiSystems")
    return [
      { label: "Runs Today", value: b.runsToday ?? "—" },
      { label: "Success Rate", value: b.successRate ?? "—" },
      { label: "Exceptions", value: b.exceptions ?? "—" },
    ];
  return [
    { label: "Revenue", value: b.revenue ?? "—" },
    { label: "Jobs Completed", value: b.jobsCompleted ?? "—" },
    { label: "Conversion Rate", value: b.conversionRate ?? "—" },
    { label: "Utilization", value: b.utilization ?? "—" },
    { label: "Exceptions", value: b.exceptions ?? "—" },
  ].slice(0, 5);
}

export function getAIKpiItems(scope: KpiScope): KpiItem[] {
  if (scope.level === "company") return COMPANY_AI_ITEMS;
  return deptAIItems(scope.key);
}

export function getBusinessKpiItems(scope: KpiScope): KpiItem[] {
  if (scope.level === "company") return COMPANY_BUSINESS_ITEMS;
  return deptBusinessItems(scope.key);
}
