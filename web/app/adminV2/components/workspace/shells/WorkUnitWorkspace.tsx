"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, WorkBlock, ContextBlock, ActionsBlock } from "../blocks";
import "../workspace.css";

type Props = {
  model: WorkUnitWorkspaceModel;
  onAction: WorkspaceActionHandler;
};

/**
 * Level 3 work unit — work-dominant (scaffold: wire full execution cockpit when API exists).
 */
export default function WorkUnitWorkspace({ model, onAction }: Props) {
  return (
    <div
      data-ws-surface="work-unit"
      className="adminv2-ws-root"
      style={{ background: "transparent", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <div className="adminv2-ws-wu-signals" style={{ borderBottom: `1px solid ${derived.border}` }}>
        {model.stateLabel && (
          <div style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, color: derived.textSecondary }}>
            State: <span style={{ color: neutral.textPrimary }}>{model.stateLabel}</span>
          </div>
        )}
        <SignalBlock signals={model.signals} onAction={onAction} maxVisible={4} />
      </div>

      <div className="adminv2-ws-work-unit" style={{ padding: 16, flex: 1, minHeight: 0 }}>
        <div className="adminv2-ws-wu-work">
          <WorkBlock work={model.work} onAction={onAction} mode="full" />
        </div>
        <div className="adminv2-ws-wu-context">
          <ContextBlock model={model.contextPanel} onAction={onAction} />
        </div>
        <div className="adminv2-ws-wu-actions">
          <ActionsBlock model={model.actionsNearWork} onAction={onAction} title="Next actions" />
        </div>
        <div
          className="adminv2-ws-wu-ai adminv2-ws-zone"
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${derived.border}`,
            marginTop: 8,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: brand.secondary, marginBottom: 6 }}>Assistant</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const text = String(fd.get("q") ?? "").trim();
              if (text) onAction({ type: "ai.assistant.submit", text });
              e.currentTarget.reset();
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              name="q"
              placeholder={model.aiAssistantPlaceholder ?? "Ask about this work unit…"}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${derived.border}`,
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: brand.primary,
                color: neutral.surface,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
