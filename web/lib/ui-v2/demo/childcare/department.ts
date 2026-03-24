import type { DepartmentWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

/** Childcare — Classroom staffing (drill → rooms out of ratio work unit). */
export const demoChildcareDepartmentModelBase: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  departmentId: "dept-childcare-staffing",
  departmentLabel: "Classroom staffing",
  aiSummary: {
    headline: "Classroom staffing · ratio coverage + float pool",
    aiAwarenessLine: "Live model — 3 rooms watch · float pool 2 deep (4 requests open)",
    bodyParagraphs: [
      "Lakeside afternoon block is the tightest coupling: Room B is forecasted against ratio margin by 15:45 unless a licensed float is staged from the network pool.",
      "Break coverage and sick calls are light today, but the float request queue still has four open pins across two campuses.",
      "Subsidy and check-in lanes are stable — staffing is the dominant intervention path for the next 4 hours.",
    ],
    emphasisPhrases: ["Lakeside", "Room B"],
  },
  signals: [
    {
      id: "sig-ratio-dept",
      severity: "warning",
      title: "Room B · ratio in 90m",
      description: "Lakeside",
      aiExplanation: "Forecast breach ~15:45 without float.",
      actions: [{ id: "open_ratio_lane", label: "Open" }],
    },
    {
      id: "sig-float",
      severity: "info",
      title: "4 float requests open",
      aiExplanation: "Cross-campus pool · 2 licensed available.",
      actions: [{ id: "assign_float", label: "Assign" }],
    },
    {
      id: "sig-break",
      severity: "info",
      title: "2 break coverage gaps",
      aiExplanation: "Post-lunch block · west wing.",
      actions: [{ id: "open_break_queue", label: "Open" }],
    },
  ],
  kpis: [
    { id: "k1", label: "Staff fill (network)", value: "94", unit: "%", lane: "business" },
    { id: "k2", label: "Rooms in ratio", value: "28", lane: "business" },
    { id: "k3b", label: "Float pool depth", value: "2", lane: "business" },
    {
      id: "k3a",
      label: "Coverage forecast",
      value: "91",
      unit: "%",
      lane: "ai",
      aiSummary: "Through 17:00",
    },
    {
      id: "k-p2",
      label: "Next peak window",
      value: "15:30",
      lane: "ai",
    },
    {
      id: "k-p3",
      label: "Utilization score",
      value: "88",
      unit: "%",
      lane: "ai",
    },
  ],
  primaryQueue: {
    id: "q-classroom-staffing",
    title: "Classroom staffing",
    countBadge: 7,
    items: [],
    rollupSummary: "Staffing throughput by situation — drill into rooms approaching ratio limits.",
    rollupGroups: [
      {
        id: "st-t-ratio",
        label: "Rooms out of ratio / at risk",
        count: 3,
        descriptor: "Licensed headcount vs. children present trending toward threshold.",
      },
      {
        id: "st-t-float",
        label: "Float requests",
        count: 2,
        descriptor: "Open pins waiting for a licensed teacher from the pool.",
      },
      {
        id: "st-t-break",
        label: "Break & coverage gaps",
        count: 2,
        descriptor: "Meal and break windows without backfill assigned.",
      },
    ],
    rollupExamples: [{ id: "st-ex1", label: "e.g. Lakeside · Room B · afternoon block" }],
    viewAllActionId: "open_rooms_lane",
    viewAllLabel: "Open rooms out of ratio →",
    drillWorkUnitKey: "rooms_out_of_ratio",
  },
  secondaryQueue: {
    id: "q-staffing-exceptions",
    title: "Scheduling exceptions",
    countBadge: 3,
    items: [],
    rollupSummary: "Call-outs, licensing expirations, and training holds.",
    rollupGroups: [
      {
        id: "st-a-call",
        label: "Call-outs today",
        count: 1,
        descriptor: "Sick or no-show staff needing substitute routing.",
      },
      {
        id: "st-a-lic",
        label: "License / clock hours",
        count: 1,
        descriptor: "Credentials expiring or training not logged.",
      },
      {
        id: "st-a-train",
        label: "Orientation holds",
        count: 1,
        descriptor: "New hires not yet cleared for solo coverage.",
      },
    ],
    viewAllActionId: "open_exceptions",
    viewAllLabel: "Open rollup →",
  },
  workSummary: {
    id: "ws-staffing-flows",
    title: "",
    progressLabel: "5 live · staffing router",
    workflowMetrics: {
      avgRunTimeLabel: "1m 28s",
      successRateLabel: "99.4%",
      runsTodayLabel: "112",
      failuresTodayLabel: "0",
    },
    workflowRuns: [
      {
        id: "sw1",
        name: "Float pool router",
        status: "running",
        lastRunLabel: "09:44 · in progress",
      },
      {
        id: "sw2",
        name: "Ratio guard — Lakeside",
        status: "running",
        lastRunLabel: "Live · 15:15 tick",
      },
      {
        id: "sw3",
        name: "Break coverage sweep",
        status: "completed",
        lastRunLabel: "08:55 · 42s",
      },
    ],
    aiSuggestion:
      "Observation — staging Riley (licensed) from North pool clears Room B risk with lowest travel time.",
  },
  actionsRail: {
    primaries: [],
    systemStatusLines: ["Automation active: float pool router", "Queue load: elevated · Lakeside"],
    systemActions: [
      { id: "sys_create_shift", label: "Create shift need", variant: "primary" },
      { id: "sys_upload_document", label: "Ingest credential doc", variant: "secondary" },
      { id: "sys_run_staffing_report", label: "Execute staffing report", variant: "secondary" },
      { id: "sys_trigger_float_router", label: "Execute float router", variant: "secondary" },
    ],
    quickOperations: [
      { id: "assign_float", label: "Assign", variant: "primary" },
      { id: "notify_leads", label: "Notify", variant: "secondary" },
      { id: "export_staffing", label: "Export staffing sheet", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "smart_stage_float_b", label: "Stage float → Room B · Lakeside" },
      { id: "smart_clear_requests", label: "Clear 2 float requests" },
      { id: "smart_break_west", label: "Backfill west wing break" },
    ],
  },
  latentWorkObjectQueues: [
    { id: "latent-st-ratio", title: "Rooms out of ratio", countBadge: 3, items: [] },
    { id: "latent-st-float", title: "Float requests", countBadge: 2, items: [] },
    { id: "latent-st-parent", title: "Parent messages", countBadge: 0, items: [] },
  ],
};

export const demoChildcareDepartmentContextRaw: ContextRelationshipRawData = {
  guardians: [
    { id: "g1", name: "Taylor Chen", phone: "555-0201" },
  ],
  room_roster: [
    { id: "ch1", name: "Morgan P.", notes: "Nut allergy" },
    { id: "ch2", name: "Jamie Q.", notes: "" },
  ],
};

/** @deprecated use demoChildcareDepartmentContextRaw */
export const demoChildcareContextRaw = demoChildcareDepartmentContextRaw;
