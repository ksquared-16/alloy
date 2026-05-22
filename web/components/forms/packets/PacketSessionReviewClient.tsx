"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    PacketReviewRollupView,
    type PacketReviewTechnicalDetails,
} from "@/components/forms/packets/PacketReviewRollupView";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { FormsReviewStatePanel } from "@/components/forms/review";
import {
    FORMS_REVIEW_ERROR,
    FORMS_REVIEW_LOADING,
    isPacketReviewAwaitingDecision,
    operatorReviewStatusLabel,
} from "@/lib/forms/review/formsReviewPresentation";

type Props = {
    packetSessionId: string;
    canMutate?: boolean;
    technicalDetails?: PacketReviewTechnicalDetails | null;
};

export function PacketSessionReviewClient({
    packetSessionId,
    canMutate = true,
    technicalDetails = null,
}: Props) {
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
    const [err, setErr] = useState<string | null>(null);
    const [rollup, setRollup] = useState<PacketReviewRollupV1 | null>(null);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        setPhase("loading");
        setErr(null);
        try {
            const res = await fetch(
                `/api/admin/forms/packet-sessions/${encodeURIComponent(packetSessionId)}/review-rollup`,
                { credentials: "include" }
            );
            const j = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                rollup?: PacketReviewRollupV1;
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? `Could not load review (${res.status})`);
            if (!j.ok || !j.rollup) throw new Error("Invalid review rollup response");
            setRollup(j.rollup);
            setNotes(j.rollup.operator_review.notes ?? "");
            setPhase("ready");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Load failed");
            setRollup(null);
            setPhase("error");
        }
    }, [packetSessionId]);

    useEffect(() => {
        void load();
    }, [load]);

    const applyReview = async (next: "approved" | "rejected" | "needs_correction") => {
        if (!rollup) return;
        setSaving(true);
        setSaveErr(null);
        try {
            const res = await fetch(`/api/admin/forms/packet-sessions/${encodeURIComponent(packetSessionId)}/review`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    operator_review_status: next,
                    operator_review_notes: notes.trim() || undefined,
                }),
            });
            const text = await res.text();
            let msg = "";
            try {
                const j = JSON.parse(text) as { error?: unknown };
                if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
            } catch {
                /* non-JSON */
            }
            if (!msg) msg = text.trim().slice(0, 300) || `Update failed (${res.status})`;
            if (!res.ok) throw new Error(msg);
            await load();
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const reviewAwaiting =
        rollup != null && isPacketReviewAwaitingDecision(rollup.status, rollup.operator_review.status);

    const reviewActions =
        rollup ?
            <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#0f172a]">Operator review</h2>
                {reviewAwaiting ?
                    <>
                        <p className="text-xs text-[#59678b]">
                            Approve triggers idempotent PDF generation for mapped steps (existing platform behavior).
                        </p>
                        <label className="block text-[11px] font-medium text-[#59678b]">
                            Notes (optional)
                            <textarea
                                className="mt-1 block w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm text-[#31394d]"
                                rows={2}
                                value={notes}
                                disabled={!canMutate || saving}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </label>
                        {saveErr ?
                            <p className="text-xs text-red-700" role="alert">
                                {saveErr}
                            </p>
                        : null}
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-xs font-medium text-[#59678b] hover:bg-[#f4f6f9] disabled:opacity-40"
                                disabled={!canMutate || saving}
                                onClick={() => void applyReview("needs_correction")}
                            >
                                Needs correction
                            </button>
                            <button
                                type="button"
                                className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-40"
                                disabled={!canMutate || saving}
                                onClick={() => void applyReview("rejected")}
                            >
                                Reject
                            </button>
                            <button
                                type="button"
                                className="rounded bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                                disabled={!canMutate || saving}
                                onClick={() => void applyReview("approved")}
                            >
                                {saving ? "Saving…" : "Approve"}
                            </button>
                        </div>
                    </>
                :   <p className="text-sm text-[#59678b]">
                        Review decision:{" "}
                        <span className="font-medium text-[#31394d]">
                            {operatorReviewStatusLabel(rollup.operator_review.status)}
                        </span>
                        {rollup.operator_review.reviewed_at ?
                            <span className="text-[#59678b]">
                                {" "}
                                · {new Date(rollup.operator_review.reviewed_at).toLocaleString()}
                            </span>
                        : null}
                    </p>
                }
            </div>
        : null;

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-6 text-[#31394d]">
            <div className="flex flex-wrap items-center gap-3">
                <Link href="/adminV2/forms/packets" className="text-sm font-medium text-[#59678b] hover:text-[#0f172a]">
                    ← Packet sessions
                </Link>
            </div>

            {phase === "loading" ?
                <FormsReviewStatePanel variant="loading" message={FORMS_REVIEW_LOADING.packetReview} />
            : phase === "error" ?
                <FormsReviewStatePanel
                    variant="error"
                    message={err ?? FORMS_REVIEW_ERROR.packetReviewDefault}
                    onRetry={() => void load()}
                />
            : rollup ?
                <>
                    <div>
                        <h1 className="text-xl font-semibold text-[#0f172a]">{rollup.packet_definition.name}</h1>
                        <p className="mt-1 text-sm text-[#59678b]">
                            Packet session review — identifiers are under Technical details below.
                        </p>
                    </div>
                    <PacketReviewRollupView
                        rollup={rollup}
                        technicalDetails={technicalDetails}
                        placement="page"
                        reviewActionsSlot={reviewActions}
                    />
                </>
            : null}
        </div>
    );
}
