import { describe, expect, it } from "vitest";

import {
    partitionPlacementRowsForSettings,
    type ActionPlacementEditorRow,
} from "@/lib/admin/actions/actionPlacementEditorUi";

function row(overrides: Partial<ActionPlacementEditorRow> & { placement_id: string }): ActionPlacementEditorRow {
    return {
        placement_id: overrides.placement_id,
        definition_id: overrides.definition_id ?? "def-1",
        definition_key: overrides.definition_key ?? "schedule_tour",
        definition_org_id: overrides.definition_org_id ?? null,
        label: overrides.label ?? "Schedule tour",
        action_type: overrides.action_type ?? "open_form",
        entity_type: overrides.entity_type ?? "opportunity",
        org_id: overrides.org_id ?? null,
        surface: overrides.surface ?? "record_header",
        slot: overrides.slot ?? "primary",
        section_key: overrides.section_key ?? null,
        order_index: overrides.order_index ?? 10,
        display_style: overrides.display_style ?? "button",
        is_active: overrides.is_active ?? true,
    };
}

describe("partitionPlacementRowsForSettings", () => {
    it("separates org-editable placements from platform system defaults", () => {
        const rows = [
            row({ placement_id: "p1", org_id: "org-1" }),
            row({ placement_id: "p2", org_id: null }),
            row({ placement_id: "p3", org_id: "org-1", definition_key: "quick_message" }),
        ];
        const { orgPlacements, systemDefaults } = partitionPlacementRowsForSettings(rows, "org-1");
        expect(orgPlacements.map((r) => r.placement_id)).toEqual(["p1", "p3"]);
        expect(systemDefaults.map((r) => r.placement_id)).toEqual(["p2"]);
    });
});
