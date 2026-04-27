"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import { operationalWorkspaceShellStyle } from "@/lib/visualContext";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, KPIBlock, QueueBlock, WorkBlock, ActionsBlock } from "../blocks";
import "../workspace.css";

type Props = {
  model: WorkUnitWorkspaceModel;
  onAction: WorkspaceActionHandler;
  /** Compact queue pills in the control-deck header (below lane headline). Body starts with queue rows only. */
  headerQueuePicker?: React.ReactNode;
};

/**
 * Work unit — same shell grammar as Department (control deck, KPI strip, 75/25 split, workflows strip, command rail).
 * Main surface is a structured queue of drillable records (not department rollups). No inline AI form — shell bar only.
 */
export default function WorkUnitWorkspace({ model, onAction, headerQueuePicker }: Props) {
  const wuShellStyle: CSSProperties = useMemo(
    () =>
      operationalWorkspaceShellStyle({
        layer: "work_unit",
        laneKey: model.laneKey,
        workUnitVisualContextKey: model.visualContextKey,
        departmentDefaultVisualContextKey: model.departmentDefaultVisualContextKey,
        departmentKey: model.departmentKey,
      }),
    [
      model.departmentDefaultVisualContextKey,
      model.departmentKey,
      model.laneKey,
      model.visualContextKey,
    ]
  );

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
  const hasTopStack = hasBrief || hasSignals || hasAwareness || Boolean(headerQueuePicker);
  const hasControlDeck = hasTopStack || hasKpis;
  const focusKicker = model.focusLabel?.trim() || "Work unit";

  const li = model.laneInterpretation;
  const statusLine = li?.laneStatusLine?.trim() ?? "";
  const recLine = li?.recommendedActionLine?.trim() ?? "";
  const hasLaneStrip = Boolean(statusLine || recLine);
  const kpiSurface = model.kpis.some((k) => k.lane === "ai") ? "work_unit" : "default";

  return (
    <div
      data-ws-surface="work_unit"
      className="adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2"
      style={wuShellStyle}
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
                        {headerQueuePicker ? (
                          <div className="adminv2-ws-wu-header-queue-picker mt-2 min-w-0">{headerQueuePicker}</div>
                        ) : null}
                      </div>
                    ) : null}
                    {!hasBrief && headerQueuePicker ? (
                      <div className="adminv2-ws-wu-header-queue-picker mt-1 min-w-0 px-1">{headerQueuePicker}</div>
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
                {hasKpis ? (
                  <div data-workspace-zone="kpi-banner">
                    <KPIBlock kpis={model.kpis} surface={kpiSurface} maxVisible={6} />
                  </div>
                ) : null}
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
                  {hasLaneStrip ? (
                    <div className="adminv2-ws-wu-lane-strip" aria-label="Lane status">
                      {statusLine ? (
                        <p className="adminv2-ws-wu-lane-strip-line">
                          <span className="adminv2-ws-wu-lane-strip-k">Lane status</span>
                          {statusLine}
                        </p>
                      ) : null}
                      {recLine ? (
                        <p className="adminv2-ws-wu-lane-strip-line">
                          <span className="adminv2-ws-wu-lane-strip-k">Recommended</span>
                          {recLine}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
              aria-label="Decisions and actions"
            >
              <ActionsBlock model={model.actionsRail} onAction={onAction} title="Actions" surface="work_unit" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
