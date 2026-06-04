"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import { operationalWorkspaceShellStyle } from "@/lib/visualContext";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import type { OpportunityDrawerIntentContext } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import type {
    WorkUnitAboveFoldRenderModel,
} from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import {
    workUnitAboveFoldQueueRowsHeld,
    workUnitAboveFoldQueueRowsLoading,
} from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import {
    WorkUnitAboveFoldHeaderChips,
    type WorkUnitAboveFoldHeaderHandlers,
} from "@/app/adminV2/components/workspace/WorkUnitAboveFoldHeaderChips";
import { WorkUnitAboveFoldActionsRail } from "@/app/adminV2/components/workspace/WorkUnitAboveFoldActionsRail";
import { SignalBlock, KPIBlock, QueueBlock, WorkBlock } from "../blocks";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";

type Props = {
  model: WorkUnitWorkspaceModel;
  aboveFold: WorkUnitAboveFoldRenderModel;
  aboveFoldHandlers: WorkUnitAboveFoldHeaderHandlers;
  onAction: WorkspaceActionHandler;
  /** Shown under chips when header slot is ready (lifecycle coverage). */
  lifecyclePanel?: ReactNode;
  /** Client-side record filter bar above queue rows (Card 14B). */
  recordFilterBar?: ReactNode;
  otherPillSectionKey?: string | null;
  kpiStripPlaceholder: boolean;
  kpiStripSkeletonCellCount?: number;
  primaryFooterSlot?: ReactNode;
  opportunityDrawerWorkspaceContext?: OpportunityDrawerIntentContext | null;
  queueRowOpenPendingOpportunityId?: string | null;
};

/**
 * Work unit — atomic above-fold render model (header chips, actions rail, queue lane).
 */
export default function WorkUnitWorkspace({
  model,
  aboveFold,
  aboveFoldHandlers,
  onAction,
  lifecyclePanel = null,
  recordFilterBar = null,
  otherPillSectionKey = null,
  kpiStripPlaceholder,
  kpiStripSkeletonCellCount: _kpiStripSkeletonCellCount,
  primaryFooterSlot,
  opportunityDrawerWorkspaceContext = null,
  queueRowOpenPendingOpportunityId = null,
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
  const hasHeaderSlot = aboveFold.header.visible;
  const hasTopStack = hasBrief || hasSignals || hasAwareness || hasHeaderSlot;
  const hasKpiZone = hasKpis || kpiStripPlaceholder;
  const hasControlDeck = hasTopStack || hasKpiZone;
  const focusKicker = model.focusLabel?.trim() || "Work unit";

  const li = model.laneInterpretation;
  const statusLine = li?.laneStatusLine?.trim() ?? "";
  const recLine = li?.recommendedActionLine?.trim() ?? "";
  const hasLaneStrip = Boolean(statusLine || recLine);

  const primaryQueue = useMemo(
    () => ({
      ...model.primaryQueue,
      rowsLoading: workUnitAboveFoldQueueRowsLoading(aboveFold),
      rowsHeld:
        model.primaryQueue.rowsHeld === true || workUnitAboveFoldQueueRowsHeld(aboveFold),
    }),
    [model.primaryQueue, aboveFold]
  );

  return (
    <WorkspaceShellLayout
      surface="work_unit"
      rootClassName="adminv2-ws-work-unit adminv2-ws-wu-v2"
      style={wuShellStyle}
      railAriaLabel="Decisions and actions"
      showRail={aboveFold.actions_rail.visible}
      railContent={
        <WorkUnitAboveFoldActionsRail slot={aboveFold.actions_rail} onAction={onAction} />
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
                      {hasHeaderSlot ? (
                        <div className="adminv2-ws-wu-header-queue-picker mt-2 min-w-0">
                          <WorkUnitAboveFoldHeaderChips
                            slot={aboveFold.header}
                            handlers={aboveFoldHandlers}
                            otherPillSectionKey={otherPillSectionKey}
                            lifecyclePanel={lifecyclePanel}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {!hasBrief && hasHeaderSlot ? (
                    <div className="adminv2-ws-wu-header-queue-picker mt-1 min-w-0 px-1">
                      <WorkUnitAboveFoldHeaderChips
                        slot={aboveFold.header}
                        handlers={aboveFoldHandlers}
                        otherPillSectionKey={otherPillSectionKey}
                        lifecyclePanel={lifecyclePanel}
                      />
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
              {kpiStripPlaceholder ? (
                <div data-workspace-zone="kpi-banner">
                  <WorkspaceQuietKpiReserve id="wu-kpi-quiet-reserve" />
                </div>
              ) : hasKpis ? (
                <div data-workspace-zone="kpi-banner">
                  <KPIBlock kpis={model.kpis} maxVisible={5} />
                </div>
              ) : null}
            </div>
          ) : null}
          {aboveFold.queue_lane.visible ? (
            <div
              className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double"
              aria-label="Lane queue"
              data-wu-above-fold-slot="queue_lane"
              data-wu-above-fold-state={aboveFold.queue_lane.state}
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
                  {recordFilterBar ? (
                    <div className="adminv2-ws-wu-record-filter-bar-slot">{recordFilterBar}</div>
                  ) : null}
                  <QueueBlock
                    queue={primaryQueue}
                    onAction={onAction}
                    variant="primary"
                    surface="work_unit"
                    opportunityDrawerWorkspaceContext={opportunityDrawerWorkspaceContext}
                    queueRowOpenPendingOpportunityId={queueRowOpenPendingOpportunityId}
                  />
                </div>
              </div>
              <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden"
                aria-hidden
              />
            </div>
          ) : null}
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
