import type { DepartmentWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

/** Home Services — Operations department */
export const demoHomeServicesDepartmentModelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  departmentId: "dept-cleaning-ops",
  departmentLabel: "Operations",
  aiSummary: {
    headline: "East-side density · assignment gap",
    aiAwarenessLine: "Live model — dispatch · billing · inventory (watching 3 intervention paths)",
    bodyParagraphs: [
      "Route load is skewed toward the east cluster; travel buffers are eating into booked windows even though overall on-time performance still looks acceptable on paper.",
      "Three jobs are still unassigned past the 2h window — two standard cleans can likely absorb a float, while the deep clean on Oak may need a crew split or a narrow reschedule window.",
      "Visible lanes stay quiet on supply and payment, but billing still has open mismatches behind the rollup and two vans are trending toward a midday restock threshold.",
    ],
    emphasisPhrases: [
      "Three jobs are still unassigned past the 2h window",
      "east cluster",
    ],
  },
  signals: [
    {
      id: "sig-late",
      severity: "warning",
      title: "3 jobs behind schedule",
      description: "East cluster",
      aiExplanation: "Prioritized — travel buffer burn vs. 7-day baseline.",
      actions: [{ id: "rebalance_routes", label: "Rebalance" }],
      meta: { source: "dispatch" },
    },
    {
      id: "sig-unassigned",
      severity: "critical",
      title: "2 jobs unassigned",
      aiExplanation: "Critical path — past 2h assignment window.",
      actions: [{ id: "assign_cleaner", label: "Assign" }],
    },
    {
      id: "sig-supplies",
      severity: "info",
      title: "Van supplies low",
      description: "2 routes · midday window",
      aiExplanation: "Trending — restock before midday wave.",
      actions: [{ id: "open_inventory", label: "Restock" }],
    },
  ],
  kpis: [
    { id: "k1", label: "Jobs today", value: "42", lane: "business" },
    { id: "k2", label: "On-time %", value: "94", lane: "business" },
    { id: "k4", label: "Revenue today", value: "$12.4k", lane: "business" },
    {
      id: "k3",
      label: "Utilization",
      value: "78",
      unit: "%",
      lane: "ai",
      aiSummary: "Capacity headroom vs. demand",
    },
    {
      id: "k5",
      label: "ETA accuracy",
      value: "91",
      unit: "%",
      lane: "ai",
      aiSummary: "Rolling 7-day",
    },
    {
      id: "k6",
      label: "Auto-assign share",
      value: "34",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryQueue: {
    id: "q-unassigned",
    title: "Route & assignment",
    countBadge: 6,
    items: [],
    rollupSummary: "Ongoing dispatch work grouped by situation — not individual jobs.",
    rollupGroups: [
      {
        id: "clean-t-unassigned",
        label: "Unassigned jobs",
        count: 3,
        descriptor: "No crew pinned; mix of standard and deep cleans waiting for assignment.",
      },
      {
        id: "clean-t-late",
        label: "Late / at-risk jobs",
        count: 2,
        descriptor: "Behind travel buffer or slipping past the booked customer window.",
      },
      {
        id: "clean-t-resched",
        label: "Reschedules needed",
        count: 1,
        descriptor: "Customer or capacity conflicts needing a new slot confirmation.",
      },
    ],
    rollupExamples: [{ id: "clean-ex1", label: "East cluster window compression on morning wave" }],
    viewAllActionId: "open_queue",
    viewAllLabel: "Open rollup →",
    drillWorkUnitKey: "unassigned_jobs_east",
  },
  secondaryQueue: {
    id: "q-review",
    title: "Needs attention",
    countBadge: 4,
    items: [],
    rollupSummary: "Review, billing, and customer intervention — exceptions only.",
    rollupGroups: [
      {
        id: "clean-a-invoice",
        label: "Invoice mismatches",
        count: 1,
        descriptor: "Scope, line items, or signed work order doesn’t match billing.",
      },
      {
        id: "clean-a-pay",
        label: "Payment disputes",
        count: 1,
        descriptor: "Chargebacks, failed capture, or disputed line items.",
      },
      {
        id: "clean-a-cust",
        label: "Customer issues",
        count: 2,
        descriptor: "Service complaints, access problems, or repeat no-shows.",
      },
    ],
    rollupExamples: [{ id: "clean-ex2", label: "e.g. INV-889 line items vs. signed scope" }],
    viewAllActionId: "open_attention_queue",
    viewAllLabel: "Open rollup →",
  },
  workSummary: {
    id: "ws-dispatch",
    title: "",
    progressLabel: "12 live · dispatch + billing",
    workflowMetrics: {
      avgRunTimeLabel: "4m 12s",
      successRateLabel: "98.2%",
      runsTodayLabel: "186",
      failuresTodayLabel: "3",
    },
    workflowRuns: [
      {
        id: "wr1",
        name: "Dispatch — morning wave",
        status: "completed",
        lastRunLabel: "08:02 · 3m 18s",
      },
      {
        id: "wr2",
        name: "Auto-assign queue",
        status: "running",
        lastRunLabel: "09:41 · in progress",
      },
      {
        id: "wr3",
        name: "Billing sync",
        status: "completed",
        lastRunLabel: "09:12 · 48s",
      },
      {
        id: "wr4",
        name: "Inventory restock alert",
        status: "failed",
        lastRunLabel: "08:55 · 1m 04s",
      },
    ],
    aiSuggestion:
      "Observation — auto-assign confidence stays high; the failed inventory run maps to one SKU edge case, not systemic stock.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: [
      "Automation active: dispatch auto-assign",
      "Queue load: elevated · east cluster",
    ],
    systemActions: [
      { id: "sys_create_job", label: "Create job", variant: "primary" },
      { id: "sys_upload_document", label: "Ingest document", variant: "secondary" },
      { id: "sys_run_report", label: "Execute operations report", variant: "secondary" },
      { id: "sys_trigger_workflow", label: "Execute workflow", variant: "secondary" },
    ],
    quickOperations: [
      { id: "assign_cleaner", label: "Assign resource", variant: "primary" },
      { id: "notify_team", label: "Send notification", variant: "secondary" },
      { id: "export_day_sheet", label: "Export day sheet", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "smart_rebalance_east", label: "Execute rebalance → east cluster" },
      { id: "smart_resolve_invoices", label: "Resolve 2 invoice mismatches" },
      { id: "smart_queue_restock", label: "Queue restock → midday vans" },
    ],
  },
  /** Not shown as lanes yet — models full cleaning ops surface */
  latentWorkObjectQueues: [
    { id: "latent-clean-late", title: "Late / at-risk jobs", countBadge: 4, items: [] },
    { id: "latent-clean-supply", title: "Supply issues", countBadge: 2, items: [] },
    { id: "latent-clean-payment", title: "Payment issues", countBadge: 3, items: [] },
    { id: "latent-clean-customer", title: "Customer issues", countBadge: 1, items: [] },
  ],
};

export const demoHomeServicesDepartmentContextRaw: ContextRelationshipRawData = {
  site_contacts: [
    { id: "p1", name: "Jordan Lee", phone: "555-0142" },
    { id: "p2", name: "Sam Rivera", phone: "555-0199" },
  ],
  team_availability: [
    { id: "t1", name: "Alex M.", status: "On job" },
    { id: "t2", name: "Riley K.", status: "Available" },
  ],
};

export const demoCleaningDepartmentModelBase = demoHomeServicesDepartmentModelBase;
export const demoCleaningContextRaw = demoHomeServicesDepartmentContextRaw;

