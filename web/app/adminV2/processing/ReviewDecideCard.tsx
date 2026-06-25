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

export interface RecommendationView {
    supported: boolean;
    reason?: string;
    sourceKind?: string;
    recommendation?: IntakeRecommendation;
    source?: { kind: string; hasEmailBinding: boolean; mappedPersonValues: number };
}

/** Map the read-model decision to the operator's action vocabulary. */
export const DECISION_TO_ACTION: Record<IntakeDecision, { key: string; label: string }> = {
    link: { key: "link_existing", label: "Link existing" },
    create: { key: "create_new", label: "Create new" },
    route: { key: "route_for_review", label: "Route for review" },
};

const CONFIDENCE_STYLE: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-800",
    medium: "bg-amber-50 text-amber-800",
    low: "bg-amber-50 text-amber-800",
    none: "bg-stone-100 text-stone-600",
};

function decisionHeadline(decision: IntakeDecision): string {
    if (decision === "link") return "Link to an existing record";
    if (decision === "create") return "Create a new record";
    return "Route for human review";
}

function rationale(rec: IntakeRecommendation): string {
    if (rec.blockers.includes("missing_identifiers")) return "No email or phone was captured to match on.";
    if (rec.blockers.includes("ambiguous_email")) return "Several people share this email — confirm which record is right.";
    if (rec.blockers.includes("ambiguous_phone")) return "Several people share this phone — confirm which record is right.";
    if (rec.decision === "link" && rec.matchedOn.includes("email")) return "Matched an existing person by parent email.";
    if (rec.decision === "link" && rec.matchedOn.includes("phone")) return "Matched an existing person by phone.";
    if (rec.decision === "create") return "No existing person matches — Alloy would create a new record.";
    return "Alloy could not settle this automatically.";
}

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
        <section className="mb-5 rounded-lg border border-emerald-200 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700">Review &amp; decide</span>
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
                <ReviewBody rec={view.recommendation} />
            ) : (
                <div className="text-[12.5px] text-stone-500">No recommendation was produced.</div>
            )}
        </section>
    );
}

function ReviewBody({ rec }: { rec: IntakeRecommendation }) {
    const action = DECISION_TO_ACTION[rec.decision];
    const confCls = CONFIDENCE_STYLE[rec.confidence] ?? CONFIDENCE_STYLE.none;
    return (
        <div>
            {/* Recommendation headline + confidence */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#00A283] px-2 py-0.5 text-[11px] font-semibold text-white">
                    Alloy recommends: {action.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${confCls}`}>
                    {rec.confidence === "none" ? "No confidence" : `${rec.confidence} confidence`}
                </span>
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-stone-900">{decisionHeadline(rec.decision)}</div>
            <p className="mt-0.5 text-[12px] text-stone-500">{rationale(rec)}</p>

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
                                        recommended ? "border-emerald-300 bg-emerald-50/60" : "border-stone-200 bg-white"
                                    }`}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-[12.5px] font-medium text-stone-900">{c.label}</span>
                                        <span className="block truncate text-[11px] text-stone-500">Matched on {c.matchReason}</span>
                                    </span>
                                    {recommended ? (
                                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
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
