import { describe, expect, it } from "vitest";
import {
    parseFieldPlacementRow,
    parseFieldPlacementsFromLayoutConfig,
    getDrawerOverviewPlacementBehavior,
} from "@/lib/fields/fieldPlacementV1";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

describe("fieldPlacementV1", () => {
    it("parses valid placement row with drawer_overview requirement and interaction", () => {
        const row = parseFieldPlacementRow({
            field_key: "notes",
            section_key: "inquiry",
            sort_order: 5,
            surfaces: {
                drawer_overview: {
                    requirement: { version: 1, mode: "required_on_save", validation_scope: "save" },
                    interaction: {
                        version: 1,
                        editability_mode: "read_only",
                        ownership: {
                            source_entity: "opportunity",
                            source_field: "notes",
                            write_target_entity: "opportunity",
                            write_target_field: "notes",
                            write_behavior: "none",
                            lock_reason: "read_only_policy",
                        },
                    },
                },
            },
        });
        expect(row).not.toBeNull();
        expect(row?.field_key).toBe("notes");
        expect(row?.section_key).toBe("inquiry");
        expect(row?.sort_order).toBe(5);
        expect(row?.surfaces.drawer_overview?.requirement?.mode).toBe("required_on_save");
        expect(row?.surfaces.drawer_overview?.interaction?.editability_mode).toBe("read_only");
    });

    it("skips row without field_key or surfaces", () => {
        expect(parseFieldPlacementRow({})).toBeNull();
        expect(parseFieldPlacementRow({ field_key: "a", surfaces: {} })).toBeNull();
    });

    it("skips invalid requirement but keeps valid interaction", () => {
        const row = parseFieldPlacementRow({
            field_key: "x",
            surfaces: {
                drawer_overview: {
                    requirement: { version: 1, mode: "conditionally_required" },
                    interaction: {
                        version: 1,
                        editability_mode: "editable",
                        ownership: {
                            source_entity: "opportunity",
                            source_field: "x",
                            write_target_entity: "opportunity",
                            write_target_field: "x",
                            write_behavior: "direct",
                        },
                    },
                },
            },
        });
        expect(row?.surfaces.drawer_overview?.requirement).toBeUndefined();
        expect(row?.surfaces.drawer_overview?.interaction?.editability_mode).toBe("editable");
    });

    it("parseFieldPlacementsFromLayoutConfig returns empty map for non-array", () => {
        const r = parseFieldPlacementsFromLayoutConfig({
            field_placements_v1: { bad: true } as unknown as RecordLayoutConfigJson["field_placements_v1"],
        });
        expect(r.byFieldKey.size).toBe(0);
        expect(r.skippedCount).toBe(1);
    });

    it("indexes by field_key with last row winning", () => {
        const cfg: RecordLayoutConfigJson = {
            field_placements_v1: [
                {
                    field_key: "name",
                    surfaces: {
                        drawer_overview: {
                            requirement: { version: 1, mode: "optional" },
                        },
                    },
                },
                {
                    field_key: "name",
                    surfaces: {
                        drawer_overview: {
                            requirement: { version: 1, mode: "required" },
                        },
                    },
                },
            ],
        };
        const r = parseFieldPlacementsFromLayoutConfig(cfg);
        expect(r.byFieldKey.get("name")?.surfaces.drawer_overview?.requirement?.mode).toBe("required");
    });

    it("getDrawerOverviewPlacementBehavior returns null for unknown key", () => {
        const r = parseFieldPlacementsFromLayoutConfig({ field_placements_v1: [] });
        expect(getDrawerOverviewPlacementBehavior(r, "missing")).toBeNull();
    });
});
