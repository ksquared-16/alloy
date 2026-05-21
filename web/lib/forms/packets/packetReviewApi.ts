import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

export type PacketReviewPatchStatus = "approved" | "rejected" | "needs_correction";

export function packetReviewRollupUrl(packetSessionId: string): string {
    return `/api/admin/forms/packet-sessions/${encodeURIComponent(packetSessionId)}/review-rollup`;
}

export function packetReviewPatchUrl(packetSessionId: string): string {
    return `/api/admin/forms/packet-sessions/${encodeURIComponent(packetSessionId)}/review`;
}

/** Body for PATCH `/api/admin/forms/packet-sessions/[id]/review` (unchanged semantics). */
export function buildPacketReviewPatchBody(
    operatorReviewStatus: PacketReviewPatchStatus,
    notes: string
): { operator_review_status: PacketReviewPatchStatus; operator_review_notes?: string } {
    const trimmed = notes.trim();
    return {
        operator_review_status: operatorReviewStatus,
        ...(trimmed ? { operator_review_notes: trimmed } : {}),
    };
}

export async function fetchPacketReviewRollup(packetSessionId: string): Promise<PacketReviewRollupV1> {
    const res = await fetch(packetReviewRollupUrl(packetSessionId), { credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rollup?: PacketReviewRollupV1;
        error?: string;
    };
    if (!res.ok) throw new Error(j.error ?? `Could not load review (${res.status})`);
    if (!j.ok || !j.rollup) throw new Error("Invalid review rollup response");
    return j.rollup;
}

export async function patchPacketReview(
    packetSessionId: string,
    operatorReviewStatus: PacketReviewPatchStatus,
    notes: string
): Promise<void> {
    const res = await fetch(packetReviewPatchUrl(packetSessionId), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPacketReviewPatchBody(operatorReviewStatus, notes)),
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
}
