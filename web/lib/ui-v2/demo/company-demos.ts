import type { CompanyWorkspaceModel } from "../workspace-types";
import type { ContextRelationshipRawData } from "../adapters/context-adapter";

/** Home cleaning org — company-level operating overview (departments as work objects) */
export const demoCleaningCompanyModelBase: Omit<CompanyWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  organizationId: "org-cleaning-demo",
  organizationLabel: "Alloy Home Services",
  focusLabel: "Company focus",
  aiSummary: {
    headline: "East cluster pressure + revenue exceptions",
    aiAwarenessLine: "System status: stable · 2 intervention paths active",
  },
  signals: [
    {
      id: "co-sig-ops",
      severity: "warning",
      title: "East cluster load up",
      description: "Assignment gap",
      actions: [{ id: "open_ops_dept", label: "Open Operations" }],
    },
    {
      id: "co-sig-pay",
      severity: "critical",
      title: "6 payment issues open",
      actions: [{ id: "open_revenue_dept", label: "Open Revenue" }],
    },
    {
      id: "co-sig-renewal",
      severity: "warning",
      title: "3 renewals past SLA",
      actions: [{ id: "open_growth_dept", label: "Open Growth" }],
    },
  ],
  kpis: [
    { id: "co-k1", label: "Revenue (week)", value: "$186k", lane: "business" },
    { id: "co-k2", label: "Jobs completed", value: "1,240", lane: "business" },
    { id: "co-k3", label: "Utilization", value: "81", unit: "%", lane: "business" },
    {
      id: "co-k4",
      label: "Auto-resolution",
      value: "62",
      unit: "%",
      lane: "ai",
      aiSummary: "No-touch clears",
    },
    {
      id: "co-k5",
      label: "Routing accuracy",
      value: "94",
      unit: "%",
      lane: "ai",
      aiSummary: "Vs. optimal route",
    },
    {
      id: "co-k6",
      label: "Forecast confidence",
      value: "88",
      unit: "%",
      lane: "ai",
      aiSummary: "7-day band",
    },
  ],
  primaryDepartments: [
    {
      id: "co-dept-ops",
      departmentKey: "operations",
      label: "Operations",
      countBadge: 6,
      rollupGroups: [
        { id: "co-ops-u", label: "Unassigned jobs", count: 3 },
        { id: "co-ops-l", label: "Late jobs", count: 2 },
        { id: "co-ops-r", label: "Reschedules", count: 1 },
      ],
    },
    {
      id: "co-dept-rev",
      departmentKey: "revenue",
      label: "Revenue",
      countBadge: 6,
      rollupGroups: [
        { id: "co-rev-p", label: "Payment issues", count: 2 },
        { id: "co-rev-f", label: "Failed charges", count: 3 },
        { id: "co-rev-i", label: "Invoice mismatches", count: 1 },
      ],
    },
    {
      id: "co-dept-gr",
      departmentKey: "growth",
      label: "Growth",
      countBadge: 11,
      rollupGroups: [
        { id: "co-gr-q", label: "Quotes pending", count: 5 },
        { id: "co-gr-f", label: "Follow-ups due", count: 4 },
        { id: "co-gr-c", label: "Conversion risks", count: 2 },
      ],
    },
  ],
  secondaryDepartments: [
    {
      id: "co-dept-team",
      departmentKey: "team",
      label: "Team",
      countBadge: 3,
      rollupGroups: [
        { id: "co-tm-g", label: "Staffing gaps", count: 2 },
        { id: "co-tm-a", label: "Attendance issues", count: 1 },
      ],
    },
    {
      id: "co-dept-fin",
      departmentKey: "finance",
      label: "Finance",
      countBadge: 3,
      rollupGroups: [
        { id: "co-fn-m", label: "Margin anomalies", count: 2 },
        { id: "co-fn-r", label: "Refund approvals", count: 1 },
      ],
    },
    {
      id: "co-dept-sys",
      departmentKey: "systems",
      label: "Systems",
      countBadge: 3,
      rollupGroups: [
        { id: "co-sy-w", label: "Workflow failures", count: 2 },
        { id: "co-sy-a", label: "API sync issues", count: 1 },
      ],
    },
  ],
  workSummary: {
    id: "co-ws",
    title: "",
    progressLabel: "Company-wide · automations",
    workflowMetrics: {
      avgRunTimeLabel: "3m 08s",
      successRateLabel: "97.1%",
      runsTodayLabel: "512",
      failuresTodayLabel: "7",
    },
    workflowRuns: [
      { id: "co-w1", name: "Dispatch automation", status: "running", lastRunLabel: "09:44 · in progress" },
      { id: "co-w2", name: "Billing sync", status: "completed", lastRunLabel: "09:30 · 52s" },
      { id: "co-w3", name: "Follow-up queue", status: "completed", lastRunLabel: "09:18 · 1m 02s" },
      { id: "co-w4", name: "Renewal outreach", status: "running", lastRunLabel: "08:55 · in progress" },
      { id: "co-w5", name: "Staffing monitor", status: "completed", lastRunLabel: "08:40 · 38s" },
      { id: "co-w6", name: "System health checks", status: "failed", lastRunLabel: "07:12 · 2m 11s" },
    ],
    aiSuggestion:
      "Observation — failure cluster maps to one integration tenant; dispatch and billing lanes are otherwise green.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: [
      "Integrations: 1 lane degraded · retry scheduled",
      "Escalations: 4 open org-wide",
    ],
    systemActions: [
      { id: "co_sys_create", label: "Create record", variant: "primary" },
      { id: "co_sys_ingest", label: "Ingest document", variant: "secondary" },
      { id: "co_sys_workflow", label: "Execute workflow", variant: "secondary" },
      { id: "co_sys_report", label: "Run report", variant: "secondary" },
    ],
    quickOperations: [
      { id: "co_q_dept", label: "Open department", variant: "primary" },
      { id: "co_q_export", label: "Export summary", variant: "secondary" },
      { id: "co_q_notify", label: "Notify manager", variant: "secondary" },
      { id: "co_q_rebalance", label: "Rebalance workload", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "co_sm_east", label: "Execute rebalance → East cluster", emphasized: true },
      { id: "co_sm_pay", label: "Resolve 3 payment exceptions" },
      { id: "co_sm_auto", label: "Review elevated automation failures" },
    ],
  },
};

export const demoCleaningCompanyContextRaw: ContextRelationshipRawData = {
  regions: [
    { id: "r1", name: "East", status: "Pressure" },
    { id: "r2", name: "West", status: "OK" },
    { id: "r3", name: "Central", status: "OK" },
    { id: "r4", name: "South", status: "Watch" },
  ],
  managers: [
    { id: "m1", name: "Jordan Lee", scope: "Operations" },
    { id: "m2", name: "Sam Rivera", scope: "Revenue" },
    { id: "m3", name: "Casey Ng", scope: "Growth" },
  ],
  escalations: [
    { id: "e1", title: "Enterprise renewal · Acme", age: "3d over SLA" },
    { id: "e2", title: "Chargeback cluster · East", age: "18h" },
  ],
  integrations: [
    { id: "i1", name: "Stripe", health: "Healthy" },
    { id: "i2", name: "QuickBooks", health: "Degraded" },
    { id: "i3", name: "Dispatch API", health: "Healthy" },
  ],
};
