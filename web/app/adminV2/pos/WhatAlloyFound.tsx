"use client";

/**
 * WhatAlloyFound — the match-DISCOVERY body for the middle Work column (§1).
 *
 * This is where the operator compares "What came in" (the submission) against "What Alloy
 * found" (the existing records it matched) BEFORE deciding. It carries the full discovery:
 * the identity Alloy read, existing parent/person candidates with household + children +
 * status + exact match reasons (expandable in place), and any ambiguity/conflict.
 *
 * Read-only. The decision itself stays in the right rail; this only informs it. The full
 * candidate cards are intentionally NOT duplicated in the rail.
 */

import type { RecommendationView } from "@/app/adminV2/processing/ReviewDecideCard";
import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";
import CandidateMatchCard from "@/app/adminV2/processing/CandidateMatchCard";

function proposedIdentityLine(rec: IntakeRecommendation): string {
    const p = rec.proposed.person;
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    const bits = [name || null, p.email, p.phone].filter(Boolean) as string[];
    return bits.length ? bits.join(" · ") : "No identity fields were mapped on this form.";
}

/** A plain-language conflict/ambiguity note when Alloy could not settle the match itself. */
function ambiguityNote(rec: IntakeRecommendation): string | null {
    if (rec.decision !== "route") return null;
    if (rec.blockers.includes("ambiguous_email")) return "Several existing records share this email — confirm which one is right before linking.";
    if (rec.blockers.includes("ambiguous_phone")) return "Several existing records share this phone — confirm which one is right before linking.";
    if (rec.blockers.includes("missing_identifiers")) return "No email or phone was captured, so Alloy can’t match this to an existing family.";
    return "Alloy couldn’t settle this match automatically — review the candidates below.";
}

export default function WhatAlloyFound({
    rec,
    recLoading,
}: {
    rec: RecommendationView | null;
    recLoading: boolean;
}) {
    if (recLoading && !rec) {
        return (
            <div className="space-y-2" aria-busy="true">
                <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
                <div className="h-10 animate-pulse rounded bg-stone-100" />
            </div>
        );
    }

    if (!rec) {
        return <div className="text-[12.5px] text-stone-400">Alloy hasn’t produced a reading for this case yet.</div>;
    }

    if (!rec.supported) {
        return (
            <div className="text-[12.5px] text-stone-500">
                {rec.reason ?? `Alloy doesn’t match ${rec.sourceKind ?? "this source"} automatically yet — review it manually.`}
            </div>
        );
    }

    const recommendation = rec.recommendation;
    if (!recommendation) {
        return <div className="text-[12.5px] text-stone-400">No matches were produced for this submission.</div>;
    }

    const detailById = new Map((rec.candidateDetails ?? []).map((d) => [d.id, d]));
    const candidates = recommendation.candidates;
    const note = ambiguityNote(recommendation);

    return (
        <div className="space-y-3">
            {/* What Alloy read from the submission — the identity it will match/create on. */}
            <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">Alloy read this as</div>
                <div className="rounded-md border border-stone-200 bg-stone-50/60 px-2.5 py-1.5 text-[12.5px] text-stone-700">
                    {proposedIdentityLine(recommendation)}
                </div>
            </div>

            {/* Ambiguity / conflict, when Alloy could not settle it. */}
            {note ? (
                <div className="rounded-md border border-alloy-gold/40 bg-alloy-gold/[0.12] px-2.5 py-1.5 text-[11.5px] text-alloy-gold-dark">
                    {note}
                </div>
            ) : null}

            {/* Existing records Alloy matched — the heart of the compare. */}
            <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                    Existing records {candidates.length > 0 ? `(${candidates.length})` : ""}
                </div>
                {candidates.length === 0 ? (
                    <div className="text-[12.5px] text-stone-400">
                        {recommendation.decision === "create"
                            ? "No existing family matches — this looks new."
                            : "No existing records matched."}
                    </div>
                ) : (
                    <ul className="space-y-1.5">
                        {candidates.map((c) => (
                            <CandidateMatchCard
                                key={c.id}
                                candidate={c}
                                detail={detailById.get(c.id)}
                                recommended={c.id === recommendation.recommendedCandidateId}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
