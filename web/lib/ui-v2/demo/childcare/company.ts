import type { CompanyWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

/** Childcare network — company-level overview (uses org context keys shared with home services demo config) */
export const demoChildcareCompanyModelBase: Omit<CompanyWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  organizationId: "org-childcare-demo",
  organizationLabel: "BrightPath Early Learning",
  focusLabel: "Company focus",
  aiSummary: {
    headline: "Ratio coverage + subsidy file pressure",
    aiAwarenessLine: "System status: stable · 3 centers on watch",
  },
  signals: [
    {
      id: "cc-co-sig-ratio",
      severity: "warning",
      title: "2 centers near ratio limits",
      description: "Afternoon block",
      actions: [{ id: "open_ops_dept", label: "Open" }],
    },
    {
      id: "cc-co-sig-subsidy",
      severity: "critical",
      title: "5 subsidy verifications open",
      actions: [{ id: "open_compliance_dept", label: "Open" }],
    },
    {
      id: "cc-co-sig-staff",
      severity: "warning",
      title: "4 float requests unassigned",
      actions: [{ id: "open_hr_dept", label: "Open" }],
    },
  ],
  kpis: [
    { id: "cc-k1", label: "Enrollment (week)", value: "312", lane: "business" },
    { id: "cc-k2", label: "Ratio compliance", value: "100", unit: "%", lane: "business" },
    { id: "cc-k3", label: "Staff fill", value: "94", unit: "%", lane: "business" },
    {
      id: "cc-k4",
      label: "Auto check-in clears",
      value: "71",
      unit: "%",
      lane: "ai",
      aiSummary: "No-touch arrivals",
    },
    {
      id: "cc-k5",
      label: "Ratio forecast accuracy",
      value: "91",
      unit: "%",
      lane: "ai",
    },
    {
      id: "cc-k6",
      label: "Subsidy match confidence",
      value: "87",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryDepartments: [
    {
      id: "cc-dept-staff",
      departmentKey: "team",
      label: "Staffing / Utilization",
      countBadge: 7,
      rollupGroups: [
        { id: "cc-st-r", label: "Rooms out of ratio / at risk", count: 3 },
        { id: "cc-st-f", label: "Float requests", count: 2 },
        { id: "cc-st-b", label: "Break coverage gaps", count: 2 },
      ],
    },
    {
      id: "cc-dept-ops",
      departmentKey: "operations",
      label: "Center operations",
      countBadge: 5,
      rollupGroups: [
        { id: "cc-ops-r", label: "Rooms needing coverage", count: 2 },
        { id: "cc-ops-c", label: "Check-ins open", count: 2 },
        { id: "cc-ops-a", label: "Attendance gaps", count: 1 },
      ],
    },
    {
      id: "cc-dept-comp",
      departmentKey: "compliance",
      label: "Compliance",
      countBadge: 4,
      rollupGroups: [
        { id: "cc-cp-s", label: "Subsidy mismatches", count: 2 },
        { id: "cc-cp-d", label: "DRDP / licensing", count: 1 },
        { id: "cc-cp-m", label: "Medication co-signs", count: 1 },
      ],
    },
    {
      id: "cc-dept-fam",
      departmentKey: "family",
      label: "Family services",
      countBadge: 8,
      rollupGroups: [
        { id: "cc-fm-p", label: "Parent messages", count: 4 },
        { id: "cc-fm-t", label: "Tardy / pickup", count: 3 },
        { id: "cc-fm-e", label: "Enrollment follow-ups", count: 1 },
      ],
    },
  ],
  secondaryDepartments: [
    {
      id: "cc-dept-nut",
      departmentKey: "nutrition",
      label: "Nutrition",
      countBadge: 2,
      rollupGroups: [
        { id: "cc-nt-a", label: "Allergy file updates", count: 1 },
        { id: "cc-nt-m", label: "Menu exceptions", count: 1 },
      ],
    },
    {
      id: "cc-dept-fin",
      departmentKey: "finance",
      label: "Finance",
      countBadge: 3,
      rollupGroups: [
        { id: "cc-fn-b", label: "Billing holds", count: 2 },
        { id: "cc-fn-r", label: "Refund reviews", count: 1 },
      ],
    },
    {
      id: "cc-dept-sys",
      departmentKey: "systems",
      label: "Systems",
      countBadge: 2,
      rollupGroups: [
        { id: "cc-sy-w", label: "Kiosk sync issues", count: 1 },
        { id: "cc-sy-a", label: "State portal errors", count: 1 },
      ],
    },
  ],
  workSummary: {
    id: "cc-co-ws",
    title: "",
    progressLabel: "Network-wide · automations",
    workflowMetrics: {
      avgRunTimeLabel: "1m 52s",
      successRateLabel: "99.2%",
      runsTodayLabel: "288",
      failuresTodayLabel: "1",
    },
    workflowRuns: [
      { id: "cc-w1", name: "Ratio guard sweep", status: "running", lastRunLabel: "09:44 · in progress" },
      { id: "cc-w2", name: "Subsidy file sync", status: "completed", lastRunLabel: "09:30 · 38s" },
      { id: "cc-w3", name: "Pickup notifications", status: "completed", lastRunLabel: "09:12 · 22s" },
      { id: "cc-w4", name: "Staffing float router", status: "running", lastRunLabel: "08:55 · in progress" },
      { id: "cc-w5", name: "Immunization expiry scan", status: "completed", lastRunLabel: "08:40 · 14s" },
      { id: "cc-w6", name: "State reporting batch", status: "failed", lastRunLabel: "07:12 · 2m 01s" },
    ],
    aiSuggestion:
      "Observation — state reporting failure isolated to one center tenant; ratio and check-in lanes are otherwise green.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: [
      "State integrations: 1 lane retrying",
      "Open escalations: 3 org-wide",
    ],
    systemActions: [
      { id: "co_sys_create", label: "Create enrollment", variant: "primary" },
      { id: "co_sys_ingest", label: "Ingest document", variant: "secondary" },
      { id: "co_sys_workflow", label: "Execute workflow", variant: "secondary" },
      { id: "co_sys_report", label: "Run report", variant: "secondary" },
    ],
    quickOperations: [
      { id: "co_q_dept", label: "Open department", variant: "primary" },
      { id: "co_q_export", label: "Export summary", variant: "secondary" },
      { id: "co_q_notify", label: "Notify director", variant: "secondary" },
      { id: "co_q_rebalance", label: "Stage floats network-wide", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "co_sm_east", label: "Stage floats → Room B cluster", emphasized: true },
      { id: "co_sm_pay", label: "Close 3 subsidy verifications" },
      { id: "co_sm_auto", label: "Retry failed state reporting batch" },
    ],
  },
};

export const demoChildcareCompanyContextRaw: ContextRelationshipRawData = {
  regions: [
    { id: "cr1", name: "North campus", status: "Watch" },
    { id: "cr2", name: "River district", status: "OK" },
    { id: "cr3", name: "Lakeside", status: "Pressure" },
    { id: "cr4", name: "Airport corridor", status: "OK" },
  ],
  managers: [
    { id: "cm1", name: "Riley Park", scope: "Center operations" },
    { id: "cm2", name: "Devon Ali", scope: "Compliance" },
    { id: "cm3", name: "Sam Okonkwo", scope: "Family services" },
  ],
  escalations: [
    { id: "ce1", title: "Licensing visit · Lakeside", age: "2d" },
    { id: "ce2", title: "Ratio exception · Room B", age: "45m" },
  ],
  integrations: [
    { id: "ci1", name: "Procare", health: "Healthy" },
    { id: "ci2", name: "State subsidy portal", health: "Degraded" },
    { id: "ci3", name: "Brightwheel", health: "Healthy" },
  ],
};
