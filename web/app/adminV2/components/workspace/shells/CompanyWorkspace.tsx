"use client";

import type { CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { CompanyWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { SignalBlock, KPIBlock as _KPIBlock, OperationalAnswerStrip, WorkBlock, ActionsBlock } from "../blocks";
import { kpiVmToOperationalAnswer } from "@/lib/ui-v2/workspace-types";
import CompanyDepartmentRollupCard from "../blocks/CompanyDepartmentRollupCard";
import "../workspace.css";

type Props = {
  model: CompanyWorkspaceModel;
  onAction: WorkspaceActionHandler;
};

const companyRootStyle: CSSProperties = {
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
 * Company / org workspace — same shell grammar as Department (deck, KPI strip, workflows, command rail).
 * Main surface: department rollup cards instead of throughput/attention lanes.
 */
export default function CompanyWorkspace({ model, onAction }: Props) {
  const briefParagraphs =
    model.aiSummary?.bodyParagraphs?.filter((p) => p.trim()) ??
    (model.aiSummary?.body?.trim() ? [model.aiSummary.body.trim()] : []);
  const fullBriefTooltip = briefParagraphs.join("\n\n");
  const hasBrief = Boolean(model.aiSummary?.headline?.trim()) || Boolean(fullBriefTooltip);
  const awarenessLine = model.aiSummary?.aiAwarenessLine?.trim() ?? "";
  const hasAwareness = Boolean(awarenessLine);
  const hasSignals = model.signals.length > 0;
  const hasKpis = model.kpis.length > 0;
  const hasTopStack = hasBrief || hasSignals || hasAwareness;
  const hasControlDeck = hasTopStack || hasKpis;
  const focusLabel = (model.focusLabel ?? "Company focus").trim();

  return (
    <div
      data-ws-surface="company"
      className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2"
      style={companyRootStyle}
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
                        <div className="adminv2-ws-dept-v2-brief-focus-label">{focusLabel}</div>
                        <div className="adminv2-ws-dept-v2-brief-head-row">
                          {model.aiSummary?.headline?.trim() ? (
                            <h2 className="adminv2-ws-dept-v2-brief-headline">{model.aiSummary.headline.trim()}</h2>
                          ) : (
                            <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                              Awaiting company focus
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
                        <SignalBlock signals={model.signals} onAction={onAction} surface="company" maxVisible={3} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasKpis ? (
                  <OperationalAnswerStrip
                    answers={model.kpis.map(kpiVmToOperationalAnswer)}
                    maxVisible={5}
                  />
                ) : null}
              </div>
            ) : null}

            <section className="adminv2-ws-company-v2-main" aria-label="Departments">
              <div className="adminv2-ws-company-v2-dept-grid">
                {model.primaryDepartments.map((c) => (
                  <CompanyDepartmentRollupCard key={c.id} card={c} tier="primary" onAction={onAction} />
                ))}
                {model.secondaryDepartments.map((c) => (
                  <CompanyDepartmentRollupCard key={c.id} card={c} tier="secondary" onAction={onAction} />
                ))}
              </div>
            </section>

            {model.workSummary ? (
              <div className="adminv2-ws-dept-v2-workflows-strip">
                <WorkBlock work={model.workSummary} onAction={onAction} mode="summary" surface="company" />
              </div>
            ) : null}
          </div>
          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
            <aside
              className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
              data-adminv2-workspace-command-rail
              aria-label="Decisions and actions"
            >
              <ActionsBlock model={model.actionsRail} onAction={onAction} title="Actions" surface="company" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
