"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { RecordWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, ContextBlock, ActionsBlock } from "../blocks";
import "../workspace.css";

type Props = {
  model: RecordWorkspaceModel;
  onAction: WorkspaceActionHandler;
};

/**
 * Level 4 record — context-dominant (scaffold).
 */
export default function RecordWorkspace({ model, onAction }: Props) {
  return (
    <div
      data-ws-surface="record"
      className="adminv2-ws-root adminv2-ws-record"
      style={{ background: "transparent", padding: 16, flex: 1, minHeight: 0 }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: derived.textSecondary }}>{model.entityType}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: neutral.textPrimary, margin: "4px 0 0" }}>{model.title}</h1>
        </div>
        <SignalBlock signals={model.signals} onAction={onAction} maxVisible={3} />
        <div style={{ marginTop: 12 }}>
          <ContextBlock model={model.context} onAction={onAction} />
        </div>
        {model.linkedRecordsHint && (
          <div style={{ fontSize: 12, color: derived.textSecondary, marginTop: 12 }}>{model.linkedRecordsHint}</div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <ActionsBlock model={model.actions} onAction={onAction} title="Record actions" />
      </div>
    </div>
  );
}
