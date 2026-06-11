"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";
import { ADMIN_WORKFLOWS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import Link from "next/link";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import type { WorkflowScopePartitionV1 } from "@/lib/workflows/workflowScopeMetadata";
import { WORKSPACE_AUTOMATION_METADATA_GAP_NOTE } from "@/lib/workspace/workspaceAutomationWorkflowFilter";
import "@/app/adminV2/components/workspace/workspace.css";

export type AutomationWorkflowKpis = {
    runs_today: number;
    failed_last_7d: number;
    running_last_7d: number;
    success_rate_last_7d: number | null;
};

export type AutomationWorkflowSummaryRow = {
    id: string;
    name: string | null;
    event_type: string | null;
    enabled: boolean | null;
    steps_count: number;
    last_run?: {
        status: string;
        started_at: string;
        has_failed_action?: boolean;
    } | null;
};

function humanTrigger(eventType: string | null): string {
    const key = (eventType ?? "").trim().toLowerCase();
    if (key === "opportunity_schedule_tour_followup") return "Runs when a tour is scheduled";
    return "Runs on configured trigger";
}

function collectScopedWorkflowRows(
    partitions: WorkflowScopePartitionV1 | null,
    workflows: AutomationWorkflowSummaryRow[] | null,
): AutomationWorkflowSummaryRow[] {
    if (partitions) {
        return [
            ...(partitions.scoped_work_unit ?? []),
            ...(partitions.scoped_department ?? []),
            ...(partitions.org_wide ?? []),
            ...(partitions.uses_heuristic_fallback ? (partitions.heuristic ?? []) : []),
        ];
    }
    return workflows ?? [];
}

function recentWorkflowActivityRows(rows: AutomationWorkflowSummaryRow[], limit = 5): AutomationWorkflowSummaryRow[] {
    return [...rows]
        .filter((row) => row.last_run?.started_at)
        .sort((a, b) => Date.parse(b.last_run!.started_at) - Date.parse(a.last_run!.started_at))
        .slice(0, limit);
}

function workflowHealthLabel(kpis: AutomationWorkflowKpis, kpisLoading: boolean): string {
    if (kpisLoading) return "Checking…";
    if (kpis.failed_last_7d > 0) return "Needs attention";
    if (kpis.success_rate_last_7d != null && kpis.success_rate_last_7d < 0.92) return "Needs attention";
    return "Healthy";
}

function workflowCompactSummaryLine(kpis: AutomationWorkflowKpis, kpisLoading: boolean): string {
    if (kpisLoading) return "Loading workflow status…";
    const runsToday = `${kpis.runs_today} run${kpis.runs_today === 1 ? "" : "s"} today`;
    const success =
        kpis.success_rate_last_7d == null ? "— success" : `${Math.round(kpis.success_rate_last_7d * 100)}% success`;
    const failures = `${kpis.failed_last_7d} failure${kpis.failed_last_7d === 1 ? "" : "s"}`;
    return `${runsToday} • ${success} • ${failures}`;
}

function WorkUnitRailTelemetryBlock(props: {
    kpis: AutomationWorkflowKpis;
    kpisLoading: boolean;
    partitions: WorkflowScopePartitionV1 | null;
    workflows: AutomationWorkflowSummaryRow[] | null;
    href: string;
    onWorkflowDiagnostics: (() => void) | null;
}) {
    const { kpis, kpisLoading, partitions, workflows, href, onWorkflowDiagnostics } = props;
    const [expanded, setExpanded] = useState(false);

    const healthLabel = workflowHealthLabel(kpis, kpisLoading);
    const healthNeedsAttention = healthLabel === "Needs attention";
    const compactSummary = workflowCompactSummaryLine(kpis, kpisLoading);
    const recentActivity = recentWorkflowActivityRows(collectScopedWorkflowRows(partitions, workflows));

    const runsTodayLabel = kpisLoading ? "—" : String(kpis.runs_today);
    const successRateLabel =
        kpisLoading ? "—" : kpis.success_rate_last_7d == null ? "—" : `${Math.round(kpis.success_rate_last_7d * 100)}%`;
    const failuresLabel = kpisLoading ? "—" : String(kpis.failed_last_7d);

    return (
        <section
            className={`adminv2-ws-command-rail-actions-section adminv2-ws-command-rail-telemetry-section${expanded ? " adminv2-ws-command-rail-actions-section--expanded" : ""}`}
            data-adminv2-command-rail-telemetry-section="true"
            data-ws-component="automation_telemetry"
            data-ws-automation-telemetry-expanded={expanded ? "true" : "false"}
            aria-label="Workflow Telemetry"
        >
            <button
                type="button"
                className="adminv2-ws-command-rail-actions-trigger adminv2-ws-command-rail-telemetry-trigger"
                aria-expanded={expanded}
                onClick={() => setExpanded((open) => !open)}
                data-command-rail-telemetry-toggle="true"
            >
                <span className="adminv2-ws-command-rail-telemetry-trigger-main">
                    <span className="adminv2-ws-command-rail-actions-trigger-label inline-flex items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={2.2} />
                        Workflow Telemetry
                    </span>
                    <span
                        className={`adminv2-ws-command-rail-telemetry-trigger-summary${healthNeedsAttention ? " adminv2-ws-command-rail-telemetry-trigger-summary--attention" : ""}`}
                    >
                        <span className="adminv2-ws-command-rail-telemetry-trigger-health">{healthLabel}</span>
                        <span className="adminv2-ws-command-rail-telemetry-trigger-metrics" aria-hidden>
                            {" "}
                            · {compactSummary}
                        </span>
                    </span>
                </span>
                <span className="adminv2-ws-command-rail-actions-trigger-chevron" aria-hidden>
                    {expanded ? "▼" : "▶"}
                </span>
            </button>
            {expanded ?
                <div
                    className="adminv2-ws-command-rail-actions-body adminv2-ws-command-rail-telemetry-body"
                    data-command-rail-telemetry-body="true"
                >
                    <section className="adminv2-ws-command-rail-telemetry-panel" aria-label="Workflow health">
                        <h4 className="adminv2-ws-command-rail-telemetry-panel-title">Workflow Health</h4>
                        <p
                            className={`adminv2-ws-command-rail-telemetry-health${healthNeedsAttention ? " adminv2-ws-command-rail-telemetry-health--attention" : ""}`}
                        >
                            {healthLabel}
                        </p>
                        <ul className="adminv2-ws-command-rail-telemetry-health-lines" role="list">
                            <li>{runsTodayLabel} runs today</li>
                            <li>{successRateLabel} success</li>
                            <li>{failuresLabel} failures</li>
                        </ul>
                    </section>

                    <section className="adminv2-ws-command-rail-telemetry-panel" aria-label="Recent workflow activity">
                        <h4 className="adminv2-ws-command-rail-telemetry-panel-title">Recent Workflow Activity</h4>
                        {recentActivity.length ?
                            <ul className="adminv2-ws-command-rail-telemetry-activity-list" role="list">
                                {recentActivity.map((row) => (
                                    <li key={row.id}>{row.name ?? row.id}</li>
                                ))}
                            </ul>
                        :   <p className="adminv2-ws-command-rail-telemetry-empty">No recent workflow runs in scope.</p>}
                    </section>

                    <section className="adminv2-ws-command-rail-telemetry-panel" aria-label="Workflow actions">
                        <h4 className="adminv2-ws-command-rail-telemetry-panel-title">Actions</h4>
                        <div className="adminv2-ws-command-rail-telemetry-actions">
                            <Link
                                href={href}
                                prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
                                className="adminv2-ws-command-rail-telemetry-action"
                            >
                                Open Automations
                            </Link>
                            {onWorkflowDiagnostics ?
                                <button
                                    type="button"
                                    className="adminv2-ws-command-rail-telemetry-action adminv2-ws-command-rail-telemetry-action--secondary"
                                    data-ws-workflow-diagnostics="true"
                                    onClick={onWorkflowDiagnostics}
                                >
                                    Workflow Diagnostics
                                </button>
                            : null}
                        </div>
                    </section>
                </div>
            :   null}
        </section>
    );
}

function WorkflowListSection(props: {
    kicker: string;
    hint: string;
    rows: AutomationWorkflowSummaryRow[];
    limit?: number;
}) {
    if (!props.rows.length) return null;
    const limit = props.limit ?? 4;
    return (
        <section className="adminv2-ws-automation-telemetry__workflows" aria-label={props.kicker}>
            <div className="adminv2-ws-automation-telemetry__workflows-head">
                <span className="adminv2-ws-automation-telemetry__workflows-kicker">{props.kicker}</span>
                <span className="adminv2-ws-automation-telemetry__workflows-hint">{props.hint}</span>
            </div>
            <ul className="adminv2-ws-automation-telemetry__workflow-list" role="list">
                {props.rows.slice(0, limit).map((w) => (
                    <li key={w.id} className="adminv2-ws-automation-workflow-row">
                        <div className="adminv2-ws-automation-workflow-row__rail" aria-hidden />
                        <div className="adminv2-ws-automation-workflow-row__body">
                            <div className="adminv2-ws-automation-workflow-row__name">{w.name ?? w.id}</div>
                            <div className="adminv2-ws-automation-workflow-row__meta">
                                <span className="adminv2-ws-automation-workflow-row__trigger">{humanTrigger(w.event_type)}</span>
                                <span className="adminv2-ws-automation-workflow-row__sep" aria-hidden>
                                    ·
                                </span>
                                <span className="adminv2-ws-automation-workflow-row__steps">
                                    {w.steps_count} step{w.steps_count === 1 ? "" : "s"}
                                </span>
                                {w.last_run ?
                                    <>
                                        <span className="adminv2-ws-automation-workflow-row__sep" aria-hidden>
                                            ·
                                        </span>
                                        <span
                                            className={
                                                w.last_run.has_failed_action || w.last_run.status === "failed" ?
                                                    "adminv2-ws-automation-workflow-row__run--failed"
                                                :   "adminv2-ws-automation-workflow-row__run"
                                            }
                                        >
                                            Last run {w.last_run.status}
                                        </span>
                                    </>
                                : null}
                            </div>
                        </div>
                        <span
                            className={
                                w.enabled === false
                                    ? "adminv2-ws-automation-workflow-row__chip adminv2-ws-automation-workflow-row__chip--disabled"
                                    : "adminv2-ws-automation-workflow-row__chip adminv2-ws-automation-workflow-row__chip--enabled"
                            }
                        >
                            {w.enabled === false ? "Off" : "Live"}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function AutomationWorkflowsBlock(props: {
    kpis: AutomationWorkflowKpis;
    workflows?: AutomationWorkflowSummaryRow[] | null;
    partitions?: WorkflowScopePartitionV1 | null;
    title?: string;
    href?: string;
    /** When true, numeric stats show placeholders until the first KPI fetch completes. */
    kpisLoading?: boolean;
    /** Shown when workflows lack department/work-unit linkage (org-wide heuristic list). */
    metadataAssociationNote?: string | null;
    /** Optional command-bar deep link for Workflow Assist (legacy). */
    workflowAssistHref?: string | null;
    /** Focus command surface with seeded Workflow Assist prompt (preferred). */
    onAskWorkflowAssist?: (() => void) | null;
    /** Work-unit rail: BOS diagnostics prompt for operator troubleshooting. */
    onWorkflowDiagnostics?: (() => void) | null;
    /**
     * `full` — department context-lower card (default).
     * `work_unit_summary` — legacy below-queue banner (deprecated; use `work_unit_rail`).
     * `work_unit_rail` — compact collapsible utility in work-unit command rail.
     */
    presentation?: "full" | "work_unit_summary" | "work_unit_rail";
}) {
    const {
        kpis,
        workflows = null,
        partitions = null,
        title = "Automations",
        href = ADMIN_WORKFLOWS_HREF,
        kpisLoading = false,
        metadataAssociationNote = null,
        workflowAssistHref = null,
        onAskWorkflowAssist = null,
        onWorkflowDiagnostics = null,
        presentation = "full",
    } = props;

    const isWorkUnitRail = presentation === "work_unit_rail";
    if (isWorkUnitRail) {
        return (
            <WorkUnitRailTelemetryBlock
                kpis={kpis}
                kpisLoading={kpisLoading}
                partitions={partitions}
                workflows={workflows}
                href={href}
                onWorkflowDiagnostics={onWorkflowDiagnostics ?? onAskWorkflowAssist}
            />
        );
    }

    const isWorkUnitSummary = presentation === "work_unit_summary";
    const isWorkUnitCompact = isWorkUnitSummary;
    const [summaryExpanded, setSummaryExpanded] = useState(false);

    const scopedWu = partitions?.scoped_work_unit ?? [];
    const scopedDept = partitions?.scoped_department ?? [];
    const orgWide = partitions?.org_wide ?? [];
    const heuristic = partitions?.uses_heuristic_fallback ? (partitions?.heuristic ?? []) : [];
    const hasPartitions = Boolean(partitions);
    const associationNote =
        partitions?.uses_heuristic_fallback ? WORKSPACE_AUTOMATION_METADATA_GAP_NOTE
        : metadataAssociationNote;

    const failuresHot = !kpisLoading && kpis.failed_last_7d > 0;
    const successConcern =
        !kpisLoading &&
        kpis.success_rate_last_7d != null &&
        kpis.success_rate_last_7d < 0.92 &&
        kpis.success_rate_last_7d >= 0;

    const runsTodayLabel = kpisLoading ? "—" : String(kpis.runs_today);
    const successRateLabel =
        kpisLoading ? "—" : kpis.success_rate_last_7d == null ? "—" : `${Math.round(kpis.success_rate_last_7d * 100)}%`;
    const failuresLabel = kpisLoading ? "—" : String(kpis.failed_last_7d);

    const showFullDetails = !isWorkUnitCompact || summaryExpanded;

    const summaryStats = (
        <dl className="adminv2-ws-automation-telemetry__summary-stats">
            <div className="adminv2-ws-automation-telemetry__summary-stat">
                <dt>Runs Today</dt>
                <dd>{runsTodayLabel}</dd>
            </div>
            <div className="adminv2-ws-automation-telemetry__summary-stat">
                <dt>Success Rate</dt>
                <dd>{successRateLabel}</dd>
            </div>
            <div
                className={`adminv2-ws-automation-telemetry__summary-stat${failuresHot ? " adminv2-ws-automation-telemetry__summary-stat--attention" : ""}`}
            >
                <dt>Failures</dt>
                <dd>{failuresLabel}</dd>
            </div>
        </dl>
    );

    const expandedActions = (
        <div className="adminv2-ws-automation-telemetry__mast-actions adminv2-ws-automation-telemetry__mast-actions--expanded">
            <Link
                href={href}
                prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
                className="adminv2-ws-automation-telemetry__review"
            >
                Open Automations
                <span aria-hidden> →</span>
            </Link>
            {onAskWorkflowAssist ?
                <button
                    type="button"
                    className="adminv2-ws-automation-telemetry__review adminv2-ws-automation-telemetry__review--secondary"
                    data-ws-ask-workflow-assist="true"
                    onClick={onAskWorkflowAssist}
                >
                    Ask Workflow Assist
                </button>
            : workflowAssistHref ?
                <Link
                    href={workflowAssistHref}
                    prefetch={shouldDisableAdminV2LinkPrefetch(workflowAssistHref) ? false : undefined}
                    className="adminv2-ws-automation-telemetry__review adminv2-ws-automation-telemetry__review--secondary"
                    data-ws-ask-workflow-assist="true"
                >
                    Ask Workflow Assist
                </Link>
            : null}
        </div>
    );

    const fullDetailsBody = (
        <>
            {isWorkUnitCompact ? expandedActions : null}

            {associationNote ?
                <p className="adminv2-ws-automation-telemetry__association-note" data-ws-automation-metadata-gap="true">
                    {associationNote}
                </p>
            :   null}

            <div className="adminv2-ws-automation-telemetry__groups" role="group" aria-label="Automation metrics">
                <section className="adminv2-ws-automation-telemetry__group" aria-label="Throughput">
                    <h4 className="adminv2-ws-automation-telemetry__group-title">Throughput</h4>
                    <div className="adminv2-ws-automation-telemetry__group-cells">
                        <div className="adminv2-ws-automation-telemetry__metric">
                            <span className="adminv2-ws-automation-telemetry__metric-label">Runs today</span>
                            <span
                                className={`adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`}
                            >
                                {kpisLoading ? "—" : kpis.runs_today}
                            </span>
                        </div>
                        <div className="adminv2-ws-automation-telemetry__metric">
                            <span className="adminv2-ws-automation-telemetry__metric-label">Running (7d)</span>
                            <span
                                className={`adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`}
                            >
                                {kpisLoading ? "—" : kpis.running_last_7d}
                            </span>
                        </div>
                    </div>
                </section>
                <section className="adminv2-ws-automation-telemetry__group" aria-label="Reliability">
                    <h4 className="adminv2-ws-automation-telemetry__group-title">Reliability</h4>
                    <div className="adminv2-ws-automation-telemetry__group-cells">
                        <div
                            className={`adminv2-ws-automation-telemetry__metric ${successConcern ? "adminv2-ws-automation-telemetry__metric--watch" : ""}`}
                            data-automation-watch={successConcern ? "true" : undefined}
                        >
                            <span className="adminv2-ws-automation-telemetry__metric-label">Success rate (7d)</span>
                            <span
                                className={`adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`}
                            >
                                {kpisLoading ? "—" : kpis.success_rate_last_7d == null ? "—" : `${Math.round(kpis.success_rate_last_7d * 100)}%`}
                            </span>
                        </div>
                        <div
                            className={`adminv2-ws-automation-telemetry__metric ${failuresHot ? "adminv2-ws-automation-telemetry__metric--attention" : ""}`}
                            data-automation-attention={failuresHot ? "true" : undefined}
                        >
                            <span className="adminv2-ws-automation-telemetry__metric-label">Failures (7d)</span>
                            <span
                                className={`adminv2-ws-automation-telemetry__metric-value ${kpisLoading ? "adminv2-ws-automation-telemetry__metric-value--pulse" : ""}`}
                            >
                                {kpisLoading ? "—" : kpis.failed_last_7d}
                            </span>
                        </div>
                    </div>
                </section>
            </div>

            {hasPartitions ?
                <>
                    <WorkflowListSection
                        kicker="Scoped to this work unit"
                        hint="metadata.scope.work_unit_id"
                        rows={scopedWu}
                    />
                    <WorkflowListSection
                        kicker="Scoped to this department"
                        hint="metadata.scope.department_id"
                        rows={scopedDept}
                    />
                    <WorkflowListSection kicker="Org-wide" hint="No department/work-unit scope in metadata" rows={orgWide} />
                    {heuristic.length ?
                        <WorkflowListSection
                            kicker="Enrollment-adjacent (fallback)"
                            hint="Legacy workflows without metadata.scope"
                            rows={heuristic}
                        />
                    : null}
                </>
            : workflows?.length ?
                <WorkflowListSection kicker="In scope" hint="Workflow list" rows={workflows} />
            : null}
        </>
    );

    return (
        <div
            className={`adminv2-ws-automation-telemetry${isWorkUnitSummary ? " adminv2-ws-automation-telemetry--work-unit-summary" : ""}${isWorkUnitSummary && summaryExpanded ? " adminv2-ws-automation-telemetry--work-unit-summary-expanded" : ""}`}
            data-ws-component="automation_telemetry"
            data-ws-automation-telemetry-expanded={isWorkUnitCompact ? (summaryExpanded ? "true" : "false") : undefined}
        >
            {isWorkUnitSummary ?
                <div
                    className="adminv2-ws-automation-telemetry__summary-banner"
                    role="region"
                    aria-label="Workflow telemetry summary"
                >
                    <div className="adminv2-ws-automation-telemetry__summary-primary">
                        <span className="adminv2-ws-automation-telemetry__summary-title">Workflow Telemetry</span>
                        {summaryStats}
                    </div>
                    <button
                        type="button"
                        className="adminv2-ws-automation-telemetry__summary-toggle"
                        aria-expanded={summaryExpanded}
                        onClick={() => setSummaryExpanded((open) => !open)}
                    >
                        {summaryExpanded ? "Collapse" : "Expand"}
                    </button>
                </div>
            :   <header className="adminv2-ws-automation-telemetry__mast">
                    <div className="adminv2-ws-automation-telemetry__mast-primary">
                        <p className="adminv2-ws-automation-telemetry__kicker">Workflow telemetry</p>
                        <h3 className="adminv2-ws-automation-telemetry__title">{title}</h3>
                        <p className="adminv2-ws-automation-telemetry__subtitle">
                            Live runs, reliability, and workflows scoped to this workspace surface.
                        </p>
                    </div>
                    {expandedActions}
                </header>
            }

            {!isWorkUnitCompact ?
                fullDetailsBody
            : showFullDetails ?
                fullDetailsBody
            :   null}
        </div>
    );
}
