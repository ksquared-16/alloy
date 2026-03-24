import type { CompanyWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

/** Insurance broker / MGA — company-level book view */
export const demoInsuranceCompanyModelBase: Omit<CompanyWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  organizationId: "org-insurance-demo",
  organizationLabel: "Northbridge Risk Partners",
  focusLabel: "Company focus",
  aiSummary: {
    headline: "Carrier SLA breaches + renewal concentration",
    aiAwarenessLine: "System status: stable · producer desk elevated",
  },
  signals: [
    {
      id: "ins-co-sig-sla",
      severity: "critical",
      title: "8 quotes past carrier SLA",
      description: "Admitted + E&S",
      actions: [{ id: "open_ops_dept", label: "Open" }],
    },
    {
      id: "ins-co-sig-ren",
      severity: "warning",
      title: "6 renewals inside 14d",
      actions: [{ id: "open_revenue_dept", label: "Open" }],
    },
    {
      id: "ins-co-sig-uw",
      severity: "warning",
      title: "4 UW packets stalled",
      actions: [{ id: "open_growth_dept", label: "Open" }],
    },
  ],
  kpis: [
    { id: "ick1", label: "Premium (rolling 30d)", value: "$2.1M", lane: "business" },
    { id: "ick2", label: "Submissions (7d)", value: "54", lane: "business" },
    { id: "ick3", label: "Bind rate", value: "39", unit: "%", lane: "business" },
    {
      id: "ick4",
      label: "Carrier response AI score",
      value: "86",
      unit: "%",
      lane: "ai",
      aiSummary: "Desk-level, 30d",
    },
    {
      id: "ick5",
      label: "Renewal risk model",
      value: "82",
      unit: "%",
      lane: "ai",
    },
    {
      id: "ick6",
      label: "Triage accuracy",
      value: "93",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryDepartments: [
    {
      id: "ico-dept-ren",
      departmentKey: "revenue",
      label: "Revenue / Retention",
      countBadge: 12,
      rollupGroups: [
        { id: "ico-r-exp", label: "Expiring next 7 days", count: 6 },
        { id: "ico-r-risk", label: "At risk · 30–60 days", count: 4 },
        { id: "ico-r-bnd", label: "Binder outstanding", count: 2 },
      ],
    },
    {
      id: "ico-dept-prod",
      departmentKey: "operations",
      label: "Producer desk",
      countBadge: 14,
      rollupGroups: [
        { id: "ico-p-q", label: "Quotes awaiting carrier", count: 5 },
        { id: "ico-p-r", label: "Renewals at risk", count: 3 },
        { id: "ico-p-f", label: "Carrier follow-ups", count: 6 },
      ],
    },
    {
      id: "ico-dept-gr",
      departmentKey: "growth",
      label: "New business",
      countBadge: 9,
      rollupGroups: [
        { id: "ico-g-ap", label: "Apps in triage", count: 4 },
        { id: "ico-g-rf", label: "Referrals", count: 3 },
        { id: "ico-g-co", label: "Cross-sell queue", count: 2 },
      ],
    },
  ],
  secondaryDepartments: [
    {
      id: "ico-dept-uw",
      departmentKey: "team",
      label: "UW coordination",
      countBadge: 4,
      rollupGroups: [
        { id: "ico-u-ex", label: "UW exceptions", count: 2 },
        { id: "ico-u-do", label: "Document gaps", count: 2 },
      ],
    },
    {
      id: "ico-dept-fin",
      departmentKey: "finance",
      label: "Finance",
      countBadge: 3,
      rollupGroups: [
        { id: "ico-fn-c", label: "Commission reconciliations", count: 2 },
        { id: "ico-fn-r", label: "Carrier payables", count: 1 },
      ],
    },
    {
      id: "ico-dept-sys",
      departmentKey: "systems",
      label: "Systems",
      countBadge: 3,
      rollupGroups: [
        { id: "ico-sy-r", label: "Rating API errors", count: 2 },
        { id: "ico-sy-s", label: "Sync failures", count: 1 },
      ],
    },
  ],
  workSummary: {
    id: "ico-co-ws",
    title: "",
    progressLabel: "Book-wide · automations",
    workflowMetrics: {
      avgRunTimeLabel: "5m 22s",
      successRateLabel: "96.4%",
      runsTodayLabel: "428",
      failuresTodayLabel: "6",
    },
    workflowRuns: [
      { id: "ico-w1", name: "Carrier chase workflow", status: "running", lastRunLabel: "09:44 · batch" },
      { id: "ico-w2", name: "Renewal retention playbook", status: "completed", lastRunLabel: "09:30 · 11m" },
      { id: "ico-w3", name: "UW packet assembler", status: "completed", lastRunLabel: "09:18 · 3m 02s" },
      { id: "ico-w4", name: "Bind verification", status: "running", lastRunLabel: "08:55 · in progress" },
      { id: "ico-w5", name: "Producer SLA digest", status: "completed", lastRunLabel: "08:40 · 48s" },
      { id: "ico-w6", name: "Carrier feed health", status: "failed", lastRunLabel: "07:12 · 1m 44s" },
    ],
    aiSuggestion:
      "Observation — rating API errors concentrated on one carrier feed; chase and renewal playbooks otherwise nominal.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: [
      "Carrier feeds: 1 degraded",
      "Litigation holds: 2 accounts (manual only)",
    ],
    systemActions: [
      { id: "co_sys_create", label: "Create submission", variant: "primary" },
      { id: "co_sys_ingest", label: "Ingest document", variant: "secondary" },
      { id: "co_sys_workflow", label: "Execute workflow", variant: "secondary" },
      { id: "co_sys_report", label: "Run report", variant: "secondary" },
    ],
    quickOperations: [
      { id: "co_q_dept", label: "Open department", variant: "primary" },
      { id: "co_q_export", label: "Export pipeline", variant: "secondary" },
      { id: "co_q_notify", label: "Notify producer lead", variant: "secondary" },
      { id: "co_q_rebalance", label: "Batch carrier nudges", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "co_sm_east", label: "Execute nudge → 5 quotes past SLA", emphasized: true },
      { id: "co_sm_pay", label: "Route 2 stalled UW packets" },
      { id: "co_sm_auto", label: "Retry carrier feed health job" },
    ],
  },
};

export const demoInsuranceCompanyContextRaw: ContextRelationshipRawData = {
  regions: [
    { id: "ir1", name: "Gulf states", status: "Pressure" },
    { id: "ir2", name: "Midwest", status: "OK" },
    { id: "ir3", name: "Mountain", status: "OK" },
    { id: "ir4", name: "Northeast", status: "Watch" },
  ],
  managers: [
    { id: "im1", name: "Jordan Lee", scope: "Commercial producers" },
    { id: "im2", name: "Priya Shah", scope: "Personal lines" },
    { id: "im3", name: "Marcus Webb", scope: "Renewals" },
  ],
  escalations: [
    { id: "ie1", title: "E&S coastal wind referral", age: "26h" },
    { id: "ie2", title: "SMB block renewal · 5d", age: "12h" },
  ],
  integrations: [
    { id: "ii1", name: "Applied Epic", health: "Healthy" },
    { id: "ii2", name: "Carrier rating hub", health: "Degraded" },
    { id: "ii3", name: "DocuSign", health: "Healthy" },
  ],
};
