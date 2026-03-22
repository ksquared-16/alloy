"use client";

import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";
import type { SignalVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

const severityAccent: Record<SignalVm["severity"], string> = {
  info: brand.primary,
  warning: semantic.warning,
  critical: semantic.warning,
};

type Props = {
  signals: SignalVm[];
  onAction: WorkspaceActionHandler;
  maxVisible?: number;
  /** Department workspace: elevated operational styling via workspace.css */
  surface?: "default" | "department";
};

export default function SignalBlock({ signals, onAction, maxVisible = 5, surface = "default" }: Props) {
  const visible = signals.slice(0, maxVisible);
  if (visible.length === 0) return null;

  if (surface === "department") {
    return (
      <div className="adminv2-ws-signal-strip adminv2-ws-band-signals">
        <div className="adminv2-ws-signal-cards">
          {visible.map((s) => (
            <div key={s.id} className="adminv2-ws-signal-card" data-severity={s.severity}>
              <div className="adminv2-ws-signal-card-row">
                <div className="adminv2-ws-signal-card-main">
                  <div className="adminv2-ws-signal-label">Signal</div>
                  <div className="adminv2-ws-signal-title">{s.title}</div>
                  {s.description && <div className="adminv2-ws-signal-desc">{s.description}</div>}
                  {s.aiExplanation?.trim() ? (
                    <div className="adminv2-ws-signal-ai">{s.aiExplanation.trim()}</div>
                  ) : null}
                </div>
                <div className="adminv2-ws-signal-actions">
                  {s.actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onAction({ type: "signal.action", signalId: s.id, actionId: a.id })}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="adminv2-ws-band-signals" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {visible.map((s) => (
          <div
            key={s.id}
            className="adminv2-ws-zone"
            style={{
              flex: "1 1 280px",
              maxWidth: 420,
              padding: "10px 12px",
              borderLeft: `3px solid ${severityAccent[s.severity]}`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: derived.textSecondary, marginBottom: 4 }}>
              Signal
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: neutral.textPrimary, marginBottom: 4 }}>
              {s.title}
            </div>
            {s.description && (
              <div style={{ fontSize: 12, color: derived.textSecondary, marginBottom: 6, lineHeight: 1.4 }}>
                {s.description}
              </div>
            )}
            {s.aiExplanation && (
              <div
                style={{
                  fontSize: 11,
                  color: brand.secondary,
                  fontStyle: "italic",
                  marginBottom: 8,
                  lineHeight: 1.35,
                }}
              >
                {s.aiExplanation}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAction({ type: "signal.action", signalId: s.id, actionId: a.id })}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: `1px solid ${derived.border}`,
                    background: brand.primary,
                    color: neutral.surface,
                    cursor: "pointer",
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
