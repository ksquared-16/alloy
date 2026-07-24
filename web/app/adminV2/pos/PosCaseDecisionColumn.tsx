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
import WorkspaceActionBar from "@/components/workspace/WorkspaceActionBar";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import PosPanel from "./PosPanel";
import { POS_STATUS_LABELS } from "./posSections";
import type { PosCaseState } from "./usePosCase";

const RECORD_TYPE_LABELS: Record<string, string> = {
    person: "Person",
    customer: "Customer",
    opportunity: "Opportunity",
    customer_member: "Member",
};

function statusLabel(s: string): string {
    return POS_STATUS_LABELS[s] ?? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function outputLine(approveResult: PosCaseState["approveResult"]): string {
    if (approveResult?.recordId) {
        return `${approveResult.created ? "Created" : "Linked"} ${RECORD_TYPE_LABELS[approveResult.recordType ?? ""] ?? approveResult.recordType} ${approveResult.recordId}`;
    }
    return "Completed.";
}

export default function PosCaseDecisionColumn({ state }: { state: PosCaseState }) {
    const { detail, evidence, rec, recLoading, approve, approving, approveErr, approveResult, isClosed } = state;
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
    const planLines =
        rec?.supported && rec.recommendation
            ? buildCommitPlanLines(buildMatchedRecords({ recommendation: rec.recommendation, intent: rec.intent ?? null, submitted }))
            : [];

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* Decision */}
                {!isClosed ? (
                    <ReviewDecideCard view={rec} loading={recLoading} compact planLines={planLines} />
                ) : (
                    <div className="rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.07] p-3 text-[12.5px] text-alloy-midnight">
                        <div className="font-semibold">{statusLabel(detail.status)}</div>
                        <p className="mt-0.5 text-[11.5px] text-alloy-bend-pine/80">{outputLine(approveResult)}</p>
                    </div>
                )}

                {/* Result — a full panel only once there IS a result; a quiet one-liner before that,
                    so an empty Result box never dominates the narrow decision rail (§8). */}
                {isClosed ? (
                    <PosPanel eyebrow="Result" accent={false}>
                        <div className="text-[12.5px] text-alloy-midnight">{outputLine(approveResult)}</div>
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
