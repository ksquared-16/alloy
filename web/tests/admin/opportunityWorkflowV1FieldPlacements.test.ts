import { describe, expect, it } from "vitest";
import {
    mergeOpportunityWorkflowV1FieldPlacementUpdates,
    validateFieldPlacementBehaviorUpdates,
} from "@/lib/admin/opportunityWorkflowV1FieldPlacements";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const baseWorkflowConfig = (): RecordLayoutConfigJson => ({
    inquiry_drawer_mode: "workflow_v1",
    overview_section_order: ["w1", "w2"],
    overview_hidden_sections: ["hidden_a"],
    inquiry_workflow_sections: [{ key: "w1", title: "One", field_keys: ["name"] }],
});

const catalog = [
    { field_key: "custom_notes", is_system: false, is_active: true },
    { field_key: "name", is_system: true, is_active: true },
    { field_key: "status_key", is_system: true, is_active: true },
];

describe("opportunityWorkflowV1FieldPlacements", () => {
    it("persists valid required placement", () => {
        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            baseWorkflowConfig(),
            [{ field_key: "custom_notes", requirement_preset: "required_on_save" }],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        const row = merged.config.field_placements_v1?.find((p) => p.field_key === "custom_notes");
        expect(row?.surfaces.drawer_overview?.requirement?.mode).toBe("required_on_save");
        expect(merged.config.overview_section_order).toEqual(["w1", "w2"]);
        expect(merged.config.inquiry_drawer_mode).toBe("workflow_v1");
    });

    it("persists valid interaction placement", () => {
        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            baseWorkflowConfig(),
            [{ field_key: "custom_notes", interaction_preset: "read_only" }],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        const row = merged.config.field_placements_v1?.find((p) => p.field_key === "custom_notes");
        expect(row?.surfaces.drawer_overview?.interaction?.editability_mode).toBe("read_only");
    });

    it("merges multiple updates without deleting unrelated placements", () => {
        const cfg: RecordLayoutConfigJson = {
            ...baseWorkflowConfig(),
            field_placements_v1: [
                {
                    field_key: "name",
                    surfaces: {
                        drawer_overview: {
                            requirement: { version: 1, mode: "optional" },
                        },
                    },
                },
            ],
        };
        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            cfg,
            [
                { field_key: "custom_notes", requirement_preset: "required" },
                { field_key: "name", interaction_preset: "editable" },
            ],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        expect(merged.config.field_placements_v1?.length).toBe(2);
        const nameRow = merged.config.field_placements_v1?.find((p) => p.field_key === "name");
        expect(nameRow?.surfaces.drawer_overview?.requirement?.mode).toBe("optional");
        expect(nameRow?.surfaces.drawer_overview?.interaction?.editability_mode).toBe("editable");
        const customRow = merged.config.field_placements_v1?.find((p) => p.field_key === "custom_notes");
        expect(customRow?.surfaces.drawer_overview?.requirement?.mode).toBe("required");
        expect(merged.config.field_placements_v1?.[0]?.field_key).toBe("name");
    });

    it("returns 400 for unknown field_key", () => {
        const v = validateFieldPlacementBehaviorUpdates(
            [{ field_key: "not_a_real_field", requirement_preset: "optional" }],
            catalog
        );
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.error).toMatch(/Unknown or inactive/);
    });

    it("returns 400 for unsupported preset", () => {
        const v = validateFieldPlacementBehaviorUpdates(
            [
                {
                    field_key: "custom_notes",
                    requirement_preset: "required_before_action" as "optional",
                },
            ],
            catalog
        );
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.error).toMatch(/Invalid requirement_preset/);
    });

    it("returns 400 for non-enforceable interaction", () => {
        const v = validateFieldPlacementBehaviorUpdates(
            [{ field_key: "status_key", interaction_preset: "editable" }],
            catalog
        );
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.error).toMatch(/does not support layout editability/);
    });

    it("normalizes malformed existing placements safely", () => {
        const cfg = {
            ...baseWorkflowConfig(),
            field_placements_v1: [
                "bad-row",
                {
                    field_key: "name",
                    surfaces: {
                        drawer_overview: { requirement: { version: 1, mode: "required" } },
                    },
                },
            ],
        } as unknown as RecordLayoutConfigJson;

        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            cfg,
            [{ field_key: "custom_notes", requirement_preset: "optional" }],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        expect(merged.config.field_placements_v1?.length).toBe(2);
        expect(merged.config.field_placements_v1?.[0]?.field_key).toBe("name");
    });

    it("preserves existing layout config keys", () => {
        const cfg = baseWorkflowConfig();
        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            cfg,
            [{ field_key: "custom_notes", requirement_preset: "optional" }],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        expect(merged.config.overview_section_order).toEqual(cfg.overview_section_order);
        expect(merged.config.overview_hidden_sections).toEqual(cfg.overview_hidden_sections);
        expect(merged.config.inquiry_workflow_sections).toEqual(cfg.inquiry_workflow_sections);
        expect(merged.config.inquiry_drawer_mode).toBe("workflow_v1");
    });

    it("partial update preserves prior placement behavior not in request", () => {
        const cfg: RecordLayoutConfigJson = {
            ...baseWorkflowConfig(),
            field_placements_v1: [
                {
                    field_key: "custom_notes",
                    surfaces: {
                        drawer_overview: {
                            requirement: { version: 1, mode: "required" },
                            interaction: {
                                version: 1,
                                editability_mode: "read_only",
                                ownership: {
                                    source_entity: "opportunity",
                                    source_field: "custom_notes",
                                    write_target_entity: "opportunity",
                                    write_target_field: "custom_notes",
                                    write_behavior: "none",
                                    lock_reason: "read_only_policy",
                                },
                            },
                        },
                    },
                },
            ],
        };
        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            cfg,
            [{ field_key: "custom_notes", requirement_preset: "optional" }],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        const row = merged.config.field_placements_v1?.[0];
        expect(row?.surfaces.drawer_overview?.requirement?.mode).toBe("optional");
        expect(row?.surfaces.drawer_overview?.interaction?.editability_mode).toBe("read_only");
    });

    it("rejects non-array field_placements_v1 root via merge after normalization", () => {
        const cfg = {
            ...baseWorkflowConfig(),
            field_placements_v1: { invalid: true },
        } as unknown as RecordLayoutConfigJson;
        const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(
            cfg,
            [{ field_key: "name", requirement_preset: "optional" }],
            catalog
        );
        expect(merged.ok).toBe(true);
        if (!merged.ok) return;
        expect(merged.config.field_placements_v1?.length).toBe(1);
        expect(merged.config.field_placements_v1?.[0]?.field_key).toBe("name");
    });
});
