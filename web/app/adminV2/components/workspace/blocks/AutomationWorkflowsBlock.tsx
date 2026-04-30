"use client";

import Link from "next/link";
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
};

function humanTrigger(eventType: string | null): string {
    const key = (eventType ?? "").trim().toLowerCase();
    if (key === "opportunity_schedule_tour_followup") return "Runs when a tour is scheduled";
    return "Runs on configured trigger";
}

export function AutomationWorkflowsBlock(props: {
    kpis: AutomationWorkflowKpis;
    workflows: AutomationWorkflowSummaryRow[] | null;
    title?: string;
    href?: string;
    /** When true, numeric stats show placeholders until the first KPI fetch completes. */
    kpisLoading?: boolean;
}) {
    const { kpis, workflows, title = "Automations", href = "/adminV2/workflows", kpisLoading = false } = props;

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
                        Live runs, reliability, and the workflows tied to this workspace surface.
                    </p>
                </div>
                <Link href={href} className="adminv2-ws-automation-telemetry__review">
                    Review
                    <span aria-hidden> →</span>
                </Link>
            </header>

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

            {workflows?.length ? (
                <section className="adminv2-ws-automation-telemetry__workflows" aria-label="Relevant workflows">
                    <div className="adminv2-ws-automation-telemetry__workflows-head">
                        <span className="adminv2-ws-automation-telemetry__workflows-kicker">In scope</span>
                        <span className="adminv2-ws-automation-telemetry__workflows-hint">Configured for this entity</span>
                    </div>
                    <ul className="adminv2-ws-automation-telemetry__workflow-list" role="list">
                        {workflows.slice(0, 4).map((w) => (
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
            ) : null}
        </div>
    );
}
