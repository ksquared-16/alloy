import type { RecordWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

/** Record-tab context slice — merged with department demo raw on the workspace page */
export const demoHomeServicesRecordContextRaw: ContextRelationshipRawData = {
  record_customer: [
    {
      id: "cust-chen",
      name: "Chen household",
      account_ref: "C-ARC-7712",
      linked_entity: true,
    },
  ],
  record_route: [
    {
      id: "route-b7",
      name: "East · B7",
      coverage: "6 jobs · tight AM window",
      linked_entity: true,
    },
  ],
};

/**
 * Home Services — job record drilled from Operations → Unassigned jobs (Chen residence).
 */
export const demoHomeServicesRecordBase: Omit<RecordWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  recordId: "job-7712",
  entityType: "Job",
  title: "Chen residence",
  focusLabel: "Operations · Unassigned jobs · Job",
  aiSummary: {
    headline: "Chen residence · standard clean",
    aiAwarenessLine: "Assignment SLA breached · route fit low · window closing 12:00.",
    bodyParagraphs: [
      "Unassigned 2h+; customer prefers morning completion. Details in body sections below.",
    ],
    emphasisPhrases: ["SLA breached", "B7"],
  },
  signals: [
    {
      id: "rec-s1",
      severity: "critical",
      title: "Assignment SLA breached",
      actions: [{ id: "assign_now", label: "Assign" }],
    },
    {
      id: "rec-s2",
      severity: "warning",
      title: "2-person team required",
      actions: [{ id: "view_req", label: "Review" }],
    },
    {
      id: "rec-s3",
      severity: "warning",
      title: "Route fit low for auto-assign",
      actions: [{ id: "route_help", label: "Fix" }],
    },
  ],
  kpis: [
    { id: "rk1", label: "Wait", value: "2h 14m", lane: "business", tone: "risk" },
    { id: "rk2", label: "SLA", value: "Breached", lane: "business", tone: "risk" },
    { id: "rk3", label: "Route fit", value: "0.58", lane: "ai", tone: "risk" },
    { id: "rk4", label: "Confidence", value: "61", unit: "%", lane: "ai" },
  ],
  recordSections: [
    {
      id: "job_state",
      title: "",
      lines: [
        { fieldLabel: "Job", text: "#7712 · standard · priority", tone: "primary" },
        { fieldLabel: "Assign", text: "None · SLA breach", tone: "primary" },
        { fieldLabel: "Route", text: "East B7 · fit 0.58", linkId: "route-b7" },
        { fieldLabel: "Window", text: "10–12" },
        { fieldLabel: "Access", text: "Gate code on file", tone: "muted" },
        { fieldLabel: "Materials", text: "Eco-only · 2 crew", tone: "muted" },
        { fieldLabel: "Billing", text: "INV-884 · current · $180", linkId: "inv-884", rowKind: "document" },
      ],
    },
    {
      id: "job_links",
      title: "",
      bodyBand: "connections",
      lines: [
        { fieldLabel: "Customer", text: "Chen household · C-ARC-7712", linkId: "cust-chen" },
        { fieldLabel: "Site", text: "1842 Magnolia Ln" },
        { fieldLabel: "Cluster", text: "East B7 · tight AM", linkId: "route-b7" },
      ],
    },
    {
      id: "job_hist",
      title: "",
      bodyBand: "history",
      lines: [],
      bullets: [
        "09:18 — Auto-assign held (0.58)",
        "08:55 — Window confirmed (SMS)",
        "Yesterday — Series renewed",
      ],
    },
  ],
  recordContactContext: {
    name: "Chen household",
    address: "1842 Magnolia Ln",
    preferredContact: "SMS preferred · +1 ***-***-4401",
    lastContactAt: "08:55 · window confirmed (SMS)",
    contactActions: [
      { id: "call", label: "Call" },
      { id: "text", label: "Text" },
      { id: "email", label: "Email" },
    ],
  },
  workSummary: {
    id: "wk-rec-7712",
    title: "Record automation",
    progressLabel: "3 workflows",
    workflowMetrics: {
      avgRunTimeLabel: "38s",
      successRateLabel: "96%",
      runsTodayLabel: "18",
      failuresTodayLabel: "0",
    },
    workflowRuns: [
      { id: "rw1", name: "Dispatch assignment", status: "running", lastRunLabel: "09:40 · running" },
      { id: "rw2", name: "Customer notification", status: "completed", lastRunLabel: "08:55 · 12s" },
      { id: "rw3", name: "Billing sync", status: "completed", lastRunLabel: "Yesterday" },
    ],
    aiSuggestion: "Assign to nearest B7 cleaner with eco kit to clear SLA fastest.",
  },
  actionsRail: {
    primaries: [],
    recordDecisionAnchor: {
      status: "Unassigned",
      risk: "High · SLA breach",
      nextAction: "Assign cleaner",
    },
    systemActions: [
      { id: "assign_cleaner", label: "Assign cleaner", variant: "primary" },
      { id: "reschedule", label: "Reschedule", variant: "primary" },
    ],
    recordSecondaryActions: [
      { id: "contact_customer", label: "Contact customer", variant: "secondary" },
      { id: "reassign", label: "Reassign", variant: "secondary" },
      { id: "add_note", label: "Add note", variant: "secondary" },
      { id: "escalate", label: "Escalate", variant: "secondary" },
    ],
    recordTertiaryActions: [
      { id: "hold_job", label: "Hold job" },
      { id: "cancel_job", label: "Cancel job" },
      { id: "export_record", label: "Export record" },
      { id: "execute_workflow", label: "Run workflow" },
    ],
    smartSuggestions: [
      { id: "ai_best_cleaner", label: "Recommend cleaner" },
      { id: "ai_route_pair", label: "Suggest route pair" },
      { id: "ai_dispatch_escalate", label: "Escalate dispatcher" },
    ],
    systemStatusLines: ["Record locked: no", "Last edit: 09:18"],
  },
};

/** @deprecated use demoHomeServicesRecordContextRaw */
export const demoRecordContextRaw = demoHomeServicesRecordContextRaw;
/** @deprecated use demoHomeServicesRecordBase */
export const demoRecordBase = demoHomeServicesRecordBase;
