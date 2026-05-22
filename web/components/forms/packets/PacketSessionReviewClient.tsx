"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    PacketReviewRollupView,
    type PacketReviewTechnicalDetails,
} from "@/components/forms/packets/PacketReviewRollupView";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { FormsReviewStatePanel, PacketReviewActionsForm } from "@/components/forms/review";
import { FORMS_REVIEW_ERROR, FORMS_REVIEW_LOADING } from "@/lib/forms/review/formsReviewPresentation";

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

    const reviewActions =
        rollup ?
            <PacketReviewActionsForm
                rollup={rollup}
                notes={notes}
                saving={saving}
                saveErr={saveErr}
                canMutate={canMutate}
                variant="page"
                onNotesChange={setNotes}
                onApplyReview={(status) => void applyReview(status)}
            />
        : null;

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-6 text-alloy-midnight">
            <div className="flex flex-wrap items-center gap-3">
                <Link href="/adminV2/forms/packets" className="text-sm font-medium text-alloy-midnight/60 hover:text-alloy-midnight">
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
                <PacketReviewRollupView
                    rollup={rollup}
                    technicalDetails={technicalDetails}
                    placement="page"
                    reviewActionsSlot={reviewActions}
                />
            : null}
        </div>
    );
}
