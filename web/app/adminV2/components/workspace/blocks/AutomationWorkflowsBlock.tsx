"use client";

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
}) {
    const {
        kpis,
        workflows = null,
        partitions = null,
        title = "Automations",
        href = "/adminV2/workflows",
        kpisLoading = false,
        metadataAssociationNote = null,
        workflowAssistHref = null,
        onAskWorkflowAssist = null,
    } = props;

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

    return (
        <div className="adminv2-ws-automation-telemetry" data-ws-component="automation_telemetry">
            <header className="adminv2-ws-automation-telemetry__mast">
                <div className="adminv2-ws-automation-telemetry__mast-primary">
                    <p className="adminv2-ws-automation-telemetry__kicker">Workflow telemetry</p>
                    <h3 className="adminv2-ws-automation-telemetry__title">{title}</h3>
                    <p className="adminv2-ws-automation-telemetry__subtitle">
                        Live runs, reliability, and workflows scoped to this workspace surface.
                    </p>
                </div>
                <div className="adminv2-ws-automation-telemetry__mast-actions">
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
            </header>

            {associationNote ?
                <p className="adminv2-ws-automation-telemetry__association-note" data-ws-automation-metadata-gap="true">
                    {associationNote}
                </p>
            : null}

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
        </div>
    );
}
