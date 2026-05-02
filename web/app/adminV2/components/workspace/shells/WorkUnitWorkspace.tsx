"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import { operationalWorkspaceShellStyle } from "@/lib/visualContext";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, KPIBlock, QueueBlock, WorkBlock, ActionsBlock } from "../blocks";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { KpiStripSkeleton } from "@/components/admin/workspace/KpiStripSkeleton";

type Props = {
  model: WorkUnitWorkspaceModel;
  onAction: WorkspaceActionHandler;
  /** Compact queue pills in the control-deck header (below lane headline). Body starts with queue rows only. */
  headerQueuePicker?: ReactNode;
  /** Non-numeric placeholder while KPI placements load (Phase 3). */
  kpiStripPlaceholder?: boolean;
  /** Optional footer content constrained to the primary column width. */
  primaryFooterSlot?: ReactNode;
};

/**
 * Work unit — same shell grammar as Department (control deck, KPI strip, split grid, workflows strip, command rail).
 * Main surface is a structured queue of drillable records (not department rollups). No inline AI form — shell bar only.
 */
export default function WorkUnitWorkspace({
  model,
  onAction,
  headerQueuePicker,
  kpiStripPlaceholder = false,
  primaryFooterSlot,
}: Props) {
  const wuShellStyle: CSSProperties = useMemo(
    () =>
      operationalWorkspaceShellStyle({
        layer: "work_unit",
        laneKey: model.laneKey,
        workUnitVisualContextKey: model.visualContextKey,
        departmentDefaultVisualContextKey: model.departmentDefaultVisualContextKey,
        departmentKey: model.departmentKey,
      }),
    [model.departmentDefaultVisualContextKey, model.departmentKey, model.laneKey, model.visualContextKey]
  );

  const briefParagraphs =
    model.aiSummary?.bodyParagraphs?.filter((p) => p.trim()) ??
    (model.aiSummary?.body?.trim() ? [model.aiSummary.body.trim()] : []);
  const fullBriefTooltip = briefParagraphs.join("\n\n");
  const hasBrief = Boolean(model.aiSummary?.headline?.trim()) || Boolean(fullBriefTooltip);
  const awarenessLine = model.aiSummary?.aiAwarenessLine?.trim() ?? "";
  const hasAwareness = Boolean(awarenessLine);
  const hasSignals = model.signals.length > 0;
  const hasKpis = model.kpis.length > 0;
  const hasTopStack = hasBrief || hasSignals || hasAwareness || Boolean(headerQueuePicker);
  const hasKpiZone = hasKpis || kpiStripPlaceholder;
  const hasControlDeck = hasTopStack || hasKpiZone;
  const focusKicker = model.focusLabel?.trim() || "Work unit";

  const li = model.laneInterpretation;
  const statusLine = li?.laneStatusLine?.trim() ?? "";
  const recLine = li?.recommendedActionLine?.trim() ?? "";
  const hasLaneStrip = Boolean(statusLine || recLine);
  const hasConfiguredActions =
    (model.actionsRail.primaries?.length ?? 0) > 0 ||
    (model.actionsRail.systemActions?.length ?? 0) > 0 ||
    (model.actionsRail.quickOperations?.length ?? 0) > 0 ||
    (model.actionsRail.overflow?.length ?? 0) > 0;

  return (
    <WorkspaceShellLayout
      surface="work_unit"
      rootClassName="adminv2-ws-work-unit adminv2-ws-wu-v2"
      style={wuShellStyle}
      railAriaLabel="Decisions and actions"
      showRail={hasConfiguredActions}
      railContent={
        hasConfiguredActions ? (
          <ActionsBlock model={model.actionsRail} onAction={onAction} title="Actions" surface="work_unit" />
        ) : null
      }
      primaryColumn={
        <>
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
              {kpiStripPlaceholder ? (
                <div data-workspace-zone="kpi-banner">
                  <KpiStripSkeleton id="wu-kpi-skeleton" />
                </div>
              ) : hasKpis ? (
                <div data-workspace-zone="kpi-banner">
                  <KPIBlock kpis={model.kpis} maxVisible={5} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double" aria-label="Lane queue">
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
                        <span className="adminv2-ws-wu-lane-strip-k">Status</span>
                        {statusLine}
                      </p>
                    ) : null}
                    {recLine ? (
                      <p className="adminv2-ws-wu-lane-strip-line">
                        <span className="adminv2-ws-wu-lane-strip-k">Suggested</span>
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
          {primaryFooterSlot ? (
            <div className="adminv2-ws-dept-v2-workflows-strip" data-ws-lane-kind="automation_workflows">
              {primaryFooterSlot}
            </div>
          ) : null}
        </>
      }
    />
  );
}
