"use client";

import type { CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, KPIBlock, QueueBlock, WorkBlock, ContextBlock, ActionsBlock } from "../blocks";
import "../workspace.css";

type Props = {
  model: WorkUnitWorkspaceModel;
  onAction: WorkspaceActionHandler;
};

/** Same token contract as Department / Company — ambient shell reads from AdminV2 wrapper. */
const wuRootStyle: CSSProperties = {
  backgroundColor: "transparent",
  color: neutral.textPrimary,
  ["--d-text-primary" as string]: neutral.textPrimary,
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
  ["--d-kpi-band-shadow" as string]: derived.kpiBandShadow,
  ["--d-admin-amber" as string]: derived.adminV2BoundaryAmber,
  ["--d-rail-hairline" as string]: derived.inspectorCommandHairline,
  ["--d-rail-sep" as string]: derived.inspectorChamberSeparation,
  ["--d-ambient-edge" as string]: derived.ambientLifeBloomEdge,
  ["--d-field-depth" as string]: derived.canvasFieldDepth,
  ["--d-card-shadow" as string]: derived.cardShadow,
};

/**
 * Work unit — same shell grammar as Department (control deck, KPI strip, 75/25 split, workflows strip, command rail).
 * Main surface is a structured queue of drillable records (not department rollups). No inline AI form — shell bar only.
 */
export default function WorkUnitWorkspace({ model, onAction }: Props) {
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
  const focusKicker = model.focusLabel?.trim() || "Work unit";

  return (
    <div
      data-ws-surface="work_unit"
      className="adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2"
      style={wuRootStyle}
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
                        <div className="adminv2-ws-dept-v2-brief-kicker">{focusKicker}</div>
                        <div className="adminv2-ws-dept-v2-brief-head-row">
                          {model.aiSummary?.headline?.trim() ? (
                            <h2 className="adminv2-ws-dept-v2-brief-headline">{model.aiSummary.headline.trim()}</h2>
                          ) : (
                            <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                              Lane headline
                            </h2>
                          )}
                          {fullBriefTooltip ? (
                            <button
                              type="button"
                              className="adminv2-ws-dept-v2-briefing-trigger"
                              title={fullBriefTooltip}
                              aria-label={`Lane briefing: ${fullBriefTooltip}`}
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
                        <SignalBlock signals={model.signals} onAction={onAction} surface="work_unit" maxVisible={3} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasKpis ? <KPIBlock kpis={model.kpis} surface="work_unit" /> : null}
              </div>
            ) : null}
            <div
              className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double"
              aria-label="Lane queue"
            >
              <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput"
                data-ws-lane-kind="lane_queue"
                data-ws-lane-drill-queue={model.primaryQueue.id}
              >
                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                  <QueueBlock queue={model.primaryQueue} onAction={onAction} variant="primary" surface="work_unit" />
                </div>
              </div>
              <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden"
                aria-hidden
              />
            </div>
            {model.workSummary ? (
              <div className="adminv2-ws-dept-v2-workflows-strip">
                <WorkBlock work={model.workSummary} onAction={onAction} mode="summary" surface="work_unit" />
              </div>
            ) : null}
          </div>
          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
            <aside
              className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
              data-adminv2-workspace-command-rail
              aria-label="Command center and context"
            >
              <ActionsBlock model={model.actionsRail} onAction={onAction} title="Actions" surface="work_unit" />
              <ContextBlock model={model.contextRail} onAction={onAction} surface="work_unit" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
