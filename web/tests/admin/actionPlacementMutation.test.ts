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

    it("rejects surfaces not editable in Settings", () => {
        expect(() => validateActionPlacementPatch({ surface: "department" })).toThrow(ActionPlacementValidationError);
    });

    it("allows workspace-related surface changes", () => {
        const patch = validateActionPlacementPatch({ surface: "right_rail" });
        expect(patch.surface).toBe("right_rail");
    });

    it("allows entity_type on patch", () => {
        const patch = validateActionPlacementPatch({ entity_type: "opportunity" });
        expect(patch.entity_type).toBe("opportunity");
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

    it("allows right_rail workspace placement on create", () => {
        const ok = validateActionPlacementCreate({
            action_definition_id: "00000000-0000-0000-0000-000000000001",
            surface: "right_rail",
            slot: "right_rail",
            entity_type: "opportunity",
        });
        expect(ok.surface).toBe("right_rail");
    });

    it("accepts is_active on create", () => {
        const created = validateActionPlacementCreate({
            action_definition_id: "00000000-0000-0000-0000-000000000001",
            surface: "record_header",
            slot: "primary",
            entity_type: "opportunity",
            is_active: false,
        });
        expect(created.is_active).toBe(false);
    });
});
