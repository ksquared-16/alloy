import type { RecordWorkspaceModel } from "../workspace-types";

export const demoRecordBase: Omit<RecordWorkspaceModel, "workspaceLevel" | "context"> = {
  recordId: "record-cust-4401",
  entityType: "customer",
  title: "Rivera household",
  signals: [
    {
      id: "rs1",
      severity: "info",
      title: "Preferred contact: SMS",
      actions: [{ id: "open_prefs", label: "Open preferences" }],
    },
  ],
  actions: {
    primaries: [
      { id: "edit_record", label: "Edit", variant: "primary" },
      { id: "message", label: "Message", variant: "secondary" },
    ],
  },
  linkedRecordsHint: "Linked jobs and invoices open from the main admin app when wired.",
};
