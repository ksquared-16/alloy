import { describe, expect, it } from "vitest";
import { actionPlacementSummary, groupActionInventoryRows } from "@/lib/admin/actions/actionInventoryDiagnostics";

describe("actionInventoryDiagnostics", () => {
    it("groups rows by surface and entity", () => {
        const groups = groupActionInventoryRows([
            {
                definition: { key: "a", label: "Alpha", action_type: "open_form", entity_type: "opportunity" },
                placement: { surface: "record_drawer", slot: "header", entity_type: "opportunity", section_key: null },
            },
            {
                definition: { key: "b", label: "Beta", action_type: "mutate", entity_type: "opportunity" },
                placement: { surface: "record_drawer", slot: "header", entity_type: "opportunity", section_key: null },
            },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.items).toHaveLength(2);
    });

    it("formats placement summary without raw underscores only", () => {
        const s = actionPlacementSummary({
            definition: { key: "x", label: "X", action_type: "mutate", entity_type: "job" },
            placement: { surface: "record_drawer", slot: "section_actions", entity_type: "job", section_key: "overview" },
        });
        expect(s).toContain("Record drawer");
        expect(s).toContain("job");
    });
});
