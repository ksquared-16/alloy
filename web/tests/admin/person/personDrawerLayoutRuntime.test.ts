import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    filterPersonDrawerOverviewSectionsForLayoutRuntime,
    PERSON_LAYOUT_VARIANT_CHILD,
    PERSON_LAYOUT_VARIANT_PARENT,
    personDrawerLayoutRuntimeActive,
    resolvePersonDrawerLayoutVariant,
    resolvePersonOperatingSections,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const runtimeLayoutConfig: RecordLayoutConfigJson = {
    version: 1,
    person_drawer_mode: "runtime_v1",
    person_layout_variants: {
        person_child_operating_v1: {
            presentation_emphasis: "child_lifecycle",
            person_operating_sections: ["child_summary", "household"],
            overview_suppressed_sections: ["basic_info", "contact_info"],
            dedicated_field_keys: ["first_name"],
        },
        person_parent_operating_v1: {
            presentation_emphasis: "guardian_communication",
            person_operating_sections: ["parent_summary", "household", "household_address", "employee_status"],
            overview_suppressed_sections: ["contact_info"],
        },
    },
};

describe("personDrawerLayoutRuntime", () => {
    it("detects runtime_v1 layout from DB config", () => {
        expect(personDrawerLayoutRuntimeActive(runtimeLayoutConfig)).toBe(true);
        expect(personDrawerLayoutRuntimeActive({ version: 1 })).toBe(false);
    });

    it("selects child layout variant for child operating chrome", () => {
        const resolved = resolvePersonDrawerLayoutVariant(runtimeLayoutConfig, {
            childOperatingChrome: true,
            parentOperatingChrome: false,
        });
        expect(resolved.variant_key).toBe(PERSON_LAYOUT_VARIANT_CHILD);
        expect(resolved.source).toBe("record_drawer_layouts");
        expect(resolvePersonOperatingSections(resolved)).toEqual(["child_summary", "household"]);
    });

    it("selects parent layout variant for parent operating chrome", () => {
        const resolved = resolvePersonDrawerLayoutVariant(runtimeLayoutConfig, {
            childOperatingChrome: false,
            parentOperatingChrome: true,
        });
        expect(resolved.variant_key).toBe(PERSON_LAYOUT_VARIANT_PARENT);
        expect(resolvePersonOperatingSections(resolved)).toContain("parent_summary");
        expect(resolvePersonOperatingSections(resolved)).toContain("employee_status");
    });

    it("falls back to code defaults when DB layout is absent", () => {
        const resolved = resolvePersonDrawerLayoutVariant(null, {
            childOperatingChrome: true,
            parentOperatingChrome: false,
        });
        expect(resolved.source).toBe("code_default");
        expect(resolvePersonOperatingSections(resolved)).toEqual(["child_summary", "household"]);
    });

    it("filters overview sections from layout config instead of TS suppression lists", () => {
        const resolved = resolvePersonDrawerLayoutVariant(runtimeLayoutConfig, {
            childOperatingChrome: true,
            parentOperatingChrome: false,
        });
        const sections = filterPersonDrawerOverviewSectionsForLayoutRuntime(
            [
                { key: "basic_info", fields: [{ key: "first_name" }] },
                { key: "medical", fields: [{ key: "allergies" }] },
            ],
            resolved
        );
        expect(sections.map((s) => s.key)).toEqual(["medical"]);
    });

    it("child-first: parent variant not selected when child chrome active", () => {
        const resolved = resolvePersonDrawerLayoutVariant(runtimeLayoutConfig, {
            childOperatingChrome: true,
            parentOperatingChrome: true,
        });
        expect(resolved.variant_key).toBe(PERSON_LAYOUT_VARIANT_CHILD);
    });

});
