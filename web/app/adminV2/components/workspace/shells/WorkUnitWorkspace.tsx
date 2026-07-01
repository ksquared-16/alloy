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
import type { WorkUnitAboveFoldHeaderHandlers } from "@/app/adminV2/components/workspace/WorkUnitAboveFoldHeaderChips";
import { WorkUnitAboveFoldActionsRail } from "@/app/adminV2/components/workspace/WorkUnitAboveFoldActionsRail";
import { SignalBlock, QueueBlock, WorkBlock } from "../blocks";
import WorkUnitUnifiedOperationalHeader from "@/components/admin/workspace/WorkUnitUnifiedOperationalHeader";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { resolveCompressedQueueHeader } from "@/lib/adminV2/runtime/compressedQueueHeader";
import { CompressedQueueHeader } from "@/app/adminV2/components/workspace/blocks/CompressedQueueHeader";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

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
  oipResolved?: ResolvedMetricMap;
  /** Workflow telemetry card in the command rail (between Actions and BOS). */
  commandRailTelemetrySlot?: ReactNode;
  opportunityDrawerWorkspaceContext?: OpportunityDrawerIntentContext | null;
  queueRowOpenPendingOpportunityId?: string | null;
  queuePillPendingKey?: string | null;
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
  oipResolved,
  commandRailTelemetrySlot = null,
  opportunityDrawerWorkspaceContext = null,
  queueRowOpenPendingOpportunityId = null,
  queuePillPendingKey = null,
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
  const hasKpiZone = hasKpis || kpiStripPlaceholder;
  const hasUnifiedHeader = hasHeaderSlot || hasKpiZone;
  const processName = model.focusLabel?.trim() || null;
  const showBrief = hasBrief && !hasUnifiedHeader;
  /** Unified command surface owns process/stage/pulse — no parallel brief/signal rows. */
  const hasTopStack = !hasUnifiedHeader && (showBrief || hasSignals || hasAwareness);
  const hasControlDeck = hasTopStack || hasUnifiedHeader;

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

  const compressedQueueHeader = useMemo(() => {
    const attentionCount = primaryQueue.items.filter((item) => item.needsOperationalAttention).length;
    return resolveCompressedQueueHeader(primaryQueue, attentionCount);
  }, [primaryQueue]);

  const commandRailActions = useMemo(
    () => (
      <div data-alloy-section="WU.RIGHT_RAIL">
        <WorkUnitAboveFoldActionsRail slot={aboveFold.actions_rail} onAction={onAction} />
      </div>
    ),
    [aboveFold.actions_rail, onAction],
  );

  return (
    <WorkspaceShellLayout
      surface="work_unit"
      rootClassName="adminv2-ws-work-unit adminv2-ws-wu-v2"
      style={wuShellStyle}
      railAriaLabel="Decisions and actions"
      commandRailTelemetrySlot={commandRailTelemetrySlot}
      railContent={commandRailActions}
      primaryColumn={
        <>
          {hasControlDeck ? (
            <div
              className="adminv2-ws-dept-v2-control-deck"
              data-wu-unified-header={hasUnifiedHeader ? "true" : undefined}
              data-alloy-os-context-bar={hasUnifiedHeader ? "true" : undefined}
            >
              {hasTopStack ?
                <div className="adminv2-ws-dept-v2-top-stack mb-2">
                  {showBrief ?
                    <div className="adminv2-ws-dept-v2-brief">
                      <div className="adminv2-ws-dept-v2-brief-kicker">{processName ?? "Work unit"}</div>
                      <div className="adminv2-ws-dept-v2-brief-head-row">
                        {model.aiSummary?.headline?.trim() ?
                            <h2 className="adminv2-ws-dept-v2-brief-headline">{model.aiSummary.headline.trim()}</h2>
                        :   <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                                Lane headline
                            </h2>
                        }
                        {fullBriefTooltip ?
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
                        :   null}
                      </div>
                    </div>
                  : null}
                  {hasAwareness ?
                    <p className="adminv2-ws-dept-v2-ai-awareness" aria-live="polite">
                      {awarenessLine}
                    </p>
                  : null}
                  {hasSignals ?
                    <div className="adminv2-ws-dept-v2-signals">
                      <SignalBlock signals={model.signals} onAction={onAction} surface="work_unit" maxVisible={2} />
                    </div>
                  : null}
                </div>
              : null}
              {hasUnifiedHeader ?
                <WorkUnitUnifiedOperationalHeader
                  aboveFold={aboveFold}
                  handlers={aboveFoldHandlers}
                  kpis={model.kpis}
                  oipResolved={oipResolved}
                  kpiStripPlaceholder={kpiStripPlaceholder}
                  lifecyclePanel={lifecyclePanel}
                  otherPillSectionKey={otherPillSectionKey}
                  queuePillPendingKey={queuePillPendingKey}
                  processName={processName}
                  workUnitId={model.workUnitId}
                  surfaceKey="default"
                />
              : null}
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
                data-alloy-section="WU.QUEUE_REGION"
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
                  {recordFilterBar ?
                    <div
                        className="adminv2-os-queue-header"
                        data-alloy-os-queue-header="true"
                        {...alloySectionDomAttrs("WU-04")}
                    >
                        {compressedQueueHeader ?
                            <CompressedQueueHeader {...compressedQueueHeader} />
                        :   null}
                        <div className="adminv2-os-queue-header__controls">{recordFilterBar}</div>
                    </div>
                  :   null}
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
        </>
      }
    />
  );
}
