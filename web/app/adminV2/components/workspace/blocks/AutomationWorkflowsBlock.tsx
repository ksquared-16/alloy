"use client";

import Link from "next/link";

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

export function AutomationWorkflowsBlock(props: {
    kpis: AutomationWorkflowKpis;
    workflows: AutomationWorkflowSummaryRow[] | null;
    title?: string;
    href?: string;
}) {
    const { kpis, workflows, title = "Automations", href = "/adminV2/workflows" } = props;

    const statCard =
        "rounded-lg border border-alloy-stone/15 bg-white px-3 py-2 shadow-sm ring-1 ring-alloy-stone/5";
    const statK = "text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const statV = "mt-0.5 text-lg font-bold tabular-nums text-alloy-forge";

    return (
        <div className="rounded-xl border border-admin-border bg-admin-surface-card px-4 py-3 shadow-sm ring-1 ring-alloy-stone/5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-alloy-forge">{title}</div>
                    <div className="text-[12px] text-alloy-forge/60">Visibility into what’s running for Enrollment.</div>
                </div>
                <Link href={href} className="shrink-0 text-sm font-semibold text-alloy-blue hover:underline">
                    Review
                </Link>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className={statCard}>
                    <div className={statK}>Runs today</div>
                    <div className={statV}>{kpis.runs_today}</div>
                </div>
                <div className={statCard}>
                    <div className={statK}>Success rate (7d)</div>
                    <div className={statV}>
                        {kpis.success_rate_last_7d == null ? "—" : `${Math.round(kpis.success_rate_last_7d * 100)}%`}
                    </div>
                </div>
                <div className={statCard}>
                    <div className={statK}>Failures (7d)</div>
                    <div className={statV}>{kpis.failed_last_7d}</div>
                </div>
                <div className={statCard}>
                    <div className={statK}>Running (7d)</div>
                    <div className={statV}>{kpis.running_last_7d}</div>
                </div>
            </div>

            {workflows?.length ? (
                <div className="mt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/50">Relevant</div>
                    <div className="mt-1 divide-y divide-alloy-stone/10 rounded-lg border border-alloy-stone/15 bg-white">
                        {workflows.slice(0, 4).map((w) => (
                            <div key={w.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                    <div className="truncate font-semibold text-alloy-forge">{w.name ?? w.id}</div>
                                    <div className="truncate text-[12px] text-alloy-forge/60">
                                        Trigger: {w.event_type ?? "—"} · Steps: {w.steps_count}
                                    </div>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                        w.enabled === false
                                            ? "bg-alloy-stone/15 text-alloy-midnight/60"
                                            : "bg-alloy-blue/10 text-alloy-blue"
                                    }`}
                                >
                                    {w.enabled === false ? "Disabled" : "Enabled"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

