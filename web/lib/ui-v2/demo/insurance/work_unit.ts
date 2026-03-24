import type { WorkUnitWorkspaceModel } from "../../workspace-types";

/**
 * Insurance renewals — Expiring policies lane (drill from Renewals pipeline).
 */
export const demoInsuranceWorkUnitBase: Omit<WorkUnitWorkspaceModel, "workspaceLevel"> = {
  workUnitId: "lane-expiring-policies",
  laneKey: "expiring_policies",
  focusLabel: "Revenue / Retention · Renewals pipeline · Expiring policies",
  aiSummary: {
    headline: "Expiring policies · next 7 days",
    aiAwarenessLine: "6 policies · binders + dec pages · Rivera CAU highest risk.",
    bodyParagraphs: [
      "Rivera commercial auto block is 5d to expiry with Midwest General — signed dec page and payment auth still missing; bind will not clear without producer touch today.",
    ],
    emphasisPhrases: ["5d to expiry", "Rivera"],
  },
  laneInterpretation: {
    laneStatusLine: "6 · 2 blocked · 1 premium lead",
    recommendedActionLine: "Chase Rivera CAU",
  },
  signals: [
    {
      id: "ins-wu-s1",
      severity: "critical",
      title: "Rivera CAU · binder gap",
      actions: [{ id: "open_record", label: "Open" }],
    },
    {
      id: "ins-wu-s2",
      severity: "warning",
      title: "2 coastal HO · dec pages",
      actions: [{ id: "nudge_carriers", label: "Notify" }],
    },
    {
      id: "ins-wu-s3",
      severity: "info",
      title: "1 SMB on retention play",
      actions: [{ id: "queue_retention", label: "Queue" }],
    },
  ],
  kpis: [
    { id: "iw-k1", label: "In lane", value: "6", lane: "business" },
    { id: "iw-k2", label: "< 7d", value: "6", lane: "business" },
    { id: "iw-k3", label: "Binders open", value: "3", lane: "business" },
    { id: "iw-k4", label: "Bind probability", value: "78", unit: "%", lane: "ai" },
    { id: "iw-k5", label: "Chase fit", value: "0.74", lane: "ai" },
    { id: "iw-k6", label: "Risk score", value: "86", unit: "%", lane: "ai" },
  ],
  primaryQueue: {
    id: "queue-expiring-policies",
    title: "Expiring policies",
    countBadge: 6,
    sortCaption: "Expiry ↑",
    workUnitGroupHeaders: {
      critical: { emoji: "🔴", label: "Binder due" },
      warning: { emoji: "⚠️", label: "Dec page / auth" },
      standard: { label: "On track" },
    },
    items: [
      {
        id: "policy-renewal-rivera",
        title: "Rivera CAU · 5d to expiry",
        subtitle: "Binder missing · $42k premium",
        groupKey: "critical",
        urgencyTier: "critical",
        waitStatus: "breached",
        quickActions: [],
      },
      {
        id: "pol-ren-nguyen",
        title: "Nguyen HO-3 · 9d",
        subtitle: "Dec out · $2.1k",
        groupKey: "warning",
        urgencyTier: "warning",
        waitStatus: "approaching",
        quickActions: [],
      },
      {
        id: "pol-ren-summit",
        title: "Summit Dental BOP · 11d",
        subtitle: "Quoting · on track",
        groupKey: "standard",
        urgencyTier: "standard",
        waitStatus: "safe",
        quickActions: [],
      },
    ],
  },
  workSummary: {
    id: "wk-lane-expiring",
    title: "Lane automation",
    progressLabel: "3 workflows",
    workflowMetrics: {
      avgRunTimeLabel: "4m 40s",
      successRateLabel: "96%",
      runsTodayLabel: "88",
      failuresTodayLabel: "1",
    },
    workflowRuns: [
      { id: "ewf1", name: "Binder reminder", status: "running", lastRunLabel: "09:50" },
      { id: "ewf2", name: "Dec page collector", status: "completed", lastRunLabel: "09:05" },
      { id: "ewf3", name: "Retention SMB play", status: "running", lastRunLabel: "08:30" },
    ],
    aiSuggestion: "Binder reminder + retention play running; dec collector finished last batch at 09:05.",
  },
  actionsRail: {
    primaries: [],
    systemActions: [
      { id: "sys_create_renewal", label: "Create renewal task", variant: "primary" },
      { id: "ingest_document", label: "Ingest document", variant: "secondary" },
      { id: "execute_workflow", label: "Execute workflow", variant: "secondary" },
      { id: "run_report", label: "Run report", variant: "secondary" },
    ],
    quickOperations: [
      { id: "chase_binders", label: "Chase" },
      { id: "nudge_carriers", label: "Notify" },
      { id: "export_lane", label: "Export lane" },
    ],
    smartSuggestions: [
      { id: "ai_rivera", label: "Open Rivera renewal" },
      { id: "ai_dec_pages", label: "Batch dec page chase" },
    ],
    systemStatusLines: ["2 litigation holds · manual only", "Carrier hub: watch"],
    overflow: [{ id: "lane_settings", label: "Lane settings" }],
  },
  contextRail: { groups: [] },
};
