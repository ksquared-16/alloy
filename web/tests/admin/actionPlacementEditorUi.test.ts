import { describe, expect, it } from "vitest";
import {
    actionPlacementEditorCapabilities,
    groupPlacementEditorRows,
    type ActionPlacementEditorRow,
} from "@/lib/admin/actions/actionPlacementEditorUi";

describe("actionPlacementEditorUi", () => {
    it("groups placements by surface and entity", () => {
        const rows: ActionPlacementEditorRow[] = [
            {
                placement_id: "p1",
                definition_id: "d1",
                definition_key: "a",
                label: "A",
                action_type: "ui_intent",
                entity_type: "opportunity",
                org_id: "org-1",
                surface: "record_header",
                slot: "primary",
                section_key: null,
                order_index: 10,
                display_style: "button",
                is_active: true,
            },
        ];
        const groups = groupPlacementEditorRows(rows);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.title).toContain("Record header");
    });

    it("marks platform placements locked", () => {
        const cap = actionPlacementEditorCapabilities(
            {
                placement_id: "p1",
                definition_id: "d1",
                definition_key: "a",
                label: "A",
                action_type: "ui_intent",
                entity_type: "opportunity",
                org_id: null,
                surface: "record_header",
                slot: "primary",
                section_key: null,
                order_index: 10,
                display_style: "button",
                is_active: true,
            },
            "org-1"
        );
        expect(cap.editable).toBe(false);
        expect(cap.lockedReason).toContain("Platform");
    });
});
