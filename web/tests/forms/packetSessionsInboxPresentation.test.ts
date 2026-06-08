import { describe, expect, it } from "vitest";
import {
    groupPacketSessionsIntoInboxLanes,
    packetSessionInboxPrimaryAction,
    packetSessionInboxReviewHref,
    resolvePacketSessionInboxLane,
    type PacketSessionInboxRow,
} from "@/lib/forms/packets/packetSessionsInboxPresentation";

const base = (overrides: Partial<PacketSessionInboxRow> = {}): PacketSessionInboxRow => ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    packet_definition_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    packet_name: "Enrollment",
    status: "completed",
    created_at: "2026-05-01T10:00:00.000Z",
    completed_at: "2026-05-02T12:00:00.000Z",
    operator_review_status: "needs_review",
    launch_context: { label: "Smith Family" },
    ...overrides,
});

describe("packetSessionsInboxPresentation OW-5", () => {
    it("groups sessions into review-first lanes", () => {
        const lanes = groupPacketSessionsIntoInboxLanes([
            base({ id: "1", operator_review_status: "needs_review" }),
            base({ id: "2", status: "in_progress", operator_review_status: null, completed_at: null }),
            base({ id: "3", operator_review_status: "needs_correction" }),
            base({ id: "4", operator_review_status: "approved" }),
            base({ id: "5", status: "cancelled", operator_review_status: null }),
        ]);

        expect(lanes.needsReview.map((s) => s.id)).toEqual(["1"]);
        expect(lanes.needsCorrection.map((s) => s.id)).toEqual(["3"]);
        expect(lanes.inProgress.map((s) => s.id)).toEqual(["2"]);
        expect(lanes.recentlyCompleted.map((s) => s.id)).toEqual(["4"]);
        expect(lanes.other.map((s) => s.id)).toEqual(["5"]);
    });

    it("resolvePacketSessionInboxLane treats null review as needs review when completed", () => {
        expect(resolvePacketSessionInboxLane(base({ operator_review_status: null }))).toBe("needsReview");
    });

    it("packetSessionInboxPrimaryAction returns review for review lanes", () => {
        expect(packetSessionInboxPrimaryAction("needsReview").label).toBe("Review case file");
        expect(packetSessionInboxPrimaryAction("needsCorrection").kind).toBe("review");
        expect(packetSessionInboxPrimaryAction("inProgress").label).toBe("Continue monitoring");
        expect(packetSessionInboxPrimaryAction("recentlyCompleted").label).toBe("Open");
    });

    it("packetSessionInboxReviewHref routes to session review page", () => {
        expect(packetSessionInboxReviewHref("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(
            "/adminV2/forms/packets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        );
    });
});
