"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { ActionsVm, PrimaryActionVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  model: ActionsVm;
  onAction: WorkspaceActionHandler;
  title?: string;
  surface?: "default" | "department" | "company" | "work_unit" | "record";
};

function actionButtonClass(a: PrimaryActionVm) {
  return a.variant === "secondary" ? "adminv2-ws-actions-rail-secondary" : "adminv2-ws-actions-rail-primary";
}

function DepartmentActionPanel({
  sectionTitle,
  actions,
  onAction,
  listVariant,
}: {
  sectionTitle: string;
  actions: PrimaryActionVm[];
  onAction: WorkspaceActionHandler;
  listVariant?: "column";
}) {
  return (
    <div className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel">
      <div className="adminv2-ws-actions-rail-title">{sectionTitle}</div>
      <div
        className={`adminv2-ws-actions-rail-list${listVariant === "column" ? " adminv2-ws-actions-rail-list--column" : ""}`}
      >
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={actionButtonClass(a)}
            style={a.emphasized ? { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.5)" } : undefined}
            onClick={() => onAction({ type: "actions.block", actionId: a.id })}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DepartmentSmartSuggestionsPanel({
  actions,
  onAction,
}: {
  actions: PrimaryActionVm[];
  onAction: WorkspaceActionHandler;
}) {
  return (
    <div className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel">
      <div className="adminv2-ws-actions-rail-title">AI actions</div>
      <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="adminv2-ws-actions-rail-suggestion"
            onClick={() => onAction({ type: "actions.block", actionId: a.id })}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ActionsBlock({ model, onAction, title = "Actions", surface = "default" }: Props) {
  if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
    const sys = model.systemActions;
    const quick = model.quickOperations;
    const smart = model.smartSuggestions;
    const hasStructured =
      (sys?.length ?? 0) + (quick?.length ?? 0) + (smart?.length ?? 0) > 0;

    const systemPanelTitle =
      surface === "record" ? "Primary actions" : "System operations";
    const quickPanelTitle =
      surface === "record" ? "Operational actions" : "Quick operations";

    if (hasStructured) {
      const status = model.systemStatusLines?.filter((l) => l.trim()) ?? [];
      const anchor = surface === "record" ? model.recordDecisionAnchor : undefined;
      const hasAnchor =
        surface === "record" &&
        anchor &&
        Boolean(anchor.status?.trim() || anchor.risk?.trim() || anchor.nextAction?.trim());
      const statusFirst = surface !== "record" && status.length > 0;
      const statusMetaEnd = surface === "record" && status.length > 0;

      return (
        <div className="adminv2-ws-dept-command-actions-stack">
          {hasAnchor && anchor ? (
            <div className="adminv2-ws-record-decision-anchor" aria-label="Record state">
              {anchor.status?.trim() ? (
                <div className="adminv2-ws-record-decision-anchor-row">
                  <span className="adminv2-ws-record-decision-anchor-k">Status</span>
                  <span className="adminv2-ws-record-decision-anchor-v">{anchor.status.trim()}</span>
                </div>
              ) : null}
              {anchor.risk?.trim() ? (
                <div className="adminv2-ws-record-decision-anchor-row adminv2-ws-record-decision-anchor-row--risk">
                  <span className="adminv2-ws-record-decision-anchor-k">Risk</span>
                  <span className="adminv2-ws-record-decision-anchor-v">{anchor.risk.trim()}</span>
                </div>
              ) : null}
              {anchor.nextAction?.trim() ? (
                <div className="adminv2-ws-record-decision-anchor-row">
                  <span className="adminv2-ws-record-decision-anchor-k">Next action</span>
                  <span className="adminv2-ws-record-decision-anchor-v">{anchor.nextAction.trim()}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {statusFirst ? (
            <div className="adminv2-ws-dept-command-status" aria-label="System status">
              {status.map((line, i) => (
                <div key={`${i}-${line.slice(0, 24)}`} className="adminv2-ws-dept-command-status-line">
                  {line}
                </div>
              ))}
            </div>
          ) : null}
          {sys && sys.length > 0 ? (
            <DepartmentActionPanel
              sectionTitle={systemPanelTitle}
              actions={sys}
              onAction={onAction}
              listVariant="column"
            />
          ) : null}
          {quick && quick.length > 0 ? (
            <DepartmentActionPanel
              sectionTitle={quickPanelTitle}
              actions={quick}
              onAction={onAction}
              listVariant="column"
            />
          ) : null}
          {smart && smart.length > 0 ? (
            <DepartmentSmartSuggestionsPanel actions={smart} onAction={onAction} />
          ) : null}
          {model.overflow && model.overflow.length > 0 ? (
            <div className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel">
              <div className="adminv2-ws-actions-rail-title">More</div>
              <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column adminv2-ws-actions-rail-list--text">
                {model.overflow.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="adminv2-ws-actions-rail-overflow-btn"
                    onClick={() => onAction({ type: "actions.block", actionId: a.id })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {statusMetaEnd ? (
            <div
              className="adminv2-ws-dept-command-status adminv2-ws-dept-command-status--meta"
              aria-label="Record metadata"
            >
              {status.map((line, i) => (
                <div key={`${i}-${line.slice(0, 24)}`} className="adminv2-ws-dept-command-status-line">
                  {line}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="adminv2-ws-dept-command-actions-stack">
        <div className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel">
          <div className="adminv2-ws-actions-rail-title">{title}</div>
        <div className="adminv2-ws-actions-rail-list">
          {model.primaries.map((a) => (
            <button
              key={a.id}
              type="button"
              className={actionButtonClass(a)}
              style={a.emphasized ? { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.5)" } : undefined}
              onClick={() => onAction({ type: "actions.block", actionId: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
        {model.overflow && model.overflow.length > 0 && (
          <div className="adminv2-ws-actions-rail-overflow">
            <div className="adminv2-ws-actions-rail-overflow-label">More</div>
            {model.overflow.map((a) => (
              <button key={a.id} type="button" onClick={() => onAction({ type: "actions.block", actionId: a.id })}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>
    );
  }

  return (
    <div className="adminv2-ws-zone" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: derived.textSecondary, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {model.primaries.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction({ type: "actions.block", actionId: a.id })}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${derived.border}`,
              background: a.variant === "secondary" ? "transparent" : brand.primary,
              color: a.variant === "secondary" ? brand.primary : neutral.surface,
              cursor: "pointer",
              outline: a.emphasized ? `2px solid ${brand.secondary}` : undefined,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {model.overflow && model.overflow.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${derived.border}` }}>
          <div style={{ fontSize: 10, color: derived.textSecondary, marginBottom: 6 }}>More</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {model.overflow.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onAction({ type: "actions.block", actionId: a.id })}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 0",
                  background: "none",
                  border: "none",
                  color: brand.primary,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
