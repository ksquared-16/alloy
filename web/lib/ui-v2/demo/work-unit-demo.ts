import type { WorkUnitWorkspaceModel } from "../workspace-types";

export const demoCleaningWorkUnitBase: Omit<WorkUnitWorkspaceModel, "workspaceLevel"> = {
  workUnitId: "job-8842",
  title: "Oak St — deep clean",
  stateLabel: "In progress",
  signals: [
    {
      id: "w-s1",
      severity: "warning",
      title: "Waiver missing",
      actions: [{ id: "upload_waiver", label: "Upload waiver" }],
    },
  ],
  work: {
    id: "wk-1",
    title: "Cleaning checklist",
    progressLabel: "5 of 9 complete",
    steps: [
      { id: "st1", label: "Kitchen", done: true },
      { id: "st2", label: "Bathrooms", done: true },
      { id: "st3", label: "Floors", done: false },
    ],
    aiSuggestion: "Suggest: finish bathrooms before floors (customer priority).",
  },
  actionsNearWork: {
    primaries: [
      { id: "message_customer", label: "Message customer", variant: "primary" },
      { id: "reschedule", label: "Reschedule", variant: "secondary" },
    ],
  },
  aiAssistantPlaceholder: "Draft customer update or suggest next cleaner…",
  contextPanel: { groups: [] }, // replaced when passing contextConfig + contextRaw to adapter
};
