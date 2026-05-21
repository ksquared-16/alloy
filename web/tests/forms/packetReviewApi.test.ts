import { describe, expect, it, vi, afterEach } from "vitest";
import {
    buildPacketReviewPatchBody,
    fetchPacketReviewRollup,
    packetReviewPatchUrl,
    packetReviewRollupUrl,
} from "@/lib/forms/packets/packetReviewApi";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const SESS = "33333333-3333-4333-8333-333333333333";

describe("packetReviewApi", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("buildPacketReviewPatchBody matches existing review PATCH shape", () => {
        expect(buildPacketReviewPatchBody("approved", "")).toEqual({ operator_review_status: "approved" });
        expect(buildPacketReviewPatchBody("rejected", "  note  ")).toEqual({
            operator_review_status: "rejected",
            operator_review_notes: "note",
        });
        expect(buildPacketReviewPatchBody("needs_correction", "x")).toEqual({
            operator_review_status: "needs_correction",
            operator_review_notes: "x",
        });
    });

    it("rollup and patch URLs are session-scoped", () => {
        expect(packetReviewRollupUrl(SESS)).toBe(`/api/admin/forms/packet-sessions/${SESS}/review-rollup`);
        expect(packetReviewPatchUrl(SESS)).toBe(`/api/admin/forms/packet-sessions/${SESS}/review`);
    });

    it("fetchPacketReviewRollup loads rollup from review-rollup GET", async () => {
        const rollup = { contract_version: 1, packet_session_id: SESS } as PacketReviewRollupV1;
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, rollup }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchPacketReviewRollup(SESS);
        expect(result.packet_session_id).toBe(SESS);
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/admin/forms/packet-sessions/${SESS}/review-rollup`,
            expect.objectContaining({ credentials: "include" })
        );
    });
});
