"use client";

/**
 * POS Incoming — Column 3, the case detail spine (bottom half):
 *   Decide → Approve → Result
 *
 * Decision support reuses ReviewDecideCard (FP8a recommendation). The approve action is
 * the EXISTING approve handoff (unchanged) — honestly gated: when there is no
 * recommendation yet, it reads "not ready yet" instead of pretending. Unbuilt
 * alternative decisions are not shown (no near-available placeholders).
 */

import { useEffect, useState } from "react";
import ReviewDecideCard, { DECISION_TO_ACTION } from "@/app/adminV2/processing/ReviewDecideCard";
import { approveButtonLabel, resolveDecisionPresentation } from "@/lib/pos/decisionPresentation";
import { buildMatchedRecords } from "@/lib/pos/matchedRecordsPresentation";
import { buildCommitPlanLines } from "@/lib/pos/commitPlanSummary";
import { buildApprovalResultView } from "@/lib/pos/approvalResultPresentation";
import WorkspaceActionBar from "@/components/workspace/WorkspaceActionBar";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import PosIdentityReviewOverlay from "./PosIdentityReviewOverlay";
import type { PosCaseState } from "./usePosCase";

/**
 * The completed conclusion of the conversation (§ completed-state). One calm card — a title, the
 * concrete ✓ outcomes, and "Complete." — so the operator never wonders what happened. Fades in on
 * mount rather than snapping. No duplicated success screens; this IS the final Result.
 */
function ConclusionCard({ title, lines }: { title: string; lines: string[] }) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);
    return (
        <div
            className={`rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] p-3.5 transition-all duration-500 ${
                shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
        >
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-[15px] text-alloy-bend-pine">✓</span>
                <span className="text-[14px] font-semibold text-alloy-midnight">{title}</span>
            </div>
            {lines.length > 0 ? (
                <ul className="mt-2 space-y-1">
                    {lines.map((l, i) => (
                        <li key={i} className="flex items-baseline gap-1.5 text-[12.5px] text-alloy-midnight">
                            <span aria-hidden className="text-alloy-bend-pine">✓</span>
                            <span>{l}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
            <div className="mt-2.5 text-[11.5px] font-medium text-alloy-bend-pine/70">Complete.</div>
        </div>
    );
}

export default function PosCaseDecisionColumn({ state }: { state: PosCaseState }) {
    const { detail, evidence, rec, recLoading, approve, approving, approveErr, approveResult, needsIdentityReview, reviewEligible, refreshAfterReview, isClosed } = state;
    const [reviewOpen, setReviewOpen] = useState(false);
    if (!detail) return null;

    const recommendedActionKey = rec?.supported && rec.recommendation ? DECISION_TO_ACTION[rec.recommendation.decision].key : null;
    // Approve label in business language: "Approve — Create enrollment lead" / "Approve — Link existing".
    const approveLabel =
        rec?.supported && rec.recommendation
            ? approveButtonLabel(resolveDecisionPresentation({ recommendation: rec.recommendation, intent: rec.intent ?? null }))
            : null;
    const commitAvailable = !!recommendedActionKey;
    // Approve is offered only when the identity guard says every required subject is settled.
    // false = subjects still need a decision → the operator resolves them in "Review matches" first.
    const reviewRequired = reviewEligible === false || needsIdentityReview;

    // Concise "Approval will:" plan for the rail — derived from the same honest matched-record
    // cards the middle column shows, so the rail never promises a plan the records don't support.
    const submitted = evidence.flatMap((e) => e.proposedValues).map((v) => ({ label: v.label, value: v.value ?? null }));
    const matchedCards =
        rec?.supported && rec.recommendation
            ? buildMatchedRecords({ recommendation: rec.recommendation, intent: rec.intent ?? null, submitted })
            : [];
    const planLines = matchedCards.length ? buildCommitPlanLines(matchedCards) : [];

    // §5 — after approval, the honest "Linked / Created / Updated" result: created lines gated on
    // the real committed record ids the server returned, linked lines on the link decision.
    const recommendedCandidate =
        rec?.recommendation?.recommendedCandidateId
            ? (rec.candidateDetails ?? []).find((d) => d.id === rec.recommendation!.recommendedCandidateId) ?? null
            : null;
    const submittedZip = submitted.find((v) => /\b(zip|postal)\b/i.test(v.label))?.value ?? null;
    const leadRecords = approveResult && "records" in approveResult ? approveResult.records ?? null : null;
    // Only render the rich Linked/Created/Updated result when we hold the ACTUAL committed records
    // from this approval (immediately after approving). On a re-opened completed case we no longer
    // have them, and the live recommendation would re-resolve to "link" (the records now exist) —
    // deriving a result from that would falsely read "Linked" for records we in fact created. In
    // that case we fall back to a neutral completion note rather than show a misleading result.
    // (Persisting a human result summary server-side for re-open is a tracked follow-up.)
    const resultView =
        isClosed && leadRecords
            ? buildApprovalResultView({
                  cards: matchedCards,
                  records: leadRecords,
                  linkedParentName: recommendedCandidate?.fullName ?? null,
                  linkedHouseholdName: recommendedCandidate?.householdName ?? null,
                  submittedZip,
              })
            : null;

    // The completed conclusion: a human title + concrete ✓ outcomes (Linked / Created / Updated).
    const conclusionTitle = leadRecords ? "Family confirmed" : "Completed";
    const conclusionLines = resultView
        ? [
              ...resultView.linked.map((l) => `Linked ${l.primary}`),
              ...resultView.created.map((l) => `Created ${l.primary}`),
              ...resultView.updated.map((l) => `Updated ${l.primary}`),
          ]
        : [];

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* Before approval: the recommendation + concise plan. After: one calm conclusion
                    (title + ✓ outcomes + "Complete."), the natural end of the conversation (§5 + completed). */}
                {!isClosed ? (
                    <>
                        <ReviewDecideCard view={rec} loading={recLoading} compact planLines={planLines} />
                        <p className="px-1 text-[11px] leading-snug text-alloy-midnight/40">
                            Saved or linked records appear here after you approve.
                        </p>
                    </>
                ) : (
                    <ConclusionCard key={detail.id} title={conclusionTitle} lines={conclusionLines} />
                )}
            </div>

            {/* Approve bar */}
            {!isClosed ? (
                <WorkspaceActionBar eyebrow="Decide">
                    {reviewRequired ? (
                        <div className="mb-2 rounded-md border border-alloy-gold/40 bg-alloy-gold/[0.12] px-2.5 py-1.5 text-[11px] text-alloy-gold-dark">
                            <div className="font-semibold">Some matches need your review</div>
                            <p className="mt-0.5 leading-snug">
                                A record couldn’t be settled automatically. Review the matches to accept a record, choose another,
                                create new, or mark it unresolved before approving. Nothing has been saved.
                            </p>
                        </div>
                    ) : null}
                    {approveResult?.kind === "needs_mapping" ? (
                        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                            Can’t save yet — {approveResult.note}
                        </div>
                    ) : null}
                    {approveErr ? <div className="mb-2 text-[11px] text-amber-700">{approveErr}</div> : null}
                    {commitAvailable ? (
                        <div className="space-y-2">
                            {/* Review matches — the existing identity-review model, inside the Mailroom.
                                Primary when a subject still needs a decision, a quiet secondary otherwise. */}
                            <button
                                type="button"
                                onClick={() => setReviewOpen(true)}
                                className={
                                    reviewRequired
                                        ? `${WS_ACTION_PRIMARY} w-full`
                                        : "w-full rounded-md border border-alloy-stone/25 px-3 py-2 text-[12px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                                }
                            >
                                Review matches
                            </button>
                            {/* Approve — the single commit path; gated until every required identity is resolved. */}
                            <button
                                type="button"
                                disabled={approving || reviewRequired}
                                onClick={() => void approve()}
                                title={reviewRequired ? "Resolve the matches to approve" : undefined}
                                className={
                                    reviewRequired
                                        ? "w-full cursor-not-allowed rounded-md border border-alloy-stone/20 bg-alloy-stone/40 px-3 py-2 text-center text-[11.5px] text-alloy-midnight/45"
                                        : `${WS_ACTION_PRIMARY} w-full`
                                }
                            >
                                {approving ? "Saving…" : reviewRequired ? "Resolve matches to approve" : approveLabel}
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/40 px-3 py-2 text-center text-[11.5px] text-alloy-midnight/45">
                            Not ready yet — Alloy is still reading this.
                        </div>
                    )}
                </WorkspaceActionBar>
            ) : null}

            {reviewOpen ? (
                <PosIdentityReviewOverlay
                    caseId={detail.id}
                    candidateProfiles={(rec?.candidateDetails ?? []).map((d) => ({
                        id: d.id,
                        email: d.email,
                        phone: d.phone,
                        zip: d.zip,
                        household: d.householdName,
                        children: d.children,
                        status: d.status,
                        lastActivity: d.lastUpdated,
                    }))}
                    submittedZip={submittedZip}
                    onChanged={() => void refreshAfterReview()}
                    onClose={() => {
                        setReviewOpen(false);
                        void refreshAfterReview();
                    }}
                />
            ) : null}
        </div>
    );
}
