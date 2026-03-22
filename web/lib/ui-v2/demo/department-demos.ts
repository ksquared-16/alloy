import type { DepartmentWorkspaceModel } from "../workspace-types";
import type { ContextRelationshipRawData } from "../adapters/context-adapter";

/** Home cleaning — all strings flow from demo data / future API */
export const demoCleaningDepartmentModelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail"> = {
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

export const demoCleaningContextRaw: ContextRelationshipRawData = {
  site_contacts: [
    { id: "p1", name: "Jordan Lee", phone: "555-0142" },
    { id: "p2", name: "Sam Rivera", phone: "555-0199" },
  ],
  team_availability: [
    { id: "t1", name: "Alex M.", status: "On job" },
    { id: "t2", name: "Riley K.", status: "Available" },
  ],
};

/** Childcare — different labels, same block system */
export const demoChildcareDepartmentModelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  departmentId: "dept-childcare-ops",
  departmentLabel: "Center operations",
  aiSummary: {
    headline: "Room B · ratios · subsidy file",
    aiAwarenessLine: "Live model — ratios · subsidy file · check-ins (2 interventions staged)",
    bodyParagraphs: [
      "Room B is the pressure point: forecasted headcount brings you within a thin margin of ratio limits around 15:30 unless a float is staged before the afternoon block.",
      "Check-in and tardy exceptions are light in the visible lanes, but two arrivals still need verification against the subsidy file before billing closes today.",
      "Compliance paperwork is moving, yet subsidy review and documentation exceptions remain the highest-intervention categories if ratios stay tight through pickup.",
    ],
    emphasisPhrases: ["Room B", "15:30", "subsidy"],
  },
  signals: [
    {
      id: "sig-ratio",
      severity: "warning",
      title: "Ratio risk · Room B 15:30",
      description: "Float not staged",
      aiExplanation: "Prioritized — threshold breach forecast ~15:30 without float.",
      actions: [{ id: "assign_float", label: "Assign float" }],
    },
    {
      id: "sig-checkin",
      severity: "info",
      title: "2 check-ins open",
      aiExplanation: "Low noise — clear before subsidy close.",
      actions: [{ id: "open_checkins", label: "Open" }],
    },
    {
      id: "sig-medication",
      severity: "warning",
      title: "PRN co-sign required",
      aiExplanation: "Compliance gate — route to on-duty lead.",
      actions: [{ id: "open_med_log", label: "Open log" }],
    },
  ],
  kpis: [
    { id: "k1", label: "Attendance today", value: "118", lane: "business" },
    { id: "k2", label: "Ratio compliance", value: "100", unit: "%", lane: "business" },
    { id: "k-b3", label: "Open incidents", value: "0", lane: "business" },
    {
      id: "k3",
      label: "Staff coverage",
      value: "96",
      unit: "%",
      lane: "ai",
      aiSummary: "Forecast stable through 17:00",
    },
    {
      id: "k-a2",
      label: "Predicted peak",
      value: "15:30",
      lane: "ai",
      aiSummary: "Room B window",
    },
    {
      id: "k-a3",
      label: "Compliance score",
      value: "99",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryQueue: {
    id: "q-coverage",
    title: "Roster & coverage",
    countBadge: 4,
    items: [],
    rollupSummary: "Day-to-day operational throughput across rooms and arrivals.",
    rollupGroups: [
      {
        id: "cc-t-rooms",
        label: "Rooms needing coverage",
        count: 1,
        descriptor: "Afternoon blocks or breaks where ratio or licensing needs a float.",
      },
      {
        id: "cc-t-checkin",
        label: "Check-ins & tardies",
        count: 2,
        descriptor: "Arrivals not finalized or late pickup patterns needing staff follow-up.",
      },
      {
        id: "cc-t-attendance",
        label: "Attendance gaps",
        count: 1,
        descriptor: "Expected child not checked in or roster vs. actual headcount mismatch.",
      },
    ],
    rollupExamples: [{ id: "cc-ex1", label: "e.g. Room B afternoon block · float by 15:15" }],
    viewAllActionId: "view_rooms",
    viewAllLabel: "Open rollup →",
  },
  secondaryQueue: {
    id: "q-review-cc",
    title: "Compliance & exceptions",
    countBadge: 3,
    items: [],
    rollupSummary: "Subsidy, ratio, and documentation work that needs human review.",
    rollupGroups: [
      {
        id: "cc-a-ratio",
        label: "Ratio violations (open)",
        count: 0,
        descriptor: "Licensed headcount vs. children present — intervention or documentation.",
      },
      {
        id: "cc-a-subsidy",
        label: "Subsidy mismatches",
        count: 2,
        descriptor: "State file, eligibility, or roster effective dates out of sync.",
      },
      {
        id: "cc-a-docs",
        label: "DRDP / licensing documentation",
        count: 1,
        descriptor: "Coaching visits, missing files, or audit-ready packet gaps.",
      },
    ],
    viewAllActionId: "open_review_queue",
    viewAllLabel: "Open rollup →",
  },
  workSummary: {
    id: "ws-cc-flows",
    title: "",
    progressLabel: "6 live · check-in + ratio guard",
    workflowMetrics: {
      avgRunTimeLabel: "2m 04s",
      successRateLabel: "100%",
      runsTodayLabel: "48",
      failuresTodayLabel: "0",
    },
    workflowRuns: [
      {
        id: "wcc1",
        name: "Check-in batch",
        status: "completed",
        lastRunLabel: "08:30 · 1m 12s",
      },
      {
        id: "wcc2",
        name: "Ratio guard — Room B",
        status: "running",
        lastRunLabel: "Live · next tick 15:15",
      },
      {
        id: "wcc3",
        name: "Medication co-sign router",
        status: "completed",
        lastRunLabel: "07:55 · 22s",
      },
    ],
    aiSuggestion:
      "Observation — automations green; next ratio guard tick 15:15 will re-score Room B if float isn’t staged.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: ["Automation active: ratio guard workflow", "Queue load: normal"],
    systemActions: [
      { id: "sys_create_enrollment", label: "Create enrollment record", variant: "primary" },
      { id: "sys_upload_health_form", label: "Ingest health / immunization record", variant: "secondary" },
      { id: "sys_run_compliance_report", label: "Execute compliance report", variant: "secondary" },
      { id: "sys_trigger_pickup_notify", label: "Execute pickup notification workflow", variant: "secondary" },
    ],
    quickOperations: [
      { id: "assign_float", label: "Assign resource", variant: "primary" },
      { id: "notify_parents", label: "Send notification", variant: "secondary" },
      { id: "open_compliance_log", label: "Open compliance log", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "smart_stage_float_room_b", label: "Stage float → Room B · before 15:15" },
      { id: "smart_close_subsidy_two", label: "Close 2 subsidy verifications" },
      { id: "smart_med_cosign", label: "Route PRN co-sign → on-duty lead" },
    ],
  },
  latentWorkObjectQueues: [
    { id: "latent-cc-checkin", title: "Check-ins & tardies", countBadge: 2, items: [] },
    { id: "latent-cc-ratio", title: "Ratio violations (open)", countBadge: 0, items: [] },
    { id: "latent-cc-attendance", title: "Attendance gaps", countBadge: 1, items: [] },
    { id: "latent-cc-parent", title: "Parent escalations", countBadge: 0, items: [] },
    { id: "latent-cc-subsidy", title: "Subsidy / payment mismatches", countBadge: 1, items: [] },
  ],
};

export const demoChildcareContextRaw: ContextRelationshipRawData = {
  guardians: [
    { id: "g1", name: "Taylor Chen", phone: "555-0201" },
  ],
  room_roster: [
    { id: "ch1", name: "Morgan P.", notes: "Nut allergy" },
    { id: "ch2", name: "Jamie Q.", notes: "" },
  ],
};

/** Private broker / MGA — shops carriers, renewals, UW coordination (not a single carrier) */
export const demoInsuranceDepartmentModelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  departmentId: "dept-insurance-broker",
  departmentLabel: "Northbridge Risk Partners",
  aiSummary: {
    headline: "Producer desk · carrier + renewal pressure",
    aiAwarenessLine: "Live model — carrier SLAs · UW queue · renewal risk (5 quotes past SLA)",
    bodyParagraphs: [
      "Bind rate is healthy for the week, but the brokered book is waiting on five carrier desks past agreed SLA — producers should prioritize nudges before carriers close for the day.",
      "Underwriting exceptions and missing client packets are concentrated in HO-3 coastal and a commercial auto renewal; both need human routing, not automated chase, until documents land.",
      "Renewals at risk and premium timing issues are mostly latent in other rollups today; retention outreach is incomplete for two SMB groups that renew inside seven days.",
    ],
    emphasisPhrases: [
      "five carrier desks past agreed SLA",
      "Renewals at risk",
    ],
  },
  signals: [
    {
      id: "sig-renewals",
      severity: "warning",
      title: "3 renewals at risk (7d)",
      description: "2 SMB groups",
      aiExplanation: "Prioritized — renew inside 7d; retention touch incomplete.",
      actions: [{ id: "open_renewals", label: "Open renewals" }],
    },
    {
      id: "sig-sla",
      severity: "critical",
      title: "5 quotes past carrier SLA",
      description: "Admitted + E&S markets",
      aiExplanation: "Critical path — carrier desks silent past agreed SLA.",
      actions: [{ id: "nudge_carriers", label: "Nudge carriers" }],
    },
    {
      id: "sig-uw",
      severity: "warning",
      title: "2 UW exceptions",
      description: "HO-3 · commercial auto",
      aiExplanation: "Needs human routing until packets land.",
      actions: [{ id: "open_uw_queue", label: "Open UW queue" }],
    },
  ],
  kpis: [
    { id: "ins-k1", label: "Producer quotes (7d)", value: "38", lane: "business" },
    { id: "ins-k2", label: "Bind rate (brokered)", value: "41", unit: "%", lane: "business" },
    { id: "ins-k3", label: "Renewal retention", value: "92", unit: "%", lane: "business" },
    {
      id: "ins-a1",
      label: "Carrier fit confidence",
      value: "88",
      unit: "%",
      lane: "ai",
      aiSummary: "Across shopped markets, 30d",
    },
    {
      id: "ins-a2",
      label: "Submission triage accuracy",
      value: "94",
      unit: "%",
      lane: "ai",
    },
    {
      id: "ins-a3",
      label: "Producer auto-follow-up",
      value: "67",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryQueue: {
    id: "q-quotes-carrier",
    title: "Carrier & renewal pipeline",
    countBadge: 14,
    items: [],
    rollupSummary: "Producer-side throughput across markets you’re shopping — not individual submissions.",
    rollupGroups: [
      {
        id: "ins-t-quotes",
        label: "Quotes awaiting carrier response",
        count: 5,
        descriptor: "Admitted, E&S, or specialty desks still silent past internal SLA.",
      },
      {
        id: "ins-t-renewals",
        label: "Renewals at risk",
        count: 3,
        descriptor: "Retention dates approaching; outreach or bind paperwork incomplete.",
      },
      {
        id: "ins-t-followup",
        label: "Carrier follow-up items",
        count: 6,
        descriptor: "Rounds of questions, referrals, or mid-quote clarifications across carriers.",
      },
    ],
    rollupExamples: [{ id: "ins-ex1", label: "e.g. BOP shopped across Acme · Midwest · longest 46h open" }],
    viewAllActionId: "open_quote_pipeline",
    viewAllLabel: "Open rollup →",
  },
  secondaryQueue: {
    id: "q-ins-review",
    title: "Review & underwriting",
    countBadge: 7,
    items: [],
    rollupSummary: "Exceptions and packet gaps that need producer or account review before bind.",
    rollupGroups: [
      {
        id: "ins-a-uw",
        label: "Underwriting exceptions",
        count: 2,
        descriptor: "Referrals, MVR / loss-run gaps, or coastal wind referrals stuck in UW.",
      },
      {
        id: "ins-a-docs",
        label: "Missing client documents",
        count: 3,
        descriptor: "Apps, dec pages, signed forms, or ACORD packets the client hasn’t returned.",
      },
      {
        id: "ins-a-prem",
        label: "Premium / payment issues",
        count: 2,
        descriptor: "Installment timing, agency bill problems, or carrier invoice mismatches.",
      },
    ],
    rollupExamples: [{ id: "ins-ex2", label: "e.g. commercial auto #44821 · Rivera renewal packet" }],
    viewAllActionId: "open_exceptions",
    viewAllLabel: "Open rollup →",
  },
  latentWorkObjectQueues: [
    { id: "latent-ins-renewal", title: "Renewals at risk", countBadge: 3, items: [] },
    { id: "latent-ins-payment", title: "Premium / payment issues", countBadge: 2, items: [] },
    { id: "latent-ins-carrier", title: "Carrier follow-up items", countBadge: 6, items: [] },
    { id: "latent-ins-client", title: "Client escalations", countBadge: 1, items: [] },
    { id: "latent-ins-endorse", title: "Policy changes pending", countBadge: 4, items: [] },
  ],
  workSummary: {
    id: "ws-ins-flows",
    title: "",
    progressLabel: "14 live · quotes + renewals + UW",
    workflowMetrics: {
      avgRunTimeLabel: "6m 40s",
      successRateLabel: "96.1%",
      runsTodayLabel: "214",
      failuresTodayLabel: "5",
    },
    workflowRuns: [
      {
        id: "iwr1",
        name: "Carrier quote chase",
        status: "running",
        lastRunLabel: "09:48 · batch 5 carriers",
      },
      {
        id: "iwr2",
        name: "Renewal retention playbook",
        status: "completed",
        lastRunLabel: "08:10 · 12m 02s",
      },
      {
        id: "iwr3",
        name: "UW packet assembler",
        status: "completed",
        lastRunLabel: "07:42 · 4m 11s",
      },
      {
        id: "iwr4",
        name: "SLA breach notifier",
        status: "failed",
        lastRunLabel: "06:55 · partial send",
      },
    ],
    aiSuggestion:
      "Observation — auto-follow-up paused on two accounts with litigation flags; model recommends manual review only.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: [
      "Automation active: carrier chase workflow",
      "Queue load: high · producer desk",
    ],
    systemActions: [
      { id: "sys_create_submission", label: "Create submission", variant: "primary" },
      { id: "sys_upload_document", label: "Ingest document", variant: "secondary" },
      { id: "sys_run_producer_report", label: "Execute producer report", variant: "secondary" },
      { id: "sys_trigger_carrier_chase", label: "Execute carrier chase workflow", variant: "secondary" },
    ],
    quickOperations: [
      { id: "nudge_all_sla", label: "Execute SLA nudge batch", variant: "primary" },
      { id: "open_producer_board", label: "Open producer board", variant: "secondary" },
      { id: "export_pipeline", label: "Export pipeline", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "smart_followup_quotes_sla", label: "Execute carrier nudge → 3 quotes past SLA" },
      { id: "smart_route_uw_exceptions", label: "Route 2 UW exceptions → human desk" },
      { id: "smart_renewal_touch", label: "Queue renewal touch → SMB group" },
    ],
    overflow: [{ id: "escalate_uw", label: "Escalate to UW lead" }],
  },
};

export const demoInsuranceContextRaw: ContextRelationshipRawData = {
  carriers_on_file: [
    { id: "car1", name: "Coastal Mutual", status: "Admitted · HO focus" },
    { id: "car2", name: "Midwest General", status: "Commercial lines" },
    { id: "car3", name: "Acme Specialty", status: "E&S overflow" },
  ],
  pending_quotes: [
    { id: "pqx1", client: "Summit Dental", carrier: "Acme", sla: "46h open" },
    { id: "pqx2", client: "Nguyen", carrier: "Coastal", sla: "18h open" },
  ],
};
