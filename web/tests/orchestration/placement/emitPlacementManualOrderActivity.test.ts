import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    buildManualOrderActivitySummary,
    OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_CREATED,
    OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_RELEASED,
    OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_UPDATED,
    emitPlacementManualOrderActivity,
} from "@/lib/orchestration/placement/emitPlacementManualOrderActivity";

const emitEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: emitEventMock,
}));

describe("buildManualOrderActivitySummary", () => {
    it("formats move with from/to positions", () => {
        expect(
            buildManualOrderActivitySummary({
                action: "updated",
                childDisplayName: "Mia Hayes",
                cohortLabel: "Pre-K — 4–5 years",
                fromPosition: 10,
                toPosition: 1,
                positionTotal: 10,
            })
        ).toBe("Mia Hayes moved from position 10/10 to 1/10 within Pre-K — 4–5 years waitlist.");
    });

    it("formats created move up summary", () => {
        expect(
            buildManualOrderActivitySummary({
                action: "created",
                childDisplayName: "Mia Hayes",
                cohortLabel: "Pre-K — 4–5 years",
                direction: "up",
            })
        ).toBe("Mia Hayes moved higher within Pre-K — 4–5 years waitlist.");
    });

    it("formats released summary", () => {
        expect(
            buildManualOrderActivitySummary({
                action: "released",
                childDisplayName: "Mia Hayes",
                cohortLabel: "Pre-K — 4–5 years",
            })
        ).toBe("Mia Hayes returned to policy-based ordering.");
    });

    it("formats updated summary without direction", () => {
        expect(
            buildManualOrderActivitySummary({
                action: "updated",
                childDisplayName: "Mia Hayes",
                cohortLabel: "Pre-K — 4–5 years",
            })
        ).toBe("Mia Hayes waitlist position adjusted within Pre-K — 4–5 years waitlist.");
    });
});

describe("emitPlacementManualOrderActivity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        emitEventMock.mockResolvedValue("evt-1");
    });

    it("emits opportunity workflow event with structured payload", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({
                                data: {
                                    id: "pc-1",
                                    opportunity_id: "opp-1",
                                    program_room_cohort_key: "pre_k",
                                    program_room_group_label: "Pre-K — 4–5 years",
                                    customer_members: null,
                                    opportunity_customer_members: {
                                        customer_members: { display_name: "Mia Hayes" },
                                    },
                                },
                                error: null,
                            })),
                        })),
                    })),
                })),
            })),
        };

        await emitPlacementManualOrderActivity(supabase as never, {
            orgId: "org-1",
            actorUserId: "user-1",
            placementCandidateId: "pc-1",
            placementOverrideId: "ov-1",
            action: "created",
            reason: "Sibling starting soon",
            direction: "up",
            pinOrdinal: 1,
            fromPosition: 10,
            toPosition: 1,
            positionTotal: 10,
            sectionKey: "toddler",
        });

        expect(emitEventMock).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_CREATED,
                entity_type: "opportunities",
                entity_id: "opp-1",
                payload: expect.objectContaining({
                    opportunity_id: "opp-1",
                    placement_candidate_id: "pc-1",
                    placement_override_id: "ov-1",
                    program_room_cohort_key: "pre_k",
                    cohort_label: "Pre-K — 4–5 years",
                    child_display_name: "Mia Hayes",
                    action: "created",
                    direction: "up",
                    pin_ordinal: 1,
                    from_position: 10,
                    to_position: 1,
                    position_total: 10,
                    section_key: "toddler",
                    reason: "Sibling starting soon",
                    actor_user_id: "user-1",
                    summary: "Mia Hayes moved from position 10/10 to 1/10 within Pre-K — 4–5 years waitlist.",
                }),
            })
        );
    });

    it("uses released event type for reset", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({
                                data: {
                                    id: "pc-1",
                                    opportunity_id: "opp-1",
                                    program_room_cohort_key: "pre_k",
                                    program_room_group_label: "Pre-K — 4–5 years",
                                    customer_members: { display_name: "Mia Hayes" },
                                    opportunity_customer_members: null,
                                },
                                error: null,
                            })),
                        })),
                    })),
                })),
            })),
        };

        await emitPlacementManualOrderActivity(supabase as never, {
            orgId: "org-1",
            actorUserId: "user-1",
            placementCandidateId: "pc-1",
            placementOverrideId: "ov-1",
            action: "released",
            reason: "No longer needed",
        });

        expect(emitEventMock).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_RELEASED,
            })
        );
    });

    it("maps updated action to updated event type", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({
                                data: {
                                    id: "pc-1",
                                    opportunity_id: "opp-1",
                                    program_room_cohort_key: "pre_k",
                                    program_room_group_label: "Pre-K — 4–5 years",
                                    customer_members: { display_name: "Mia Hayes" },
                                    opportunity_customer_members: null,
                                },
                                error: null,
                            })),
                        })),
                    })),
                })),
            })),
        };

        await emitPlacementManualOrderActivity(supabase as never, {
            orgId: "org-1",
            actorUserId: "user-1",
            placementCandidateId: "pc-1",
            placementOverrideId: "ov-1",
            action: "updated",
            reason: "Director review",
            direction: "down",
            pinOrdinal: 2,
        });

        expect(emitEventMock).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_UPDATED,
            })
        );
    });
});
