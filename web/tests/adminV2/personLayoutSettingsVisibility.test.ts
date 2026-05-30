import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLayoutCompositionCapabilities } from "@/lib/adminV2/layouts/layoutCompositionCapabilities";
import {
    COMPLETION_BOOTSTRAP_RULE_GROUPS,
    groupCompletionBootstrapRules,
} from "@/lib/completion/completionBootstrapRulesCatalog";
import {
    PERSON_LAYOUT_VARIANT_CHILD,
    PERSON_LAYOUT_VARIANT_GENERIC,
    PERSON_LAYOUT_VARIANT_PARENT,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import { buildEffectiveDrawerLayoutPreview } from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import { buildPersonRuntimeLayoutSettingsPreview } from "@/lib/recordChrome/personDrawerLayoutSettingsPreview";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("person layout settings visibility (Phase 1)", () => {
    it("person capabilities use person-specific read-only copy, not schedule language", () => {
        const cap = resolveLayoutCompositionCapabilities({ entity: "person" });
        expect(cap.readOnlyReason).toMatch(/Runtime v1/i);
        expect(cap.readOnlyReason).toMatch(/child, parent, generic/i);
        expect(cap.readOnlyReason).not.toMatch(/Schedule drawer composition/i);
        expect(cap.isReadOnly).toBe(true);
        expect(cap.fidelity).toBe("presentation_ordered_skeleton");
    });

    it("person capabilities use person_runtime_mirror when runtime v1 active", () => {
        const cap = resolveLayoutCompositionCapabilities({
            entity: "person",
            personRuntimeV1Active: true,
        });
        expect(cap.fidelity).toBe("person_runtime_mirror");
    });

    it("buildPersonRuntimeLayoutSettingsPreview lists all three canonical variants", () => {
        const preview = buildPersonRuntimeLayoutSettingsPreview({
            person_drawer_mode: "runtime_v1",
            person_layout_variants: {
                [PERSON_LAYOUT_VARIANT_CHILD]: {
                    person_operating_sections: ["child_summary", "household"],
                },
                [PERSON_LAYOUT_VARIANT_PARENT]: {
                    person_operating_sections: ["parent_summary", "household", "household_address", "employee_status"],
                },
                [PERSON_LAYOUT_VARIANT_GENERIC]: {
                    person_operating_sections: [],
                    overview_section_order: ["basic_info", "contact_info"],
                },
            },
        });

        expect(preview.runtime_v1_active).toBe(true);
        expect(preview.person_drawer_mode).toBe("runtime_v1");
        expect(preview.layout_provenance).toBe("record_drawer_layouts");

        const keys = preview.variants.map((v) => v.variant_key);
        expect(keys).toEqual([
            PERSON_LAYOUT_VARIANT_CHILD,
            PERSON_LAYOUT_VARIANT_PARENT,
            PERSON_LAYOUT_VARIANT_GENERIC,
        ]);

        const child = preview.variants.find((v) => v.variant_key === PERSON_LAYOUT_VARIANT_CHILD)!;
        expect(child.operating_sections.map((s) => s.section_key)).toEqual(["child_summary", "household"]);
        expect(child.variant_provenance).toBe("record_drawer_layouts");

        const generic = preview.variants.find((v) => v.variant_key === PERSON_LAYOUT_VARIANT_GENERIC)!;
        expect(generic.operating_sections).toEqual([]);
        expect(generic.overview_section_order).toEqual(["basic_info", "contact_info"]);
    });

    it("falls back to code defaults when runtime v1 is not configured", () => {
        const preview = buildPersonRuntimeLayoutSettingsPreview({});
        expect(preview.runtime_v1_active).toBe(false);
        expect(preview.layout_provenance).toBe("code_default");
        expect(preview.variants).toHaveLength(3);
        expect(preview.variants.every((v) => v.variant_provenance === "code_default")).toBe(true);
    });

    it("buildEffectiveDrawerLayoutPreview uses person_runtime_mirror when runtime v1 configured", () => {
        const { fidelity, person_runtime } = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "persons",
            config: {
                person_drawer_mode: "runtime_v1",
                person_layout_variants: {
                    [PERSON_LAYOUT_VARIANT_CHILD]: {
                        person_operating_sections: ["child_summary", "household"],
                    },
                },
            },
        });
        expect(fidelity).toBe("person_runtime_mirror");
        expect(person_runtime?.variants.some((v) => v.variant_key === PERSON_LAYOUT_VARIANT_CHILD)).toBe(true);
    });

    it("completion bootstrap catalog exposes all four rule groups", () => {
        const grouped = groupCompletionBootstrapRules();
        for (const group of COMPLETION_BOOTSTRAP_RULE_GROUPS) {
            expect(grouped[group].length).toBeGreaterThan(0);
            expect(grouped[group].every((r) => r.source === "bootstrap_code")).toBe(true);
        }
    });

    it("RecordDrawerCompositionWorkspace mounts person preview and completion guardrails panels", () => {
        const workspace = read("components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx");
        expect(workspace).toContain("PersonRuntimeV1LayoutPreviewPanel");
        expect(workspace).toContain("CompletionGuardrailsSettingsPanel");
        expect(workspace).toContain('entity === "person"');
    });

    it("person preview panel renders runtime v1 and read-only badges", () => {
        const panel = read("components/adminV2/settings/PersonRuntimeV1LayoutPreviewPanel.tsx");
        expect(panel).toContain('data-testid="person-runtime-v1-badge"');
        expect(panel).toContain('data-testid="person-layout-read-only-badge"');
        expect(panel).toContain("variant.variant_key");
        expect(panel).toContain("Operating section order");
    });

    it("completion guardrails panel renders grouped bootstrap rules", () => {
        const panel = read("components/adminV2/settings/CompletionGuardrailsSettingsPanel.tsx");
        expect(panel).toContain('data-testid="completion-guardrails-settings-panel"');
        expect(panel).toContain('data-testid="completion-guardrails-read-only-badge"');
        expect(panel).toContain("completion-guardrails-group-${group}");
        expect(panel).toContain("COMPLETION_BOOTSTRAP_RULE_GROUPS.map");
    });
});
