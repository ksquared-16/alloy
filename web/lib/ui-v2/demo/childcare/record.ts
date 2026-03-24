import type { RecordWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

export const demoChildcareRecordContextRaw: ContextRelationshipRawData = {
  guardians: [{ id: "g-lead-b", name: "Riley Park", phone: "555-0144" }],
  room_roster: [
    { id: "ch-m1", name: "Morgan P.", notes: "Nut allergy" },
    { id: "ch-j1", name: "Jamie Q.", notes: "" },
  ],
};

/**
 * Childcare — Classroom / room record (Room B · Lakeside).
 */
export const demoChildcareRecordBase: Omit<RecordWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  recordId: "room-b-lakeside",
  entityType: "Classroom",
  title: "Room B · Lakeside",
  focusLabel: "Classroom staffing · Rooms out of ratio · Room",
  aiSummary: {
    headline: "Preschool room · ratio coverage",
    aiAwarenessLine: "18 enrolled · 2 licensed · float needed by 15:15.",
    bodyParagraphs: [
      "Afternoon block drives the tightest margin; pickup wave starts 16:30 — staging a float now avoids a split cohort decision.",
    ],
    emphasisPhrases: ["15:15", "float"],
  },
  signals: [
    {
      id: "cc-r-s1",
      severity: "critical",
      title: "Ratio threshold approaching",
      actions: [{ id: "assign_float", label: "Assign" }],
    },
    {
      id: "cc-r-s2",
      severity: "info",
      title: "Lead: Riley K. on floor",
      actions: [{ id: "notify_leads", label: "Notify" }],
    },
    {
      id: "cc-r-s3",
      severity: "warning",
      title: "1 nut-allergy child present",
      actions: [{ id: "open_med_log", label: "Review" }],
    },
  ],
  kpis: [
    { id: "cc-rk1", label: "Children", value: "18", lane: "business" },
    { id: "cc-rk2", label: "Licensed staff", value: "2", lane: "business" },
    { id: "cc-rk3", label: "Headroom", value: "12", unit: "%", lane: "ai", tone: "risk" },
    { id: "cc-rk4", label: "Compliance", value: "100", unit: "%", lane: "ai" },
  ],
  recordSections: [
    {
      id: "room_state",
      title: "",
      lines: [
        { fieldLabel: "Room", text: "B · Lakeside · preschool", tone: "primary" },
        { fieldLabel: "Present", text: "18 / 18 rostered", tone: "primary" },
        { fieldLabel: "Staff", text: "Riley K. + Alex M. · 2 licensed", tone: "default" },
        { fieldLabel: "Ratio", text: "1:10 · ~12% headroom to pickup", tone: "default" },
        { fieldLabel: "Float", text: "Not staged · due 15:15", tone: "primary" },
        { fieldLabel: "Flags", text: "Nut ×1 · IEP ×1 · no incidents", tone: "muted" },
      ],
    },
    {
      id: "room_links",
      title: "",
      bodyBand: "connections",
      lines: [
        { fieldLabel: "Guardian", text: "Riley Park · primary", tone: "default" },
        { fieldLabel: "Roster", text: "Morgan P. · Jamie Q.", tone: "muted" },
        { fieldLabel: "Site", text: "Lakeside · Room B · pool dispatch", tone: "muted" },
      ],
    },
    {
      id: "room_hist",
      title: "",
      bodyBand: "history",
      lines: [],
      bullets: [
        "09:10 — Ratio guard tick · margin OK",
        "08:40 — Morning float released to pool",
        "Yesterday — Fire drill logged",
      ],
    },
  ],
  recordContactContext: {
    name: "Lakeside front desk",
    address: "Room B intercom + pool dispatch",
    preferredContact: "Internal · staffing channel",
    lastContactAt: "09:10 · ratio tick",
    contactActions: [
      { id: "call", label: "Call" },
      { id: "text", label: "Text" },
      { id: "email", label: "Email" },
    ],
  },
  workSummary: {
    id: "wk-rec-room-b",
    title: "Record automation",
    progressLabel: "2 workflows",
    workflowMetrics: {
      avgRunTimeLabel: "18s",
      successRateLabel: "100%",
      runsTodayLabel: "24",
      failuresTodayLabel: "0",
    },
    workflowRuns: [
      { id: "crw1", name: "Ratio guard — Room B", status: "running", lastRunLabel: "Live" },
      { id: "crw2", name: "Float staging suggest", status: "completed", lastRunLabel: "09:02" },
    ],
    aiSuggestion: "Assign Riley (North pool) — ETA 12m, licensed preschool.",
  },
  actionsRail: {
    primaries: [],
    recordDecisionAnchor: {
      status: "At risk",
      risk: "High · 45m",
      nextAction: "Stage float",
    },
    systemActions: [
      { id: "assign_float", label: "Assign", variant: "primary" },
      { id: "notify_leads", label: "Notify", variant: "primary" },
    ],
    recordSecondaryActions: [
      { id: "open_med_log", label: "Review", variant: "secondary" },
      { id: "add_note", label: "Add note", variant: "secondary" },
    ],
    recordTertiaryActions: [
      { id: "merge_room", label: "Merge cohort" },
      { id: "export_record", label: "Export record" },
      { id: "execute_workflow", label: "Run workflow" },
    ],
    smartSuggestions: [
      { id: "ai_float", label: "Recommend float" },
      { id: "ai_split", label: "Simulate split" },
    ],
    systemStatusLines: ["Record locked: no", "Last edit: 09:10"],
  },
};
