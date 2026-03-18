export type CommandCenterActivity = { id: string; text: string; time: string };
export type CommandCenterAlert = { id: string; text: string; severity: "attention" | "info" };
export type CommandCenterSuggestion = { id: string; text: string };

export type SystemActionItem = { id: string; label: string };
export type SystemActionGroup = { id: string; title: string; actions: SystemActionItem[] };

export const MOCK_COMMAND_CENTER_ACTIVITY: CommandCenterActivity[] = [
  { id: "1", text: "Dispatch run completed for 12 jobs", time: "3m ago" },
  { id: "2", text: "Billing agent flagged 2 exceptions", time: "18m ago" },
  { id: "3", text: "Customer success closed 3 cases", time: "42m ago" },
  { id: "4", text: "Scheduling optimization ran for Operations", time: "1h ago" },
];

export const MOCK_COMMAND_CENTER_ALERTS: CommandCenterAlert[] = [
  { id: "a1", text: "Finance: 2 invoices past due review", severity: "attention" },
  { id: "a2", text: "AI Systems: 1 document parse retry queued", severity: "info" },
];

/** Global system controls (not department-scoped). */
export const MOCK_SYSTEM_ACTION_GROUPS: SystemActionGroup[] = [
  {
    id: "system-actions",
    title: "System actions",
    actions: [
      { id: "sa-upload", label: "Upload document" },
      { id: "sa-doc", label: "Create document" },
      { id: "sa-record", label: "Create record" },
    ],
  },
  {
    id: "automations",
    title: "Automations",
    actions: [
      { id: "sa-auto", label: "Run automation" },
      { id: "sa-workflow", label: "Trigger workflow" },
    ],
  },
  {
    id: "system-tools",
    title: "System tools",
    actions: [
      { id: "sa-search", label: "Search system" },
      { id: "sa-exceptions", label: "Review exceptions" },
    ],
  },
];

export const MOCK_COMMAND_CENTER_SUGGESTIONS: CommandCenterSuggestion[] = [
  { id: "s1", text: "Review finance exceptions" },
  { id: "s2", text: "Optimize tomorrow’s dispatch window" },
  { id: "s3", text: "Check pipeline follow-ups in Sales" },
];
