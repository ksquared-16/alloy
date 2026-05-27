import { describe, expect, it } from "vitest";
import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import {
    actionPlacementEditorCapabilities,
    formatActionPlacementWhere,
    groupPlacementEditorRows,
    type ActionPlacementEditorRow,
} from "@/lib/admin/actions/actionPlacementEditorUi";

const LEAD_LABELS: EntityLabelsMap = {
    opportunities: { singular: "Lead", plural: "Leads" },
};

describe("actionPlacementEditorUi", () => {
    it("groups placements by surface and entity", () => {
        const rows: ActionPlacementEditorRow[] = [
            {
                placement_id: "p1",
                definition_id: "d1",
                definition_key: "a",
                definition_org_id: "org-1",
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
        const groups = groupPlacementEditorRows(rows, LEAD_LABELS);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.title).toContain("Record header");
        expect(groups[0]?.title).toContain("Lead");
        expect(groups[0]?.title).not.toContain("opportunity");
    });

    it("formats placement location for operators", () => {
        expect(
            formatActionPlacementWhere(
                {
                    surface: "record_section",
                    slot: "primary",
                    section_key: "details",
                    entity_type: "opportunity",
                },
                LEAD_LABELS
            )
        ).toContain("Record section");
        expect(
            formatActionPlacementWhere(
                {
                    surface: "record_section",
                    slot: "primary",
                    section_key: "details",
                    entity_type: "opportunity",
                },
                LEAD_LABELS
            )
        ).toContain("details");
        expect(
            formatActionPlacementWhere(
                {
                    surface: "queue_row",
                    slot: "row_inline",
                    section_key: null,
                    entity_type: "opportunity",
                },
                LEAD_LABELS
            )
        ).toContain("Workspace queue row");
        expect(
            formatActionPlacementWhere(
                {
                    surface: "queue_row",
                    slot: "row_inline",
                    section_key: null,
                    entity_type: "opportunity",
                },
                LEAD_LABELS
            )
        ).toContain("Lead");
        expect(
            formatActionPlacementWhere(
                {
                    surface: "queue_row",
                    slot: "row_inline",
                    section_key: null,
                    entity_type: "opportunity",
                },
                LEAD_LABELS
            )
        ).not.toContain("opportunity");
    });

    it("allows label edit only for org-owned definitions", () => {
        const cap = actionPlacementEditorCapabilities(
            {
                placement_id: "p2",
                definition_id: "d2",
                definition_key: "b",
                definition_org_id: "org-1",
                label: "B",
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
            "org-1"
        );
        expect(cap.editable).toBe(true);
        expect(cap.canEditLabel).toBe(true);
        expect(cap.canEditEntityType).toBe(true);
    });

    it("marks platform placements locked", () => {
        const cap = actionPlacementEditorCapabilities(
            {
                placement_id: "p1",
                definition_id: "d1",
                definition_key: "a",
                definition_org_id: null,
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
        expect(cap.canCloneAsOrgPlacement).toBe(true);
        expect(cap.lockedReason).toContain("Built-in");
    });
});
