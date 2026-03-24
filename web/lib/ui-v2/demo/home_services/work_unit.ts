import type { WorkUnitWorkspaceModel } from "../../workspace-types";

/**
 * Home Services — concrete lane: Unassigned jobs · east cluster (drill from Operations throughput rollup).
 */
export const demoHomeServicesWorkUnitBase: Omit<WorkUnitWorkspaceModel, "workspaceLevel"> = {
  workUnitId: "lane-unassigned-east",
  laneKey: "unassigned_jobs_east",
  focusLabel: "Operations · Throughput · Unassigned",
  aiSummary: {
    headline: "Unassigned jobs · east cluster",
    aiAwarenessLine: "7 jobs · east · SLA + coverage watch.",
    bodyParagraphs: [
      "2h assignment SLA breached on 2 jobs; deep clean needs dispatch before 13:00; east coverage thin ~90m.",
    ],
    emphasisPhrases: ["2h assignment SLA", "13:00"],
  },
  laneInterpretation: {
    laneStatusLine: "7 · 2 SLA · east thin · deep 13:00",
    recommendedActionLine: "Assign → Chen",
  },
  signals: [
    {
      id: "wu-s1",
      severity: "critical",
      title: "2 past assignment SLA",
      actions: [{ id: "sla_review", label: "Review" }],
    },
    {
      id: "wu-s2",
      severity: "warning",
      title: "Deep clean unassigned",
      actions: [{ id: "dispatch_deep_clean", label: "Assign" }],
    },
    {
      id: "wu-s3",
      severity: "warning",
      title: "East capacity low",
      actions: [{ id: "open_coverage", label: "Fix" }],
    },
  ],
  kpis: [
    { id: "k-b1", label: "Jobs in queue", value: "7", lane: "business" },
    { id: "k-b2", label: "Avg wait", value: "47", unit: "m", lane: "business" },
    { id: "k-b3", label: "SLA breaches", value: "2", lane: "business" },
    { id: "k-a1", label: "Auto-assign confidence", value: "61", unit: "%", lane: "ai", aiSummary: "Holding low matches" },
    { id: "k-a2", label: "Route fit score", value: "0.72", lane: "ai" },
    { id: "k-a3", label: "Prediction confidence", value: "84", unit: "%", lane: "ai" },
  ],
  primaryQueue: {
    id: "queue-unassigned-east",
    title: "Unassigned jobs",
    countBadge: 7,
    sortCaption: "SLA ↓",
    workUnitGroupHeaders: {
      past_sla: { emoji: "🔴", label: "Past SLA" },
      hard_start: { emoji: "⚠️", label: "Hard start" },
      morning_wave: { label: "Morning wave" },
    },
    items: [
      {
        id: "job-7712",
        title: "Chen residence · 10–12 window",
        subtitle: "Unassigned · SLA risk",
        groupKey: "past_sla",
        urgencyTier: "critical",
        waitStatus: "breached",
        valueLabel: "$180",
        quickActions: [],
      },
      {
        id: "job-7704",
        title: "Torres Airbnb · 09:30–11:30",
        subtitle: "Unassigned · SLA risk",
        groupKey: "past_sla",
        urgencyTier: "critical",
        waitStatus: "breached",
        valueLabel: "$320",
        quickActions: [],
      },
      {
        id: "job-7720",
        title: "Nguyen deep clean · 13–16",
        subtitle: "Unassigned · hard start",
        groupKey: "hard_start",
        urgencyTier: "warning",
        waitStatus: "approaching",
        valueLabel: "$1.2k",
        quickActions: [],
      },
      {
        id: "job-7724",
        title: "Patel move-out · 08–10",
        subtitle: "Unassigned · windows add-on",
        groupKey: "morning_wave",
        urgencyTier: "standard",
        waitStatus: "safe",
        quickActions: [],
      },
    ],
  },
  workSummary: {
    id: "wk-lane-east",
    title: "Lane automation",
    progressLabel: "4 workflows",
    workflowMetrics: {
      avgRunTimeLabel: "2m 10s",
      successRateLabel: "97.2%",
      runsTodayLabel: "412",
      failuresTodayLabel: "3",
    },
    workflowRuns: [
      { id: "wf-1", name: "Auto-assign queue", status: "running", lastRunLabel: "09:41 · 45s" },
      { id: "wf-2", name: "Dispatch optimizer", status: "running", lastRunLabel: "09:40 · queued" },
      { id: "wf-3", name: "SLA monitor", status: "completed", lastRunLabel: "09:38 · 12s" },
      { id: "wf-4", name: "Inventory cross-check", status: "completed", lastRunLabel: "09:12 · 3m 01s" },
    ],
    aiSuggestion: "Automation: assign queue holding low-confidence matches; SLA monitor green except east cluster.",
  },
  actionsRail: {
    primaries: [],
    systemActions: [
      { id: "create_job", label: "Create job", variant: "primary" },
      { id: "ingest_document", label: "Ingest document", variant: "secondary" },
      { id: "execute_workflow", label: "Execute workflow", variant: "secondary" },
      { id: "run_report", label: "Run report", variant: "secondary" },
    ],
    quickOperations: [
      { id: "bulk_assign", label: "Bulk assign" },
      { id: "auto_assign", label: "Auto-assign" },
      { id: "notify_team", label: "Notify team" },
      { id: "export_queue", label: "Export queue" },
    ],
    smartSuggestions: [
      { id: "ai_assign_east", label: "Auto-assign east" },
      { id: "group_two_cleans", label: "Group 2 cleans" },
      { id: "escalate_deep_clean", label: "Escalate dispatch" },
    ],
    systemStatusLines: ["2 SLA breaches · steady load", "East coverage 78% · 90m"],
    overflow: [{ id: "lane_settings", label: "Lane settings" }],
  },
  contextRail: { groups: [] },
};

/** @deprecated use demoHomeServicesWorkUnitBase */
export const demoCleaningWorkUnitBase = demoHomeServicesWorkUnitBase;
