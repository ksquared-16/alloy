"use client";

import type { CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { DepartmentWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, KPIBlock, QueueBlock, WorkBlock, ContextBlock, ActionsBlock } from "../blocks";
import "../workspace.css";

type Props = {
  model: DepartmentWorkspaceModel;
  onAction: WorkspaceActionHandler;
};

/**
 * Department workspace — scoped tokens for compression + ambient (AdminV2 river stone / KPI / field washes).
 * No dark chamber; panels use soft deck + rail washes from derived tokens.
 */
const deptRootStyle: CSSProperties = {
  backgroundColor: "transparent",
  color: neutral.textPrimary,
  ["--d-page-bg" as string]: neutral.background,
  ["--d-border" as string]: derived.border,
  ["--d-muted" as string]: derived.textSecondary,
  ["--d-surface" as string]: neutral.surface,
  ["--d-brand" as string]: brand.primary,
  ["--d-pine" as string]: brand.secondary,
  ["--d-top-wash" as string]: derived.kpiRailWash,
  ["--d-panel" as string]: derived.chromeDeckBg,
  ["--d-panel-quiet" as string]: derived.inspectorCommandRailWash,
  ["--d-rail" as string]: derived.inspectorCommandRail,
  ["--d-field-veil" as string]: derived.canvasFieldWash,
  ["--d-ambient-core" as string]: derived.ambientLifeBloomMid,
  ["--d-kpi-tint" as string]: derived.kpiBandBusinessLight,
  ["--d-kpi-ai-tint" as string]: derived.kpiBandAiLight,
  ["--d-summary-wash" as string]: derived.maskOverlay,
  ["--d-boundary-inset" as string]: derived.adminV2BoundaryAmberInset,
  /** KPIBand / inspector grammar (main AdminV2 shell) */
  ["--d-kpi-band-shadow" as string]: derived.kpiBandShadow,
  ["--d-admin-amber" as string]: derived.adminV2BoundaryAmber,
  ["--d-rail-hairline" as string]: derived.inspectorCommandHairline,
  ["--d-rail-sep" as string]: derived.inspectorChamberSeparation,
  ["--d-ambient-edge" as string]: derived.ambientLifeBloomEdge,
  ["--d-field-depth" as string]: derived.canvasFieldDepth,
  ["--d-card-shadow" as string]: derived.cardShadow,
};

/**
 * Page split: primary column (~75%) = control deck → operational + workflows;
 * command column (~25%) = full-height system rail aligned to top.
 */
export default function DepartmentWorkspace({ model, onAction }: Props) {
  const briefParagraphs =
    model.aiSummary?.bodyParagraphs?.filter((p) => p.trim()) ??
    (model.aiSummary?.body?.trim() ? [model.aiSummary.body.trim()] : []);
  const fullBriefTooltip = briefParagraphs.join("\n\n");
  const hasBrief =
    Boolean(model.aiSummary?.headline?.trim()) || Boolean(fullBriefTooltip);
  const awarenessLine = model.aiSummary?.aiAwarenessLine?.trim() ?? "";
  const hasAwareness = Boolean(awarenessLine);
  const hasSignals = model.signals.length > 0;
  const hasKpis = model.kpis.length > 0;
  const hasTopStack = hasBrief || hasSignals || hasAwareness;
  const hasControlDeck = hasTopStack || hasKpis;

  return (
    <div
      data-ws-surface="department"
      className="adminv2-ws-root adminv2-ws-department adminv2-ws-dept-v2"
      style={deptRootStyle}
    >
      <div className="adminv2-ws-dept-v2-contain">
        <div className="adminv2-ws-dept-v2-page-split">
          <div className="adminv2-ws-dept-v2-primary-column">
            {hasControlDeck ? (
              <div className="adminv2-ws-dept-v2-control-deck">
                {hasTopStack ? (
                  <div className="adminv2-ws-dept-v2-top-stack">
                    {hasBrief ? (
                      <div className="adminv2-ws-dept-v2-brief">
                        <div className="adminv2-ws-dept-v2-brief-focus-label">Today&apos;s focus</div>
                        <div className="adminv2-ws-dept-v2-brief-head-row">
                          {model.aiSummary?.headline?.trim() ? (
                            <h2 className="adminv2-ws-dept-v2-brief-headline">{model.aiSummary.headline.trim()}</h2>
                          ) : (
                            <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                              Awaiting focus summary
                            </h2>
                          )}
                          {fullBriefTooltip ? (
                            <button
                              type="button"
                              className="adminv2-ws-dept-v2-briefing-trigger"
                              title={fullBriefTooltip}
                              aria-label={`Full operational briefing: ${fullBriefTooltip}`}
                            >
                              <span className="adminv2-ws-dept-v2-briefing-trigger-icon" aria-hidden>
                                ⓘ
                              </span>
                              <span className="adminv2-ws-dept-v2-briefing-trigger-label">Briefing</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {hasAwareness ? (
                      <p className="adminv2-ws-dept-v2-ai-awareness" aria-live="polite">
                        {awarenessLine}
                      </p>
                    ) : null}
                    {hasSignals ? (
                      <div className="adminv2-ws-dept-v2-signals">
                        <SignalBlock signals={model.signals} onAction={onAction} surface="department" maxVisible={3} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasKpis ? <KPIBlock kpis={model.kpis} surface="department" /> : null}
              </div>
            ) : null}
            <div
              className={`adminv2-ws-dept-v2-operational-row ${
                model.secondaryQueue
                  ? "adminv2-ws-dept-v2-operational-row--triple"
                  : "adminv2-ws-dept-v2-operational-row--double"
              }`}
              aria-label="Operational lanes"
            >
              <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput"
                data-ws-lane-kind="throughput"
                data-ws-lane-drill-queue={model.primaryQueue.id}
              >
                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                  <QueueBlock queue={model.primaryQueue} onAction={onAction} variant="primary" surface="department" />
                </div>
              </div>
              <div
                className={`adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention ${model.secondaryQueue ? "" : "adminv2-ws-dept-v2-lane--attention--hidden"}`}
                data-ws-lane-kind="attention"
                data-ws-lane-drill-queue={model.secondaryQueue?.id}
              >
                {model.secondaryQueue ? (
                  <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot">
                    <QueueBlock queue={model.secondaryQueue} onAction={onAction} variant="secondary" surface="department" />
                  </div>
                ) : null}
              </div>
            </div>
            {model.workSummary ? (
              <div className="adminv2-ws-dept-v2-workflows-strip">
                <WorkBlock work={model.workSummary} onAction={onAction} mode="summary" surface="department" />
              </div>
            ) : null}
          </div>
          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
            <aside
              className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
              data-adminv2-workspace-command-rail
              aria-label="Command center and context"
            >
              <ActionsBlock model={model.actionsRail} onAction={onAction} title="Actions" surface="department" />
              <ContextBlock model={model.contextRail} onAction={onAction} surface="department" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
