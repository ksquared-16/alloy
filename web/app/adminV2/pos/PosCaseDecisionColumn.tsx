"use client";

/**
 * POS Processing — Column 3, the Case Detail spine (bottom half):
 *   Decision → Commit → Evidence / Output
 *
 * Decision support reuses ReviewDecideCard (FP8a recommendation). Commit is the
 * EXISTING approve handoff (unchanged) — but it is honestly gated: when there is no
 * proposal/recommendation yet, Commit reads "not available" instead of pretending.
 * The alternative operator decisions stay prototype-badged.
 */

import ReviewDecideCard, { DECISION_TO_ACTION } from "@/app/adminV2/processing/ReviewDecideCard";
import WorkspaceActionBar from "@/components/workspace/WorkspaceActionBar";
import PosPanel from "./PosPanel";
import type { PosCaseState } from "./usePosCase";

const RECORD_TYPE_LABELS: Record<string, string> = {
    person: "Person",
    customer: "Customer",
    opportunity: "Opportunity",
    customer_member: "Member",
};

const OPERATOR_ACTIONS: Array<{ key: string; label: string }> = [
    { key: "link_existing", label: "Link existing" },
    { key: "create_new", label: "Create new" },
    { key: "update_existing", label: "Update existing" },
    { key: "route_for_review", label: "Route for review" },
    { key: "reject", label: "Reject / ignore" },
];

function statusLabel(s: string): string {
    return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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

                {/* Evidence / Output */}
                <PosPanel eyebrow="Evidence / output" accent={false}>
                    {isClosed ? (
                        <div className="text-[12.5px] text-alloy-midnight">{outputLine(approveResult)}</div>
                    ) : (
                        <div className="text-[12.5px] text-stone-400">No output yet — created or linked records appear here after commit.</div>
                    )}
                </PosPanel>
            </div>

            {/* Decision → Commit bar */}
            {!isClosed ? (
                <WorkspaceActionBar eyebrow="Decision · commit">
                    {approveResult?.kind === "needs_mapping" ? (
                        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                            Can’t commit yet — {approveResult.note}
                        </div>
                    ) : null}
                    {approveErr ? <div className="mb-2 text-[11px] text-amber-700">{approveErr}</div> : null}
                    {commitAvailable ? (
                        <button
                            type="button"
                            disabled={approving}
                            onClick={() => void approve()}
                            className="w-full rounded-md bg-[#00A283] px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-[#009276] disabled:opacity-50"
                        >
                            {approving ? "Committing…" : `Commit — ${recommendedActionLabel}`}
                        </button>
                    ) : (
                        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-center text-[11.5px] text-stone-400">
                            Commit not available — awaiting classification &amp; extraction.
                        </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {OPERATOR_ACTIONS.filter((a) => a.key !== recommendedActionKey).map((a) => (
                            <button
                                key={a.key}
                                type="button"
                                disabled
                                title="Prototype — alternative decision outcomes not wired yet"
                                className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-md border border-stone-200 px-2 py-1.5 text-[11.5px] text-stone-400"
                            >
                                {a.label}
                                <span className="rounded bg-stone-100 px-1 text-[8px] font-semibold uppercase text-stone-400">Proto</span>
                            </button>
                        ))}
                    </div>
                </WorkspaceActionBar>
            ) : null}
        </div>
    );
}
