"use client";

import type { CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { RecordSectionVm, RecordWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import {
  SignalBlock,
  KPIBlock,
  OperationalAnswerStrip,
  WorkBlock,
  RecordWorkflowActivityLead,
  ContextBlock,
  ActionsBlock,
  RecordBodyBlock,
  RecordInteractionPanels,
} from "../blocks";
import { kpiVmToOperationalAnswer } from "@/lib/ui-v2/workspace-types";
import "../workspace.css";

type Props = {
  model: RecordWorkspaceModel;
  onAction: WorkspaceActionHandler;
};

/** Same token contract as Department / Work Unit — ambient shell reads from AdminV2 wrapper. */
const recordRootStyle: CSSProperties = {
  backgroundColor: "transparent",
  color: neutral.textPrimary,
  /** Body copy hierarchy — midnight primary, not pine-tinted paragraphs */
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

function partitionRecordSections(sections: RecordSectionVm[]) {
  const state: RecordSectionVm[] = [];
  const connections: RecordSectionVm[] = [];
  const history: RecordSectionVm[] = [];
  for (const s of sections) {
    const b = s.bodyBand ?? "state";
    if (b === "connections") connections.push(s);
    else if (b === "history") history.push(s);
    else state.push(s);
  }
  return { state, connections, history };
}

/**
 * Record — final drill level: shared workspace pattern (see docs/implementation/WORKSPACE_SYSTEM_V1.md).
 * Left = understanding (body + entity/interaction context). Right = actions only (command rail).
 */
export default function RecordWorkspace({ model, onAction }: Props) {
  const briefParagraphs =
    model.aiSummary?.bodyParagraphs?.filter((p) => p.trim()) ??
    (model.aiSummary?.body?.trim() ? [model.aiSummary.body.trim()] : []);
  const fullBriefTooltip = briefParagraphs.join("\n\n");
  const hasBrief =
    Boolean(model.aiSummary?.headline?.trim()) || Boolean(fullBriefTooltip);
  const awarenessLine = model.aiSummary?.aiAwarenessLine?.trim() ?? "";
  const hasAwareness = Boolean(awarenessLine);
  const hasSignals = model.signals.length > 0;
  const kpis = model.kpis ?? [];
  const hasKpis = kpis.length > 0;
  const hasTopStack = hasBrief || hasSignals || hasAwareness;
  const hasControlDeck = hasTopStack || hasKpis;
  const focusKicker = model.focusLabel?.trim() || model.entityType || "Record";
  const hasContextGroups = (model.contextRail?.groups?.length ?? 0) > 0;
  const activityEvents = model.recordActivityContext?.events?.filter((e) => e.trim()) ?? [];
  const { state: stateSections, connections: connectionsSections, history: historySections } =
    partitionRecordSections(model.recordSections);
  const showConnectionsBand =
    Boolean(model.recordContactContext) || hasContextGroups || connectionsSections.length > 0;
  const showHistoryBand =
    historySections.length > 0 || activityEvents.length > 0 || Boolean(model.workSummary);

  return (
    <div
      data-ws-surface="record"
      className="adminv2-ws-root adminv2-ws-record adminv2-ws-record-v2"
      style={recordRootStyle}
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
                              {model.title}
                            </h2>
                          )}
                          {fullBriefTooltip ? (
                            <button
                              type="button"
                              className="adminv2-ws-dept-v2-briefing-trigger"
                              title={fullBriefTooltip}
                              aria-label={`Record briefing: ${fullBriefTooltip}`}
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
                        <SignalBlock signals={model.signals} onAction={onAction} surface="record" maxVisible={4} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasKpis ? (
                  <OperationalAnswerStrip
                    answers={kpis.map(kpiVmToOperationalAnswer)}
                    maxVisible={4}
                  />
                ) : null}
              </div>
            ) : null}
            <div
              className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double"
              aria-label="Record details"
            >
              <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput"
                data-ws-lane-kind="record_body"
                data-ws-record-id={model.recordId}
              >
                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                  <div className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-record-body-root">
                    <div className="adminv2-ws-record-body-bands" aria-label="Record body">
                      {stateSections.length > 0 ? (
                        <div className="adminv2-ws-record-band adminv2-ws-record-band--state">
                          <div className="adminv2-ws-record-band-label" id="record-band-state">
                            State
                          </div>
                          <div className="adminv2-ws-record-band-body" aria-labelledby="record-band-state">
                            <RecordBodyBlock
                              recordId={model.recordId}
                              sections={stateSections}
                              onAction={onAction}
                              density="band"
                            />
                          </div>
                        </div>
                      ) : null}
                      {showConnectionsBand ? (
                        <div className="adminv2-ws-record-band adminv2-ws-record-band--connections">
                          <div className="adminv2-ws-record-band-label" id="record-band-connections">
                            Connections
                          </div>
                          <div
                            className="adminv2-ws-record-band-body adminv2-ws-record-band-body--connections"
                            aria-labelledby="record-band-connections"
                          >
                            <RecordBodyBlock
                              recordId={model.recordId}
                              sections={connectionsSections}
                              onAction={onAction}
                              density="band"
                            />
                            <div className="adminv2-ws-record-connections-stack">
                              {model.recordContactContext ? (
                                <RecordInteractionPanels
                                  recordId={model.recordId}
                                  contact={model.recordContactContext}
                                  onAction={onAction}
                                />
                              ) : null}
                              {hasContextGroups ? (
                                <ContextBlock
                                  model={model.contextRail}
                                  onAction={onAction}
                                  surface="record"
                                  layout="embedded"
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {showHistoryBand ? (
                        <div className="adminv2-ws-record-band adminv2-ws-record-band--history">
                          <div className="adminv2-ws-record-band-label" id="record-band-history">
                            History
                          </div>
                          <div
                            className="adminv2-ws-record-band-body adminv2-ws-record-band-body--history"
                            aria-labelledby="record-band-history"
                          >
                            <RecordBodyBlock
                              recordId={model.recordId}
                              sections={historySections}
                              onAction={onAction}
                              density="band"
                            />
                            {model.workSummary ? (
                              <WorkBlock
                                work={model.workSummary}
                                onAction={onAction}
                                mode="summary"
                                surface="record"
                                recordRecentActivity={activityEvents}
                                recordActivityShowKicker={false}
                              />
                            ) : activityEvents.length > 0 ? (
                              <div className="adminv2-ws-dept-workflows-panel adminv2-ws-record-history-activity-only">
                                <RecordWorkflowActivityLead events={activityEvents} showKicker={false} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden"
                aria-hidden
              />
            </div>
          </div>
          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
            <aside
              className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
              data-adminv2-workspace-command-rail
              aria-label="Decisions and actions"
            >
              <ActionsBlock model={model.actionsRail} onAction={onAction} title="Actions" surface="record" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
