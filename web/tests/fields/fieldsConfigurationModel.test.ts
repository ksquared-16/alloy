/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    buildFieldsSectionGroups,
    fieldsEntityDescription,
    operatorFieldRegistryRefKey,
} from "@/lib/fields/fieldsConfigurationModel";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";

function field(over: Partial<FieldDef> & Pick<FieldDef, "field_key">): FieldDef {
    return {
        id: over.id ?? over.field_key,
        org_id: "org-1",
        entity_type: over.entity_type ?? "inquiry_child",
        field_key: over.field_key,
        field_type: over.field_type ?? "text",
        label: over.label ?? over.field_key,
        description: null,
        is_system: over.is_system ?? true,
        is_required: false,
        is_active: true,
        is_visible_in_form: over.is_visible_in_form ?? true,
        is_visible_in_drawer: over.is_visible_in_drawer ?? true,
        is_visible_in_table: over.is_visible_in_table ?? false,
        is_visible_in_public_booking: false,
        is_filterable: false,
        is_sortable: false,
        section_key: over.section_key ?? "inquiry_participation",
        sort_order: over.sort_order ?? 10,
        placeholder: null,
        help_text: null,
        config: over.config ?? null,
        requirement_policy: null,
        interaction_policy: null,
        created_at: "",
        updated_at: "",
    };
}

describe("fieldsConfigurationModel", () => {
    it("uses Child operator label, not Inquiry child", () => {
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).toBe("Child");
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).not.toMatch(/inquiry/i);
    });

    it("hides internal entity names in registry ref keys", () => {
        expect(operatorFieldRegistryRefKey("inquiry_child", "start_date")).toBe("child.start_date");
        expect(operatorFieldRegistryRefKey("customer_member", "gender")).toBe("child.gender");
    });

    it("groups child profile and enrollment fields into operator sections", () => {
        const groups = buildFieldsSectionGroups({
            enrollmentFields: [
                field({ field_key: "start_date", section_key: "inquiry_participation", sort_order: 10 }),
            ],
            profileFields: [
                field({
                    entity_type: "customer_member",
                    field_key: "gender",
                    section_key: "child_profile",
                    sort_order: 20,
                }),
            ],
            sectionRegistry: [],
            profileSectionRegistry: [],
            enrollmentEntityType: "inquiry_child",
            showSystemFields: false,
        });

        expect(groups.map((group) => group.sectionKey)).toEqual(["child_profile", "inquiry_participation"]);
        expect(groups.find((group) => group.sectionKey === "child_profile")?.rows[0]?.field.field_key).toBe("gender");
    });

    it("describes child fields without internal storage names", () => {
        const description = fieldsEntityDescription("inquiry_child");
        expect(description).toMatch(/child/i);
        expect(description).not.toMatch(/customer_member|inquiry_child|OCM/i);
    });
});
