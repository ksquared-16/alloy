"use client";

/**
 * POS — "Review & Decide" card (the core POS operator moment).
 *
 * Renders the match-first recommendation for a Processing case so the operator can
 * SEE: what Alloy extracted (proposed identity), which existing records match, what
 * Alloy recommends (link / create / route), and how confident it is.
 *
 * 100% READ-ONLY and reuses the EXISTING recommendation read model
 * (`GET /api/admin/processing/cases/[caseId]/recommendation`, FP8a → `resolveIntakeIdentity`).
 * No matching logic is duplicated here; this component only presents it. The actual
 * decision/execution stays in the docked action bar's Approve path (unchanged).
 */

import type { IntakeRecommendation, IntakeDecision } from "@/lib/forms/intake/resolveIntakeIdentity";
import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";
import {
    resolveDecisionPresentation,
    type DecisionReadinessTone,
} from "@/lib/pos/decisionPresentation";

export interface RecommendationView {
    supported: boolean;
    reason?: string;
    sourceKind?: string;
    recommendation?: IntakeRecommendation;
    /** Configured operational intent of the source form — drives business decision language. */
    intent?: OperationalIntentKey | null;
    source?: { kind: string; hasEmailBinding: boolean; mappedPersonValues: number };
}

/** Map the read-model decision to a stable action key (engine vocabulary, not shown to the operator). */
export const DECISION_TO_ACTION: Record<IntakeDecision, { key: string; label: string }> = {
    link: { key: "link_existing", label: "Link existing" },
    create: { key: "create_new", label: "Create new" },
    route: { key: "route_for_review", label: "Route for review" },
};

/** Readiness label styling — semantic tone, never raw scores. */
const READINESS_STYLE: Record<DecisionReadinessTone, string> = {
    ready: "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine",
    match: "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine",
    review: "bg-alloy-gold/[0.18] text-alloy-gold-dark",
    neutral: "bg-alloy-stone/50 text-alloy-midnight/60",
};

function proposedIdentityLine(rec: IntakeRecommendation): string {
    const p = rec.proposed.person;
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    const bits = [name || null, p.email, p.phone].filter(Boolean) as string[];
    return bits.length ? bits.join(" · ") : "No identity fields were mapped on this form.";
}

export default function ReviewDecideCard({
    view,
    loading,
}: {
    view: RecommendationView | null;
    loading: boolean;
}) {
    return (
        <section className="mb-5 rounded-lg border border-alloy-bend-pine/25 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-alloy-bend-pine">Review &amp; decide</span>
                {loading ? <span className="text-[10.5px] text-stone-400">Analyzing…</span> : null}
            </div>

            {loading ? (
                <div className="space-y-2" aria-busy="true">
                    <div className="h-5 w-1/2 animate-pulse rounded bg-stone-100" />
                    <div className="h-10 animate-pulse rounded bg-stone-100" />
                </div>
            ) : !view ? (
                <div className="text-[12.5px] text-stone-500">Recommendation unavailable for this case.</div>
            ) : !view.supported ? (
                <div>
                    <div className="text-[13.5px] font-medium text-stone-900">Manual review</div>
                    <p className="mt-0.5 text-[12px] text-stone-500">
                        {view.reason ?? `Recommendations don’t cover ${view.sourceKind ?? "this source"} yet — handle it manually.`}
                    </p>
                </div>
            ) : view.recommendation ? (
                <ReviewBody rec={view.recommendation} intent={view.intent ?? null} />
            ) : (
                <div className="text-[12.5px] text-stone-500">No recommendation was produced.</div>
            )}
        </section>
    );
}

function ReviewBody({ rec, intent }: { rec: IntakeRecommendation; intent: OperationalIntentKey | null }) {
    const p = resolveDecisionPresentation({ recommendation: rec, intent });
    const readinessCls = READINESS_STYLE[p.readiness.tone];
    return (
        <div>
            {/* Recommendation headline + readiness (business language) */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-alloy-bend-pine px-2 py-0.5 text-[11px] font-semibold text-white">
                    Alloy recommends: {p.recommendsLabel}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${readinessCls}`}>
                    {p.readiness.label}
                </span>
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-alloy-midnight">{p.headline}</div>
            <p className="mt-0.5 text-[12px] text-stone-500">{p.readiness.detail}</p>

            {/* Extracted identity */}
            <div className="mt-3">
                <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">From this submission</div>
                <div className="rounded-md border border-stone-200 bg-stone-50/60 px-2.5 py-1.5 text-[12.5px] text-stone-700">
                    {proposedIdentityLine(rec)}
                </div>
            </div>

            {/* Existing match candidates */}
            <div className="mt-3">
                <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">
                    Existing match candidates {rec.candidates.length > 0 ? `(${rec.candidates.length})` : ""}
                </div>
                {rec.candidates.length === 0 ? (
                    <div className="text-[12.5px] text-stone-400">
                        {rec.decision === "create" ? "None — this looks new." : "None found."}
                    </div>
                ) : (
                    <ul className="space-y-1.5">
                        {rec.candidates.map((c) => {
                            const recommended = c.id === rec.recommendedCandidateId;
                            return (
                                <li
                                    key={c.id}
                                    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                                        recommended ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/[0.07]" : "border-stone-200 bg-white"
                                    }`}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-[12.5px] font-medium text-stone-900">{c.label}</span>
                                        <span className="block truncate text-[11px] text-stone-500">Matched on {c.matchReason}</span>
                                    </span>
                                    {recommended ? (
                                        <span className="shrink-0 rounded bg-alloy-bend-pine/[0.14] px-1.5 py-0.5 text-[10px] font-semibold text-alloy-bend-pine">
                                            Recommended
                                        </span>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
