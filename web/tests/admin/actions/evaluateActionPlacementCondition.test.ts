import { describe, expect, it } from "vitest";
import { evaluateActionPlacementCondition } from "@/lib/admin/actions/resolveActionsForContext";
import { MARK_LOST_VISIBLE_STATUS_KEYS } from "@/lib/admin/actions/createLeadActionConstants";

describe("evaluateActionPlacementCondition", () => {
    it("passes when status_key_equals matches", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_equals: "new_inquiry" },
                null,
                "new_inquiry",
                null
            )
        ).toBe(true);
    });

    it("fails when status_key_equals does not match", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_equals: "new_inquiry" },
                null,
                "contact_attempted",
                null
            )
        ).toBe(false);
    });

    it("passes mark_lost visibility for configured pipeline stages", () => {
        for (const sk of MARK_LOST_VISIBLE_STATUS_KEYS) {
            expect(
                evaluateActionPlacementCondition(
                    { status_key_in: [...MARK_LOST_VISIBLE_STATUS_KEYS] },
                    null,
                    sk,
                    null
                )
            ).toBe(true);
        }
    });

    it("hides mark_lost when status is lost or enrolled", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_in: [...MARK_LOST_VISIBLE_STATUS_KEYS] },
                null,
                "lost",
                null
            )
        ).toBe(false);
        expect(
            evaluateActionPlacementCondition(
                { status_key_in: [...MARK_LOST_VISIBLE_STATUS_KEYS] },
                null,
                "enrolled",
                null
            )
        ).toBe(false);
    });

    it("merges definition and placement condition_config (placement wins on keys)", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_equals: "new_inquiry" },
                { status_key_equals: "contact_attempted" },
                "contact_attempted",
                null
            )
        ).toBe(true);
    });
});
