import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPersonFirstViewportPlan, resolvePersonDrawerVmSurface } from "@/lib/adminV2/viewModel/drawer/person/personDrawerFirstViewportContract";
import { buildChildFirstViewportPlan } from "@/lib/adminV2/viewModel/drawer/child/childDrawerFirstViewportContract";
import { resolvePersonDrawerVmOverviewSections } from "@/lib/admin/person/resolvePersonDrawerVmOverviewSections";
import { PERSON_LAYOUT_VARIANT_DEFAULTS, PERSON_LAYOUT_VARIANT_GENERIC } from "@/lib/admin/person/personDrawerLayoutRuntime";

const webRoot = join(__dirname, "../../..");

function readWebFile(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("personDrawerVmParity", () => {

    it("generic surface has empty operating sections but still resolves overview sections", () => {
        const plan = buildPersonFirstViewportPlan(
            resolvePersonDrawerVmSurface({ openSource: "queue_row", presentationEmphasis: null })
        );
        expect(plan.surface).toBe("generic");
        expect(plan.operating_sections).toEqual([]);
        const sections = resolvePersonDrawerVmOverviewSections({
            record: {
                _field_definitions: [
                    {
                        field_key: "email",
                        field_type: "text",
                        label: "Email",
                        section_key: "contact_info",
                        sort_order: 1,
                        is_visible_in_drawer: true,
                    },
                ],
            },
            chrome: "generic",
            layoutVariant: {
                variant_key: PERSON_LAYOUT_VARIANT_GENERIC,
                source: "code_default",
                config: PERSON_LAYOUT_VARIANT_DEFAULTS[PERSON_LAYOUT_VARIANT_GENERIC]!,
            },
        });
        expect(sections?.some((s) => s.key === "contact_info")).toBe(true);
    });

    it("parent overview suppresses generic profile/contact duplicates", () => {
        const sections = resolvePersonDrawerVmOverviewSections({
            record: {
                _field_definitions: [
                    {
                        field_key: "email",
                        field_type: "text",
                        label: "Email",
                        section_key: "contact_info",
                        sort_order: 1,
                        is_visible_in_drawer: true,
                    },
                    {
                        field_key: "notes",
                        field_type: "text",
                        label: "Notes",
                        section_key: "profile",
                        sort_order: 2,
                        is_visible_in_drawer: true,
                    },
                ],
                is_employee: false,
            },
            chrome: "parent",
            layoutVariant: {
                variant_key: "person_parent_operating_v1",
                source: "code_default",
                config: PERSON_LAYOUT_VARIANT_DEFAULTS.person_parent_operating_v1!,
            },
            parentChromeHint: { presentation_emphasis: "guardian_communication" },
        });
        const keys = (sections ?? []).map((s) => s.key);
        expect(keys).not.toContain("profile");
    });
});
