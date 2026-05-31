import { describe, expect, it } from "vitest";
import { evaluateActionPlacementCondition } from "@/lib/admin/actions/resolveActionsForContext";
import {
    MARK_LOST_VISIBLE_STATUS_KEYS,
    QUALIFICATION_STATUS_KEY,
    TERMINAL_PIPELINE_STATUS_KEYS,
    UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS,
} from "@/lib/admin/actions/universalActionConstants";

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
                QUALIFICATION_STATUS_KEY,
                null
            )
        ).toBe(false);
    });

    it("passes mark_lost visibility for configured pipeline stages including qualification", () => {
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
        expect(MARK_LOST_VISIBLE_STATUS_KEYS).toContain(QUALIFICATION_STATUS_KEY);
    });

    it("shows universal actions on qualification records", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_in: [...UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS] },
                null,
                QUALIFICATION_STATUS_KEY,
                null
            )
        ).toBe(true);
    });

    it("hides universal actions on lost only (active/enrolled still allowed)", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_in: [...UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS] },
                null,
                "lost",
                null
            )
        ).toBe(false);
        expect(
            evaluateActionPlacementCondition(
                { status_key_in: [...UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS] },
                null,
                "enrolled",
                null
            )
        ).toBe(true);
    });

    it("hides mark_lost on lost and enrolled", () => {
        for (const sk of ["lost", "enrolled"] as const) {
            expect(
                evaluateActionPlacementCondition(
                    { status_key_in: [...MARK_LOST_VISIBLE_STATUS_KEYS] },
                    null,
                    sk,
                    null
                )
            ).toBe(false);
        }
        for (const sk of TERMINAL_PIPELINE_STATUS_KEYS) {
            expect(
                evaluateActionPlacementCondition(
                    { status_key_in: [...UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS] },
                    null,
                    sk,
                    null
                )
            ).toBe(false);
        }
    });

    it("merges definition and placement condition_config (placement wins on keys)", () => {
        expect(
            evaluateActionPlacementCondition(
                { status_key_equals: "new_inquiry" },
                { status_key_equals: QUALIFICATION_STATUS_KEY },
                QUALIFICATION_STATUS_KEY,
                null
            )
        ).toBe(true);
    });
});
