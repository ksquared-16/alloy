import type { RecordWorkspaceModel } from "../workspace-types";

/**
 * Home cleaning — job record drilled from Operations → Unassigned jobs (Chen residence).
 */
export const demoRecordBase: Omit<RecordWorkspaceModel, "workspaceLevel" | "contextRail"> = {
  recordId: "job-7712",
  entityType: "Job",
  title: "Chen residence",
  focusLabel: "Operations · Unassigned jobs · Job",
  aiSummary: {
    headline: "Chen residence · standard clean",
    aiAwarenessLine: "Assignment SLA breached · route fit low · window closing 12:00.",
    bodyParagraphs: [
      "Standard clean on east cluster B7; unassigned 2h+; customer prefers morning completion.",
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
      actions: [{ id: "view_req", label: "Reqs" }],
    },
    {
      id: "rec-s3",
      severity: "warning",
      title: "Route fit low for auto-assign",
      actions: [{ id: "route_help", label: "Route" }],
    },
  ],
  kpis: [
    { id: "rk1", label: "Wait", value: "2h 14m", lane: "business" },
    { id: "rk2", label: "SLA", value: "Breached", lane: "business" },
    { id: "rk3", label: "Route fit", value: "0.58", lane: "ai" },
    { id: "rk4", label: "Confidence", value: "61", unit: "%", lane: "ai" },
  ],
  recordSections: [
    {
      id: "overview",
      title: "Overview",
      rows: [
        { label: "Job", value: "#7712 · standard clean" },
        { label: "Status", value: "Unassigned · east cluster" },
        { label: "Priority", value: "High · SLA risk" },
      ],
    },
    {
      id: "scheduling",
      title: "Scheduling / assignment",
      rows: [
        { label: "Window", value: "10:00–12:00 (customer)" },
        { label: "Assigned", value: "—" },
        { label: "Route cluster", value: "East · B7" },
        { label: "Suggested pair", value: "Torres B4 loop (optional)" },
      ],
    },
    {
      id: "customer",
      title: "Customer / location",
      rows: [
        { label: "Customer", value: "Chen household" },
        { label: "Address", value: "1842 Magnolia Ln" },
        { label: "Access", value: "Gate code on file" },
        { label: "Contact", value: "SMS preferred · +1 ***-***-4401" },
      ],
    },
    {
      id: "financial",
      title: "Financial / value",
      rows: [
        { label: "Job value", value: "$180" },
        { label: "Billing", value: "Recurring monthly" },
        { label: "Add-ons", value: "None" },
      ],
    },
    {
      id: "requirements",
      title: "Requirements / tags",
      rows: [
        { label: "Tags", value: "Standard · recurring · high priority" },
        { label: "Special", value: "Eco products only" },
      ],
    },
    {
      id: "notes",
      title: "Notes / recent activity",
      rows: [],
      bullets: [
        "09:18 — Auto-assign held (route fit 0.58)",
        "08:55 — Customer confirmed 10:00 window",
        "Yesterday — Recurring series renewed",
      ],
    },
  ],
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
    systemActions: [
      { id: "assign_cleaner", label: "Assign cleaner", variant: "primary" },
      { id: "reschedule", label: "Reschedule", variant: "secondary" },
      { id: "contact_customer", label: "Contact customer", variant: "secondary" },
    ],
    quickOperations: [
      { id: "reassign", label: "Reassign", variant: "secondary" },
      { id: "escalate", label: "Escalate", variant: "secondary" },
      { id: "add_note", label: "Add note", variant: "secondary" },
      { id: "hold_job", label: "Hold job", variant: "secondary" },
      { id: "cancel_job", label: "Cancel job", variant: "secondary" },
      { id: "export_record", label: "Export record", variant: "secondary" },
      { id: "execute_workflow", label: "Run workflow", variant: "secondary" },
    ],
    smartSuggestions: [
      { id: "ai_best_cleaner", label: "Recommend cleaner" },
      { id: "ai_route_pair", label: "Suggest route pair" },
      { id: "ai_dispatch_escalate", label: "Escalate dispatcher" },
    ],
    systemStatusLines: ["Record locked: no", "Last edit: 09:18"],
  },
};
