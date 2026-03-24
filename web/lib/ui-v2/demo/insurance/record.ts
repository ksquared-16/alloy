import type { RecordWorkspaceModel } from "../../workspace-types";
import type { ContextRelationshipRawData } from "../../adapters/context-adapter";

export const demoInsuranceRecordContextRaw: ContextRelationshipRawData = {
  carriers_on_file: [
    { id: "car2", name: "Midwest General", status: "Commercial auto · admitted" },
    { id: "car1", name: "Coastal Mutual", status: "HO coastal" },
  ],
};

/**
 * Insurance — Policy renewal record (Rivera Garages CAU).
 */
export const demoInsuranceRecordBase: Omit<RecordWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  recordId: "policy-renewal-rivera",
  entityType: "Policy renewal",
  title: "Rivera Garages · CAU renewal",
  focusLabel: "Revenue / Retention · Expiring policies · Renewal",
  aiSummary: {
    headline: "Commercial auto renewal · Midwest General",
    aiAwarenessLine: "5d to expiry · dec page + payment auth missing · bind blocked.",
    bodyParagraphs: [
      "Signed dec page and ACH authorization are the only gates; carrier will bind same-day once both hit the inbox.",
    ],
    emphasisPhrases: ["5d to expiry", "bind blocked"],
  },
  signals: [
    {
      id: "ir-s1",
      severity: "critical",
      title: "Binder incomplete",
      actions: [{ id: "upload_dec", label: "Upload" }],
    },
    {
      id: "ir-s2",
      severity: "warning",
      title: "Payment auth missing",
      actions: [{ id: "request_auth", label: "Request" }],
    },
    {
      id: "ir-s3",
      severity: "info",
      title: "Loss runs on file",
      actions: [{ id: "view_docs", label: "View" }],
    },
  ],
  kpis: [
    { id: "irk1", label: "Days to expiry", value: "5", lane: "business", tone: "risk" },
    { id: "irk2", label: "Premium", value: "$42k", lane: "business" },
    { id: "irk3", label: "Bind prob.", value: "78", unit: "%", lane: "ai" },
    { id: "irk4", label: "Retention score", value: "0.81", lane: "ai" },
  ],
  recordSections: [
    {
      id: "renewal_state",
      title: "",
      lines: [
        { fieldLabel: "Policy", text: "#44821 · CAU renewal", tone: "primary" },
        { fieldLabel: "Expiry", text: "5d", tone: "primary" },
        { fieldLabel: "Premium", text: "$42k", tone: "default" },
        { fieldLabel: "Bind", text: "Blocked", tone: "primary" },
        { fieldLabel: "Blocker", text: "Dec + ACH missing", tone: "primary" },
        { fieldLabel: "Ready", text: "Loss runs · ACORD · terms issued", tone: "muted" },
        { fieldLabel: "Desk", text: "Midwest · 16:00 CT cutoff", tone: "muted" },
        { fieldLabel: "DEC", text: "Missing", tone: "primary" },
        { fieldLabel: "PAY", text: "Missing", tone: "primary" },
        { fieldLabel: "ACORD", text: "Signed · on file", tone: "muted" },
      ],
    },
    {
      id: "renewal_links",
      title: "",
      bodyBand: "connections",
      lines: [
        { fieldLabel: "Insured", text: "Rivera Garages LLC · 4 loc · CAU", tone: "default" },
        { fieldLabel: "Producer", text: "Jordan Lee", tone: "muted" },
        { fieldLabel: "Carrier", text: "Midwest General · admitted", tone: "default" },
      ],
    },
    {
      id: "renewal_hist",
      title: "",
      bodyBand: "history",
      lines: [],
      bullets: [
        "09:20 — Binder reminder (insured + producer)",
        "Yesterday — Renewal terms issued",
        "Mon — Loss runs ack (Midwest)",
      ],
    },
  ],
  recordContactContext: {
    name: "Rivera Garages · office mgr",
    address: "On file · authorized signer",
    preferredContact: "Email + SMS",
    lastContactAt: "09:20 · binder reminder",
    contactActions: [
      { id: "call", label: "Call" },
      { id: "text", label: "Text" },
      { id: "email", label: "Email" },
    ],
  },
  workSummary: {
    id: "wk-rec-rivera",
    title: "Record automation",
    progressLabel: "2 workflows",
    workflowMetrics: {
      avgRunTimeLabel: "3m 12s",
      successRateLabel: "94%",
      runsTodayLabel: "22",
      failuresTodayLabel: "0",
    },
    workflowRuns: [
      { id: "irw1", name: "Binder reminder", status: "running", lastRunLabel: "09:20" },
      { id: "irw2", name: "Document collector", status: "completed", lastRunLabel: "Yesterday" },
    ],
    aiSuggestion: "Upload dec + ACH in one producer session — Midwest bind desk closes at 16:00 CT.",
  },
  actionsRail: {
    primaries: [],
    recordDecisionAnchor: {
      status: "Pre-bind",
      risk: "High · 5d",
      nextAction: "Complete binder",
    },
    systemActions: [
      { id: "upload_dec", label: "Upload", variant: "primary" },
      { id: "request_auth", label: "Request", variant: "primary" },
    ],
    recordSecondaryActions: [
      { id: "nudge_carriers", label: "Notify", variant: "secondary" },
      { id: "add_note", label: "Add note", variant: "secondary" },
    ],
    recordTertiaryActions: [
      { id: "hold_renewal", label: "Hold renewal" },
      { id: "export_record", label: "Export record" },
      { id: "execute_workflow", label: "Run workflow" },
    ],
    smartSuggestions: [
      { id: "ai_draft_email", label: "Draft insured email" },
      { id: "ai_bind_checklist", label: "Show bind checklist" },
    ],
    systemStatusLines: ["Epic sync: OK", "Last edit: 09:20"],
  },
};
