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

import ReviewDecideCard, { DECISION_TO_ACTION } from "@/app/adminV2/processing/ReviewDecideCard";
import { approveButtonLabel, resolveDecisionPresentation } from "@/lib/pos/decisionPresentation";
import { buildMatchedRecords } from "@/lib/pos/matchedRecordsPresentation";
import { buildCommitPlanLines } from "@/lib/pos/commitPlanSummary";
import { buildApprovalResultView, type ApprovalResultLine } from "@/lib/pos/approvalResultPresentation";
import WorkspaceActionBar from "@/components/workspace/WorkspaceActionBar";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import PosPanel from "./PosPanel";
import { POS_STATUS_LABELS } from "./posSections";
import type { PosCaseState } from "./usePosCase";

function statusLabel(s: string): string {
    return POS_STATUS_LABELS[s] ?? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** One "Linked / Created / Updated" group — rendered only when it has lines. */
function ResultGroup({ title, lines }: { title: string; lines: ApprovalResultLine[] }) {
    if (lines.length === 0) return null;
    return (
        <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{title}</div>
            <ul className="space-y-1">
                {lines.map((l, i) => (
                    <li key={i} className="flex items-baseline gap-1.5 text-[12.5px] text-alloy-midnight">
                        <span aria-hidden className="text-alloy-bend-pine">•</span>
                        <span>
                            {l.primary}
                            {l.secondary ? <span className="text-alloy-midnight/50"> — {l.secondary}</span> : null}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function PosCaseDecisionColumn({ state }: { state: PosCaseState }) {
    const { detail, evidence, rec, recLoading, approve, approving, approveErr, approveResult, needsIdentityReview, isClosed } = state;
    if (!detail) return null;

    const recommendedActionKey = rec?.supported && rec.recommendation ? DECISION_TO_ACTION[rec.recommendation.decision].key : null;
    // Approve label in business language: "Approve — Create enrollment lead" / "Approve — Link existing".
    const approveLabel =
        rec?.supported && rec.recommendation
            ? approveButtonLabel(resolveDecisionPresentation({ recommendation: rec.recommendation, intent: rec.intent ?? null }))
            : null;
    const commitAvailable = !!recommendedActionKey;

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

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* Decision */}
                {!isClosed ? (
                    <ReviewDecideCard view={rec} loading={recLoading} compact planLines={planLines} />
                ) : (
                    <div className="rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.07] p-3 text-[12.5px] text-alloy-midnight">
                        <div className="font-semibold">{statusLabel(detail.status)}</div>
                        <p className="mt-0.5 text-[11.5px] text-alloy-bend-pine/80">
                            {resultView && !resultView.isEmpty ? "The records below were saved." : "This case is complete."}
                        </p>
                    </div>
                )}

                {/* Result — a full panel only once there IS a result; a quiet one-liner before that,
                    so an empty Result box never dominates the narrow decision rail (§8). After approval,
                    the concrete records grouped as Linked / Created / Updated, human language only (§5). */}
                {isClosed ? (
                    <PosPanel eyebrow="Result" accent={false}>
                        {resultView && !resultView.isEmpty ? (
                            <div className="space-y-2.5">
                                <ResultGroup title="Linked" lines={resultView.linked} />
                                <ResultGroup title="Created" lines={resultView.created} />
                                <ResultGroup title="Updated" lines={resultView.updated} />
                            </div>
                        ) : (
                            <div className="text-[12.5px] text-alloy-midnight">This case is complete.</div>
                        )}
                    </PosPanel>
                ) : (
                    <p className="px-1 text-[11px] leading-snug text-alloy-midnight/40">
                        Saved or linked records appear here after you approve.
                    </p>
                )}
            </div>

            {/* Approve bar */}
            {!isClosed ? (
                <WorkspaceActionBar eyebrow="Decide">
                    {needsIdentityReview ? (
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
                        <button
                            type="button"
                            disabled={approving}
                            onClick={() => void approve()}
                            className={`${WS_ACTION_PRIMARY} w-full`}
                        >
                            {approving ? "Saving…" : approveLabel}
                        </button>
                    ) : (
                        <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/40 px-3 py-2 text-center text-[11.5px] text-alloy-midnight/45">
                            Not ready yet — Alloy is still reading this.
                        </div>
                    )}
                </WorkspaceActionBar>
            ) : null}
        </div>
    );
}
