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
    const { detail, rec, recLoading, approve, approving, approveErr, approveResult, isClosed } = state;
    if (!detail) return null;

    const recommendedActionKey = rec?.supported && rec.recommendation ? DECISION_TO_ACTION[rec.recommendation.decision].key : null;
    const recommendedActionLabel =
        rec?.supported && rec.recommendation ? DECISION_TO_ACTION[rec.recommendation.decision].label : null;
    const commitAvailable = !!recommendedActionKey;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* Decision */}
                {!isClosed ? (
                    <ReviewDecideCard view={rec} loading={recLoading} />
                ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[12.5px] text-emerald-900">
                        <div className="font-semibold">{statusLabel(detail.status)}</div>
                        <p className="mt-0.5 text-[11.5px] text-emerald-800/80">{outputLine(approveResult)}</p>
                    </div>
                )}

                {/* Result */}
                <PosPanel eyebrow="Result" accent={false}>
                    {isClosed ? (
                        <div className="text-[12.5px] text-alloy-midnight">{outputLine(approveResult)}</div>
                    ) : (
                        <div className="text-[12.5px] text-stone-400">Nothing yet — saved or linked records appear here after you approve.</div>
                    )}
                </PosPanel>
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
                            {approving ? "Saving…" : `Approve — ${recommendedActionLabel}`}
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
