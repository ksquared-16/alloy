import type { WorkUnitWorkspaceModel } from "../../workspace-types";

/**
 * Childcare staffing — Rooms out of ratio lane (drill from Classroom staffing).
 */
export const demoChildcareWorkUnitBase: Omit<WorkUnitWorkspaceModel, "workspaceLevel"> = {
  workUnitId: "lane-rooms-out-of-ratio",
  laneKey: "rooms_out_of_ratio",
  focusLabel: "Classroom staffing · Rooms out of ratio",
  aiSummary: {
    headline: "Rooms out of ratio / at risk",
    aiAwarenessLine: "3 rooms · Lakeside Room B highest · float staging window closing.",
    bodyParagraphs: [
      "Room B Lakeside needs a licensed float before 15:15; Rooms C and infant wing are watch-only unless arrivals spike.",
    ],
    emphasisPhrases: ["Room B", "15:15"],
  },
  laneInterpretation: {
    laneStatusLine: "3 rooms · 1 hot · 2 floats",
    recommendedActionLine: "Stage → Room B",
  },
  signals: [
    {
      id: "cc-wu-s1",
      severity: "critical",
      title: "Room B · ratio threshold",
      actions: [{ id: "open_record", label: "Open" }],
    },
    {
      id: "cc-wu-s2",
      severity: "warning",
      title: "Infant wing · thin margin",
      actions: [{ id: "assign_float", label: "Assign" }],
    },
    {
      id: "cc-wu-s3",
      severity: "info",
      title: "Room C · watch",
      actions: [{ id: "notify_leads", label: "Notify" }],
    },
  ],
  kpis: [
    { id: "cc-wk1", label: "Rooms in lane", value: "3", lane: "business" },
    { id: "cc-wk2", label: "Licensed gap", value: "1", lane: "business" },
    { id: "cc-wk3", label: "Float pool", value: "2", lane: "business" },
    { id: "cc-wk4", label: "Forecast confidence", value: "89", unit: "%", lane: "ai" },
    { id: "cc-wk5", label: "Coverage score", value: "0.72", lane: "ai" },
    { id: "cc-wk6", label: "Compliance", value: "100", unit: "%", lane: "ai" },
  ],
  primaryQueue: {
    id: "queue-rooms-ratio",
    title: "Rooms out of ratio",
    countBadge: 3,
    sortCaption: "Risk ↓",
    workUnitGroupHeaders: {
      critical: { emoji: "🔴", label: "Over / imminently over" },
      warning: { emoji: "⚠️", label: "Thin margin" },
      watch: { label: "Watch" },
    },
    items: [
      {
        id: "room-b-lakeside",
        title: "Room B · 18 kids / 2 staff",
        subtitle: "Ratio risk · float due 15:15",
        groupKey: "critical",
        urgencyTier: "critical",
        waitStatus: "breached",
        quickActions: [],
      },
      {
        id: "room-infant-west",
        title: "Infant West · 8 kids / 2 staff",
        subtitle: "Thin margin · overlap 14:30",
        groupKey: "warning",
        urgencyTier: "warning",
        waitStatus: "approaching",
        quickActions: [],
      },
      {
        id: "room-c-river",
        title: "Room C · toddlers",
        subtitle: "Watch · stable",
        groupKey: "watch",
        urgencyTier: "standard",
        waitStatus: "safe",
        quickActions: [],
      },
    ],
  },
  workSummary: {
    id: "wk-lane-rooms",
    title: "Lane automation",
    progressLabel: "3 workflows",
    workflowMetrics: {
      avgRunTimeLabel: "42s",
      successRateLabel: "100%",
      runsTodayLabel: "56",
      failuresTodayLabel: "0",
    },
    workflowRuns: [
      { id: "cwf1", name: "Ratio guard — Lakeside", status: "running", lastRunLabel: "Live" },
      { id: "cwf2", name: "Float pool router", status: "running", lastRunLabel: "09:41" },
      { id: "cwf3", name: "Break backfill", status: "completed", lastRunLabel: "08:50" },
    ],
    aiSuggestion: "Workflows: ratio guard + float router running; break backfill completed this morning.",
  },
  actionsRail: {
    primaries: [],
    systemActions: [
      { id: "sys_create_shift", label: "Create shift need", variant: "primary" },
      { id: "ingest_document", label: "Ingest document", variant: "secondary" },
      { id: "execute_workflow", label: "Execute workflow", variant: "secondary" },
      { id: "run_report", label: "Run report", variant: "secondary" },
    ],
    quickOperations: [
      { id: "assign_float", label: "Assign" },
      { id: "notify_leads", label: "Notify" },
      { id: "export_lane", label: "Export lane" },
    ],
    smartSuggestions: [
      { id: "ai_float_room_b", label: "Recommend float · Room B" },
      { id: "ai_split_cohort", label: "Simulate split cohort" },
    ],
    systemStatusLines: ["Ratio guard live · Lakeside", "Pool: 2 licensed available"],
    overflow: [{ id: "lane_settings", label: "Lane settings" }],
  },
  contextRail: { groups: [] },
};
