"use client";

/**
 * FINANCIALS OVERVIEW — the landing page, and the money is real.
 *
 * Every figure here is a registered Financials metric resolved by the Operational Intelligence
 * metric engine and delivered by `/api/admin/financials/overview-metrics`. Nothing on this
 * surface computes, totals, nets or defaults a money value: the tiles render
 * `formatted_value` exactly as the engine produced it, and the component could not disagree with
 * the account card if it tried.
 *
 * ── WHAT THE TILES SAY, AND WHAT THEY DELIBERATELY DO NOT ──
 *
 * The headline is what money is doing: Outstanding, Collectible now, what was billed in the
 * window, and what arrived. Beneath it sits the exception band — unapplied money, unresolved
 * subsidy variance, and charges still waiting to be posted — because those are the three things
 * an operator can actually pick up and act on.
 *
 * There is no "Revenue" tile and no P&L. Posted charges are billed amounts; recognised revenue
 * needs a recognition policy, deferral and a chart of accounts that the childcare spine does not
 * have. A tile is exactly where a false accounting semantic would take hold, so the words are
 * absent rather than approximated.
 *
 * ── SCOPE AND BOUNDS ARE STATED, NOT ASSUMED ──
 *
 * The scope line names what the numbers obey. When a projection hit its scan cap the surface
 * says so, because a bounded total presenting itself as org truth is the specific way a money
 * figure lies.
 */

import { useMemo } from "react";

import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";
import {
    WorkspaceOverviewActivityBand,
    WorkspaceOverviewStack,
} from "@/components/workspace/WorkspaceOverviewLayout";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import type { ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type {
    FinancialsOverviewMetric,
    FinancialsReadState,
    FinancialsOverviewMetrics,
} from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialActivityFeed } from "@/lib/financials/workspace/resolveFinancialActivity";
import { moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsWorkSection } from "@/app/adminV2/financials/financialsSections";

/** The headline four: what money is doing right now, and what moved in the window. */
const HEADLINE: Array<{ key: string; icon: ProcessCardIcon }> = [
    { key: "financials.outstanding_amount", icon: "chart" },
    { key: "financials.currently_collectible_amount", icon: "bolt" },
    { key: "financials.gross_charges_posted_amount", icon: "clipboard" },
    { key: "financials.payments_received_amount", icon: "spark" },
];

/** The exception band: money or work an operator can pick up, each pointing at its section. */
const EXCEPTIONS: Array<{ key: string; section: FinancialsWorkSection; cta: string; why: string }> = [
    {
        key: "financials.charges_awaiting_post_count",
        section: "charges",
        cta: "Review charges",
        why: "Drafts do not owe anything until they are posted.",
    },
    {
        key: "financials.unapplied_payments_amount",
        section: "payments",
        cta: "Review payments",
        why: "Money that arrived and is not settling any obligation yet.",
    },
    {
        key: "financials.unresolved_subsidy_variance_amount",
        section: "subsidy",
        cta: "Review subsidy",
        why: "An agency paid something other than what was claimed, and nobody has decided what happens.",
    },
];

function byKey(metrics: FinancialsOverviewMetric[] | undefined) {
    const map = new Map<string, FinancialsOverviewMetric>();
    for (const metric of metrics ?? []) map.set(metric.metric_key, metric);
    return map;
}

/** True when any projection behind these figures stopped at its scan cap. */
function anyTruncated(metrics: FinancialsOverviewMetric[] | undefined): boolean {
    return (metrics ?? []).some((m) => m.meta?.truncated === true);
}

/** How many recent events the landing page shows before it stops being a landing page. */
const RECENT_LIMIT = 5;

export default function FinancialsOverview({
    metrics,
    activity,
    scopeLabel,
    onOpenSection,
}: {
    metrics: FinancialsReadState<FinancialsOverviewMetrics>;
    activity: FinancialsReadState<FinancialActivityFeed>;
    scopeLabel: string;
    onOpenSection: (section: FinancialsWorkSection) => void;
}) {
    const resolved = useMemo(() => byKey(metrics.data?.metrics), [metrics.data]);
    const truncated = anyTruncated(metrics.data?.metrics);
    const recent = useMemo(() => (activity.data?.rows ?? []).slice(0, RECENT_LIMIT), [activity.data]);

    return (
        <WorkspaceOverviewStack data-testid="financials-overview">
            <WorkspaceOverviewActivityBand testId="financials-overview-activity-kpis" busy={metrics.loading}>
                {HEADLINE.map(({ key, icon }, index) => {
                    const metric = resolved.get(key);
                    return (
                        <SurfaceHeaderKpiCard
                            key={key}
                            kpi={{
                                slot: index + 1,
                                label: metric?.label ?? "—",
                                icon,
                                accent: null,
                                /* The engine's own string. Never re-formatted here. */
                                formattedValue: metric?.formatted_value ?? "—",
                                status: "ok",
                                sourceKey: key,
                                drillHref: null,
                                pending: metrics.loading && !metric,
                            }}
                            variant="work-unit"
                            density="compact"
                        />
                    );
                })}
            </WorkspaceOverviewActivityBand>

            {metrics.error ? (
                <WorkspaceCard>
                    <p className="text-xs text-alloy-ember" data-financials-overview-error="true">
                        {metrics.error}
                    </p>
                </WorkspaceCard>
            ) : null}

            <WorkspaceCard>
                <div className="flex flex-col gap-2.5" data-financials-overview-exceptions="true">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Needs a decision
                    </p>
                    {EXCEPTIONS.map(({ key, section, cta, why }) => {
                        const metric = resolved.get(key);
                        return (
                            <div
                                key={key}
                                className="flex items-center justify-between gap-3 rounded-lg border border-alloy-stone/15 px-3 py-2"
                                data-financials-overview-exception={key}
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-alloy-midnight">
                                        <span className="font-semibold tabular-nums">{metric?.formatted_value ?? "—"}</span>
                                        {" · "}
                                        {metric?.label ?? "—"}
                                    </p>
                                    <p className="mt-0.5 text-xs text-alloy-midnight/55">{why}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onOpenSection(section)}
                                    data-financials-overview-open={section}
                                    className="shrink-0 whitespace-nowrap rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/[0.08]"
                                >
                                    {cta}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </WorkspaceCard>

            {/*
              * ── WHAT MOVED ────────────────────────────────────────────────────────────────────
              *
              * A landing page that shows only totals answers "how much" and never "what happened".
              * These are the same rows the Activity section renders, at a shorter density and
              * capped — one read model shown twice, not a second history, and deliberately NOT
              * summed: an arbitrary recent slice of deltas is not a balance, and the balance is
              * owned above.
              */}
            <WorkspaceCard>
                <div className="flex flex-col gap-2" data-financials-overview-recent="true">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            Recent money movement
                        </p>
                        {recent.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => onOpenSection("activity")}
                                data-financials-overview-open="activity"
                                className="shrink-0 whitespace-nowrap rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/[0.08]"
                            >
                                All activity
                            </button>
                        ) : null}
                    </div>
                    {activity.loading && recent.length === 0 ? (
                        <p className="text-xs text-alloy-midnight/50">Loading recent activity…</p>
                    ) : recent.length === 0 ? (
                        /* A calm nothing-happened, not a row of dashes. */
                        <p className="text-xs text-alloy-midnight/55">
                            Nothing has been posted, paid or corrected for {scopeLabel.toLowerCase()} yet.
                        </p>
                    ) : (
                        recent.map((row) => (
                            <div
                                key={row.entryId}
                                className="flex items-baseline justify-between gap-3 border-b border-alloy-stone/10 pb-1.5 last:border-b-0 last:pb-0"
                                data-financials-overview-recent-row={row.entryId}
                            >
                                <span className="min-w-0 truncate text-sm text-alloy-midnight">
                                    {/* The operator's words for the event, and whose money it was. */}
                                    {row.label}
                                    {row.householdName ? ` · ${row.householdName}` : ""}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-alloy-midnight/60">
                                    {moneyExact(row.amountCents, row.currencyCode)} · {shortDate(row.postedAt)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </WorkspaceCard>

            <WorkspaceCard>
                <p className="text-xs text-alloy-midnight/60" data-financials-overview-scope="true">
                    {/* The scope is stated because every figure above obeys it. */}
                    {scopeLabel} · figures resolved from the Financials metric pack.
                    {truncated ? (
                        <span data-financials-overview-truncated="true">
                            {" "}
                            One or more figures reached the read cap and are a bounded view, not an organization total.
                        </span>
                    ) : null}
                </p>
            </WorkspaceCard>
        </WorkspaceOverviewStack>
    );
}
