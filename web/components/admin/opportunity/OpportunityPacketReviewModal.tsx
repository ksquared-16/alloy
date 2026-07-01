"use client";

import { useCallback, useEffect, useState } from "react";
import { PacketReviewRollupView } from "@/components/forms/packets/PacketReviewRollupView";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    fetchPacketReviewInsight,
    fetchPacketReviewRollup,
    patchPacketReview,
    type PacketReviewPatchStatus,
} from "@/lib/forms/packets/packetReviewApi";
import type { PacketReviewInsightV1 } from "@/lib/forms/packets/packetReviewInsightTypes";
import { FormsReviewStatePanel, PacketReviewActionsForm } from "@/components/forms/review";
import { FORMS_REVIEW_ERROR, FORMS_REVIEW_LOADING } from "@/lib/forms/review/formsReviewPresentation";
import { enrollmentPacketSubjectLine } from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";
import type { OpportunityPacketPendingSession } from "@/components/admin/opportunity/OpportunityPacketPendingReviewList";

export type RollupLoadPhase = "idle" | "loading" | "ready" | "error";

type ModalBodyProps = {
    session: OpportunityPacketPendingSession;
    rollupPhase: RollupLoadPhase;
    rollup: PacketReviewRollupV1 | null;
    insight: PacketReviewInsightV1 | null;
    insightLoading: boolean;
    rollupError: string | null;
    notes: string;
    saving: boolean;
    saveErr: string | null;
    canMutate: boolean;
    onNotesChange: (value: string) => void;
    onRetryRollup: () => void;
    onClose: () => void;
    onApplyReview: (status: PacketReviewPatchStatus) => void;
};

/** Presentational modal body (rollup fetch state + shared case file). Exported for tests. */
export function OpportunityPacketReviewModalBody({
    session,
    rollupPhase,
    rollup,
    insight,
    insightLoading,
    rollupError,
    notes,
    saving,
    saveErr,
    canMutate,
    onNotesChange,
    onRetryRollup,
    onClose,
    onApplyReview,
}: ModalBodyProps) {
    const reviewActions =
        rollup && rollupPhase === "ready" ?
            <PacketReviewActionsForm
                rollup={rollup}
                notes={notes}
                saving={saving}
                saveErr={saveErr}
                canMutate={canMutate}
                variant="modal"
                onNotesChange={onNotesChange}
                onApplyReview={onApplyReview}
            />
        : null;

    return (
        <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-alloy-stone/30 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
        >
            <h3 className="text-sm font-semibold text-alloy-midnight">Review packet</h3>
            <p className="mt-1 text-xs text-alloy-midnight/70">{enrollmentPacketSubjectLine(session)}</p>
            <a
                href={session.admin_packet_review_path}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-alloy-blue hover:underline"
            >
                Open full review console
            </a>

            {rollupPhase === "loading" ?
                <div className="mt-4">
                    <FormsReviewStatePanel variant="loading" message={FORMS_REVIEW_LOADING.packetReview} />
                </div>
            : rollupPhase === "error" ?
                <div className="mt-4">
                    <FormsReviewStatePanel
                        variant="error"
                        message={rollupError ?? FORMS_REVIEW_ERROR.packetReviewDefault}
                        onRetry={onRetryRollup}
                    />
                </div>
            : rollup && rollupPhase === "ready" ?
                <div className="mt-3">
                    <PacketReviewRollupView
                        rollup={rollup}
                        insight={insight}
                        insightLoading={insightLoading}
                        placement="modal"
                        reviewActionsSlot={reviewActions}
                    />
                </div>
            : null}

            <div className="mt-4 flex justify-end">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/40 px-3 py-1.5 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                    disabled={saving}
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
        </div>
    );
}

type ModalProps = {
    open: boolean;
    session: OpportunityPacketPendingSession | null;
    canMutate: boolean;
    onClose: () => void;
    onReviewApplied: () => void | Promise<void>;
};

export function OpportunityPacketReviewModal({ open, session, canMutate, onClose, onReviewApplied }: ModalProps) {
    const [rollupPhase, setRollupPhase] = useState<RollupLoadPhase>("idle");
    const [rollup, setRollup] = useState<PacketReviewRollupV1 | null>(null);
    const [insight, setInsight] = useState<PacketReviewInsightV1 | null>(null);
    const [insightLoading, setInsightLoading] = useState(false);
    const [rollupError, setRollupError] = useState<string | null>(null);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);

    const sessionId = session?.id ?? null;

    const loadRollup = useCallback(async () => {
        if (!sessionId) return;
        setRollupPhase("loading");
        setRollupError(null);
        setRollup(null);
        setInsight(null);
        setInsightLoading(true);
        try {
            const data = await fetchPacketReviewRollup(sessionId);
            setRollup(data);
            setNotes(data.operator_review.notes ?? "");
            setRollupPhase("ready");

            void fetchPacketReviewInsight(sessionId)
                .then(setInsight)
                .catch(() => {
                    /* rollup-derived assist fallback */
                })
                .finally(() => setInsightLoading(false));
        } catch (e) {
            setRollupError(e instanceof Error ? e.message : "Load failed");
            setRollupPhase("error");
            setInsightLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        if (open && sessionId) {
            void loadRollup();
        } else {
            setRollupPhase("idle");
            setRollup(null);
            setInsight(null);
            setInsightLoading(false);
            setRollupError(null);
            setNotes("");
            setSaveErr(null);
        }
    }, [open, sessionId, loadRollup]);

    const applyReview = async (status: PacketReviewPatchStatus) => {
        if (!sessionId) return;
        setSaving(true);
        setSaveErr(null);
        try {
            await patchPacketReview(sessionId, status, notes);
            onClose();
            await onReviewApplied();
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    if (!open || !session) return null;

    return (
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Packet review"
            onClick={() => !saving && onClose()}
        >
            <OpportunityPacketReviewModalBody
                session={session}
                rollupPhase={rollupPhase}
                rollup={rollup}
                insight={insight}
                insightLoading={insightLoading}
                rollupError={rollupError}
                notes={notes}
                saving={saving}
                saveErr={saveErr}
                canMutate={canMutate}
                onNotesChange={setNotes}
                onRetryRollup={() => void loadRollup()}
                onClose={onClose}
                onApplyReview={(s) => void applyReview(s)}
            />
        </div>
    );
}
