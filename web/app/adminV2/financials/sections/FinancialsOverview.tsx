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

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { useMemo } from "react";

import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";
import {
    WorkspaceOverviewActivityBand,
    WorkspaceOverviewStack,
} from "@/components/workspace/WorkspaceOverviewLayout";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import type { ProcessCardAccent, ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type {
    FinancialsOverviewMetric,
    FinancialsReadState,
    FinancialsOverviewMetrics,
} from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialActivityFeed } from "@/lib/financials/workspace/resolveFinancialActivity";
import { moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsWorkSection } from "@/app/adminV2/financials/financialsSections";

/**
 * The headline four: what money is doing right now, and what moved in the window.
 *
 * ── ACCENT IS MEANING, NEVER DECORATION ────────────────────────────────────────────────────────
 *
 * These rendered with `accent: null` and `status: "ok"` on all four, so the KPI primitive drew
 * every tile identically and the surface read as a table of four numbers. The primitive has
 * carried identity accents and operational status all along; Financials simply never said which.
 *
 * Each accent is a closed-set Alloy token, chosen for what the figure MEANS:
 *   ember    money owed to us and not yet collectible — the attention figure
 *   gold     money we may act on right now
 *   midnight what was billed, a neutral record of activity
 *   pine     money that actually arrived
 *
 * `status` is separate and is computed per tile from the figure itself, so a zero Outstanding is
 * healthy and a positive one is worth a glance. Nothing here derives a money value; the tiles still
 * render `formatted_value` exactly as the metric engine produced it.
 */
const HEADLINE: Array<{ key: string; icon: ProcessCardIcon; accent: ProcessCardAccent; attentionWhenPositive?: boolean }> = [
    { key: "financials.outstanding_amount", icon: "chart", accent: "ember", attentionWhenPositive: true },
    { key: "financials.currently_collectible_amount", icon: "bolt", accent: "gold", attentionWhenPositive: true },
    { key: "financials.gross_charges_posted_amount", icon: "clipboard", accent: "midnight" },
    { key: "financials.payments_received_amount", icon: "spark", accent: "pine" },
];

/**
 * Whether a tile is worth a glance, from the engine's own number.
 *
 * `value` is the metric engine's, read and compared — never recomputed. A comparison against zero
 * is not arithmetic on money: no figure is added, netted or bounded, and the formatted string the
 * operator reads is untouched.
 */
function kpiStatus(metric: FinancialsOverviewMetric | undefined, attentionWhenPositive?: boolean): string {
    if (!metric || metric.value == null) return "unknown";
    if (!attentionWhenPositive) return "healthy";
    return metric.value > 0 ? "warning" : "healthy";
}

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
            {/*
             * NOT "TODAY'S ACTIVITY", which is the band's default eyebrow and is false here.
             * Outstanding and Collectible now are positions, not a day's movement — they are what
             * money is doing at this instant, over whatever window the metric pack resolved. A
             * heading that says today would put a window on figures that do not have one.
             */}
            <WorkspaceOverviewActivityBand
                eyebrow="Money right now"
                testId="financials-overview-activity-kpis"
                busy={metrics.loading}
            >
                {HEADLINE.map(({ key, icon, accent, attentionWhenPositive }, index) => {
                    const metric = resolved.get(key);
                    return (
                        <SurfaceHeaderKpiCard
                            key={key}
                            kpi={{
                                slot: index + 1,
                                label: metric?.label ?? "—",
                                icon,
                                accent,
                                /* The engine's own string. Never re-formatted here. */
                                formattedValue: metric?.formatted_value ?? "—",
                                status: kpiStatus(metric, attentionWhenPositive),
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
                        /* The engine's own value, compared against zero. Nothing is recomputed. */
                        const waiting = (metric?.value ?? 0) > 0;
                        return (
                            /*
                             * ── A DECISION ROW READS AS A DECISION ─────────────────────────────
                             *
                             * These were grey text on white with a grey button, four identical
                             * rows, and nothing on them said which one actually wanted attention.
                             * The left rail now carries the state: ember when there is something
                             * to pick up, quiet when there is not. Same tokens the account surface
                             * uses, so a Financials operator learns one vocabulary.
                             */
                            <div
                                key={key}
                                className={`flex items-center justify-between gap-3 rounded-lg border border-l-[3px] border-alloy-stone/15 px-3 py-2 ${
                                    waiting ? "border-l-alloy-ember bg-alloy-ember/[0.03]" : "border-l-alloy-stone/30"
                                }`}
                                data-financials-overview-exception={key}
                                data-financials-exception-state={metrics.loading && !metric ? "pending" : waiting ? "waiting" : "clear"}
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-alloy-midnight">
                                        {/*
                                          * PENDING IS NOT THE SAME ANSWER AS NONE.
                                          *
                                          * These rows rendered "— · —" while the metric pack was in
                                          * flight, which reads as "there is nothing here" at exactly
                                          * the moment the truth is "we do not know yet". The KPI
                                          * tiles above already reserve their geometry and stay quiet;
                                          * this does the same instead of asserting an empty figure.
                                          */}
                                        {metrics.loading && !metric ? (
                                            <span
                                                aria-hidden
                                                data-settlement-reserved="exception"
                                                className="inline-block h-[14px] w-24 rounded bg-alloy-midnight/[0.06] align-middle"
                                            />
                                        ) : (
                                            <>
                                                <span className={`text-[15px] font-semibold tabular-nums ${
                                                    waiting ? "text-alloy-ember" : "text-alloy-midnight"
                                                }`}>
                                                    {metric?.formatted_value ?? "—"}
                                                </span>
                                                <span className="ml-2 text-alloy-midnight/70">{metric?.label ?? "—"}</span>
                                            </>
                                        )}
                                    </p>
                                    <p className="mt-0.5 text-xs text-alloy-midnight/55">{why}</p>
                                </div>
                                {/*
                                  * THE ACTIONABLE ONE IS A PRIMARY ACTION, in the language the
                                  * rest of Alloy already uses for primary actions.
                                  *
                                  * It was `bg-alloy-midnight` — navy — which is the colour this
                                  * product uses for chrome and headers, not for the thing an
                                  * operator is being asked to do. Financials configuration has
                                  * spoken Bend Pine for primary actions since Slice 3, so an
                                  * operator moving between the two surfaces met two different
                                  * languages for the same idea.
                                  *
                                  * The token comes from the shared primitive rather than a green
                                  * written here: a Financials-only green would be the same
                                  * divergence again, pointing the other way.
                                  *
                                  * A section with nothing waiting keeps its quiet treatment. It is
                                  * not disabled — an operator may always go and look — but it is
                                  * not asking for anything either, and painting it Bend Pine for
                                  * visual consistency would make four identical calls to action
                                  * out of one real one.
                                  */}
                                {waiting ? (
                                    <ConfigurationPrimaryButton
                                        onClick={() => onOpenSection(section)}
                                        data-financials-overview-open={section}
                                        className="shrink-0 whitespace-nowrap"
                                    >
                                        {cta}
                                    </ConfigurationPrimaryButton>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onOpenSection(section)}
                                        data-financials-overview-open={section}
                                        className="shrink-0 whitespace-nowrap rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/70 shadow-sm transition hover:bg-alloy-stone/[0.08]"
                                    >
                                        {cta}
                                    </button>
                                )}
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
                        /*
                         * ── FOUR FACTS, FOUR PLACES ────────────────────────────────────────────
                         *
                         * This was one truncated sentence and one grey figure, so an operator
                         * scanning for "what did the Alvarez family pay" had to read every row as
                         * prose. Type, household, amount and date now hold fixed positions, and
                         * money in and money out are told apart by a direction marker rather than
                         * by reading the label — and by a marker rather than by colouring the money,
                         * because a sign is a direction and not a verdict. Nothing is summed: an
                         * arbitrary recent slice of deltas is not a balance.
                         */
                        recent.map((row) => {
                            const inbound = row.amountCents < 0;
                            return (
                                <div
                                    key={row.entryId}
                                    className="flex items-center gap-3 border-b border-alloy-stone/10 py-1.5 last:border-b-0"
                                    data-financials-overview-recent-row={row.entryId}
                                >
                                    <span
                                        aria-hidden
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${inbound ? "bg-alloy-bend-pine" : "bg-alloy-midnight/35"}`}
                                        data-financials-movement-direction={inbound ? "in" : "out"}
                                    />
                                    <span className="w-[8.5rem] shrink-0 truncate text-[12px] text-alloy-midnight/70">
                                        {row.label}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[13px] text-alloy-midnight">
                                        {row.householdName ?? "—"}
                                    </span>
                                    {/*
                                     * THE MONEY IS NOT COLOURED BY ITS SIGN.
                                     *
                                     * This read Bend Pine for any negative amount, which taught an
                                     * operator that negative is good — and a negative amount is
                                     * simply a direction. A credit reducing an obligation, a refund
                                     * and a reversal are all negative and none is a verdict. The
                                     * DIRECTION dot beside the row still says in or out, because
                                     * that is what direction is for; the figure reads as a figure.
                                     */}
                                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-alloy-midnight">
                                        {moneyExact(row.amountCents, row.currencyCode)}
                                    </span>
                                    <span className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-alloy-midnight/45">
                                        {shortDate(row.postedAt)}
                                    </span>
                                </div>
                            );
                        })
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
