"use client";

/**
 * PosIdentityReviewOverlay — "Review matches" inside the Digital Mailroom (§1).
 *
 * A calm modal over the Decision Conversation that hosts IdentityReviewConversation — the
 * operator-facing presentation of the EXISTING identity review. The operator resolves the family
 * (accept / choose / create / confirm-or-reject a child / leave unresolved) through the canonical
 * /identity/* endpoints; no new identity system, and the POS Approve remains the single commit
 * path. After a decision, the rail refreshes (recommendation + expected result + eligibility).
 */

import { useEffect } from "react";
import IdentityReviewConversation from "./IdentityReviewConversation";
import type { CandidateProfile } from "@/lib/pos/identityConversation";

export default function PosIdentityReviewOverlay({
    caseId,
    candidateProfiles,
    submittedZip,
    onChanged,
    onClose,
}: {
    caseId: string;
    candidateProfiles?: CandidateProfile[];
    submittedZip?: string | null;
    /** Fired after any decision saves — refresh the POS case + recommendation + eligibility. */
    onChanged: () => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Review matches"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-alloy-stone/12 px-4 py-3">
                    <div>
                        <div className="text-[14px] font-semibold text-alloy-midnight">Let’s confirm this family</div>
                        <div className="text-[11.5px] text-alloy-midnight/55">Nothing is saved until you approve back in the case.</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-md border border-alloy-stone/25 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                    >
                        Done
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <IdentityReviewConversation
                        caseId={caseId}
                        candidateProfiles={candidateProfiles}
                        submittedZip={submittedZip}
                        onChanged={onChanged}
                    />
                </div>
            </div>
        </div>
    );
}
