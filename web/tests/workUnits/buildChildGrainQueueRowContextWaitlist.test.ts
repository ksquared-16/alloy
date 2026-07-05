import { describe, expect, it } from "vitest";
import { buildChildGrainQueueRowContext } from "@/lib/workUnits/buildChildGrainQueueRowContext";

/**
 * Variants Phase 5 — the candidate-grain adapter populates waitlist_context (rank/position + wait
 * since) from the placement waitlist projection, so the placement_candidate_child Subject Focus can
 * surface the rank. Non-candidate rows carry no waitlist_context.
 */
const queue = { key: "waitlist", label: "Waitlist" };

describe("buildChildGrainQueueRowContext — waitlist_context", () => {
    it("populates waitlist_context for a candidate row from the placement projection", () => {
        const ctx = buildChildGrainQueueRowContext({
            row: {
                id: "pcrow:opp-1:pc-1",
                row_grain: "candidate",
                placement_candidate_id: "pc-1",
                opportunity_id: "opp-1",
                _child_display_name: "Ava",
                _placement_waitlist_row: {
                    placement_candidate_id: "pc-1",
                    runtime_position_label: "#3 of 12",
                    wait_since: "2026-05-01",
                },
            },
            queue,
        });
        expect(ctx?.row_subject.subject_type).toBe("candidate");
        expect(ctx?.waitlist_context).toEqual({ position_label: "#3 of 12", wait_since: "2026-05-01" });
    });

    it("omits waitlist_context when the projection carries no rank/wait", () => {
        const ctx = buildChildGrainQueueRowContext({
            row: {
                id: "pcrow:opp-1:pc-1",
                row_grain: "candidate",
                placement_candidate_id: "pc-1",
                opportunity_id: "opp-1",
                _child_display_name: "Ava",
                _placement_waitlist_row: { placement_candidate_id: "pc-1" },
            },
            queue,
        });
        expect(ctx?.waitlist_context).toBeUndefined();
    });

    it("child-grain rows carry no waitlist_context", () => {
        const ctx = buildChildGrainQueueRowContext({
            row: {
                id: "ocmrow:opp-1:ocm-1",
                row_grain: "child",
                opportunity_customer_member_id: "ocm-1",
                opportunity_id: "opp-1",
                _child_display_name: "Ava",
                _ocm_enrollment_track_row: { opportunity_customer_member_id: "ocm-1", outcome_status_key: "waitlisted" },
            },
            queue,
        });
        expect(ctx?.row_subject.subject_type).toBe("child");
        expect(ctx?.waitlist_context).toBeUndefined();
    });
});
