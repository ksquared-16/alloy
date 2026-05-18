import { describe, expect, it } from "vitest";
import {
    ActionPlacementValidationError,
    actionPlacementEditableInSettings,
    validateActionPlacementCreate,
    validateActionPlacementPatch,
} from "@/lib/admin/actions/actionPlacementMutation";

describe("actionPlacementMutation", () => {
    it("allows org-scoped placement edits only", () => {
        expect(actionPlacementEditableInSettings("org-a", "org-a")).toBe(true);
        expect(actionPlacementEditableInSettings("org-a", null)).toBe(false);
    });

    it("validates placement patch fields", () => {
        const patch = validateActionPlacementPatch({ is_active: false, order_index: 50 });
        expect(patch.is_active).toBe(false);
        expect(patch.order_index).toBe(50);
    });

    it("rejects unsupported surface changes", () => {
        expect(() => validateActionPlacementPatch({ surface: "queue_row" })).toThrow(ActionPlacementValidationError);
    });

    it("requires section_key for record_section create", () => {
        expect(() =>
            validateActionPlacementCreate({
                action_definition_id: "00000000-0000-0000-0000-000000000001",
                surface: "record_section",
                slot: "primary",
                entity_type: "opportunity",
            })
        ).toThrow(ActionPlacementValidationError);

        const ok = validateActionPlacementCreate({
            action_definition_id: "00000000-0000-0000-0000-000000000001",
            surface: "record_section",
            slot: "primary",
            entity_type: "opportunity",
            section_key: "inquiry_children",
        });
        expect(ok.section_key).toBe("inquiry_children");
    });
});
