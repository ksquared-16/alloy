"use client";

import { useState } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { ActionsVm, PrimaryActionVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

const PRIMARY_SOLID_CAP = 2;

type Props = {
  model: ActionsVm;
  onAction: WorkspaceActionHandler;
  title?: string;
  surface?: "default" | "department" | "company" | "work_unit" | "record";
};

function actionButtonClass(a: PrimaryActionVm) {
  return a.variant === "secondary" ? "adminv2-ws-actions-rail-secondary" : "adminv2-ws-actions-rail-primary";
}

/** Primary tier: at most `maxSolid` solid blues; remainder outlined. Secondary variant always outlined. */
function primaryTierButtonClass(a: PrimaryActionVm, solidUsed: { n: number }, maxSolid: number) {
  if (a.variant === "secondary") return "adminv2-ws-actions-rail-secondary";
  const wantsSolid = a.variant === "primary" || a.variant === undefined;
  if (wantsSolid && solidUsed.n < maxSolid) {
    solidUsed.n += 1;
    return "adminv2-ws-actions-rail-primary";
  }
  return "adminv2-ws-actions-rail-secondary";
}

/** Lower-priority actions — own section, collapsed by default (not inside operational / AI). */
function MoreActionsSection({ items, onAction }: { items: PrimaryActionVm[]; onAction: WorkspaceActionHandler }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <section className="adminv2-ws-command-section adminv2-ws-command-section--more-actions" aria-label="More actions">
      <button
        type="button"
        className="adminv2-ws-command-more-actions-trigger"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="adminv2-ws-command-more-actions-trigger-label">More actions</span>
        <span className="adminv2-ws-command-more-actions-trigger-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <ul className="adminv2-ws-command-row-list adminv2-ws-command-row-list--more-actions">
          {items.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="adminv2-ws-command-more-actions-row"
                onClick={() => onAction({ type: "actions.block", actionId: a.id })}
              >
                <span className="adminv2-ws-command-row-glyph" aria-hidden>
                  ›
                </span>
                <span className="adminv2-ws-command-more-actions-row-label">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** User-driven row actions inside a single card (demoted system + quick / record secondary). */
function OperationalActionsCard({
  actions,
  onAction,
  panelClassName,
}: {
  actions: PrimaryActionVm[];
  onAction: WorkspaceActionHandler;
  panelClassName?: string;
}) {
  if (actions.length === 0) return null;

  return (
    <section
      className={[
        "adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--operational",
        panelClassName,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Operational actions"
    >
      <h3 className="adminv2-ws-actions-rail-title">Operational actions</h3>
      <ul className="adminv2-ws-command-row-list adminv2-ws-command-row-list--operational">
        {actions.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className="adminv2-ws-command-operational-row"
              style={a.emphasized ? { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.45)" } : undefined}
              onClick={() => onAction({ type: "actions.block", actionId: a.id })}
            >
              <span className="adminv2-ws-command-row-glyph" aria-hidden>
                ›
              </span>
              <span className="adminv2-ws-command-operational-row-label">{a.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** AI suggestions — light section, not a card; distinct from operational rows. */
function AISuggestionsSection({
  actions,
  onAction,
  sectionClassName,
}: {
  actions: PrimaryActionVm[];
  onAction: WorkspaceActionHandler;
  sectionClassName?: string;
}) {
  if (actions.length === 0) return null;

  const sectionTitle = "AI suggestions";

  return (
    <section
      className={["adminv2-ws-command-section adminv2-ws-command-section--ai-suggestions", sectionClassName]
        .filter(Boolean)
        .join(" ")}
      aria-label={sectionTitle}
    >
      <h3 className="adminv2-ws-command-section-title adminv2-ws-command-section-title--ai">{sectionTitle}</h3>
      <ul className="adminv2-ws-command-row-list adminv2-ws-command-row-list--ai-suggestions">
        {actions.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className="adminv2-ws-command-ai-suggestion-row"
              style={a.emphasized ? { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.35)" } : undefined}
              onClick={() => onAction({ type: "actions.block", actionId: a.id })}
            >
              <span className="adminv2-ws-command-row-glyph adminv2-ws-command-row-glyph--ai" aria-hidden>
                ›
              </span>
              <span className="adminv2-ws-command-ai-suggestion-row-main">
                <span className="adminv2-ws-command-row-ai-badge" aria-label="AI suggested">
                  AI
                </span>
                <span className="adminv2-ws-command-ai-suggestion-row-label">{a.label}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrimaryActionsPanel({
  sectionTitle,
  actions,
  onAction,
  panelClassName,
  maxSolidButtons = PRIMARY_SOLID_CAP,
}: {
  sectionTitle: string;
  actions: PrimaryActionVm[];
  onAction: WorkspaceActionHandler;
  panelClassName?: string;
  /** Cap for solid primary styling; department/work_unit right rails pass all actions here. */
  maxSolidButtons?: number;
}) {
  const solidUsed = { n: 0 };
  return (
    <section
      className={["adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary", panelClassName]
        .filter(Boolean)
        .join(" ")}
      aria-label={sectionTitle}
    >
      <h3 className="adminv2-ws-actions-rail-title">{sectionTitle}</h3>
      <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={primaryTierButtonClass(a, solidUsed, maxSolidButtons)}
            style={a.emphasized ? { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.5)" } : undefined}
            onClick={() => onAction({ type: "actions.block", actionId: a.id })}
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function ActionsBlock({ model, onAction, title = "Actions", surface = "default" }: Props) {
  if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
    const sysFull = model.systemActions ?? [];
    /** Department / work_unit right rails: show every registry-configured system action in the primary band. */
    const uncappedRail = surface === "department" || surface === "work_unit";
    const primaryBand = uncappedRail ? sysFull : sysFull.slice(0, 2);
    const demotedSystemActions = uncappedRail ? [] : sysFull.slice(2);
    const maxSolidForPrimary = uncappedRail ? Math.max(primaryBand.length, 1) : PRIMARY_SOLID_CAP;
    const quick = model.quickOperations;
    const smart = model.smartSuggestions;
    const recSec = model.recordSecondaryActions?.length ?? 0;
    const recTer = model.recordTertiaryActions?.length ?? 0;
    const useRecordQuickTiers = surface === "record" && (recSec > 0 || recTer > 0);
    const moreItems: PrimaryActionVm[] = [
      ...(useRecordQuickTiers ? model.recordTertiaryActions ?? [] : []),
      ...(model.overflow ?? []),
    ];

    const baseSecondary = useRecordQuickTiers ? model.recordSecondaryActions ?? [] : quick ?? [];
    const operationalActions = [...demotedSystemActions, ...baseSecondary];
    const operationalN = operationalActions.length;
    const smartN = smart?.length ?? 0;
    const moreN = moreItems.length;
    const structuredN = primaryBand.length + operationalN + smartN + moreN;

    const hasStructured = structuredN > 0;

    const systemPanelTitle =
      surface === "record" ? "Primary actions" : "System operations";

    if (hasStructured) {
      const status = model.systemStatusLines?.filter((l) => l.trim()) ?? [];
      const anchor = surface === "record" ? model.recordDecisionAnchor : undefined;
      const hasAnchor =
        surface === "record" &&
        anchor &&
        Boolean(anchor.status?.trim() || anchor.risk?.trim() || anchor.nextAction?.trim());
      const showStatusStrip = status.length > 0;

      const recordOpClass = surface === "record" ? "adminv2-ws-command-section--record-operational" : undefined;
      const recordAiClass = surface === "record" ? "adminv2-ws-command-section--record-ai-suggestions" : undefined;

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
          {showStatusStrip ? (
            <div
              className={`adminv2-ws-dept-command-status${surface === "record" ? " adminv2-ws-dept-command-status--record" : ""}`}
              aria-label={surface === "record" ? "Record status" : "System status"}
            >
              {status.map((line, i) => (
                <div key={`${i}-${line.slice(0, 24)}`} className="adminv2-ws-dept-command-status-line">
                  {line}
                </div>
              ))}
            </div>
          ) : null}
          {primaryBand.length > 0 ? (
            <PrimaryActionsPanel
              sectionTitle={systemPanelTitle}
              actions={primaryBand}
              onAction={onAction}
              maxSolidButtons={maxSolidForPrimary}
              panelClassName={surface === "record" ? "adminv2-ws-actions-rail--record-primary-tier" : undefined}
            />
          ) : null}
          {operationalN > 0 ? (
            <OperationalActionsCard
              actions={operationalActions}
              onAction={onAction}
              panelClassName={recordOpClass}
            />
          ) : null}
          {smartN > 0 ? (
            <AISuggestionsSection actions={smart ?? []} onAction={onAction} sectionClassName={recordAiClass} />
          ) : null}
          {moreN > 0 ? <MoreActionsSection items={moreItems} onAction={onAction} /> : null}
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
        </div>
        {model.overflow && model.overflow.length > 0 ? (
          <MoreActionsSection items={model.overflow} onAction={onAction} />
        ) : null}
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
      {model.overflow && model.overflow.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <MoreActionsSection items={model.overflow} onAction={onAction} />
        </div>
      ) : null}
    </div>
  );
}
