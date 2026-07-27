import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { resolveCreateLeadHouseholdCardEditFields } from "@/lib/admin/actions/createLead/household/resolveCreateLeadHouseholdCardEditFields";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

function specWithChild(): ActionIntakeSpec {
    const base = createLeadParserSpec("dept-1");
    const childFields = [
        {
            rule_id: "child:first_name",
            entity: "child" as const,
            entity_label: "Child",
            field_label: "First Name",
            tier: "recommended" as const,
            field_key: "child_first_name",
            value_kind: "text" as const,
            option_set_key: null,
            placement_select: null,
            payload_key: "child_first_name",
            form_capture_keys: [] as const,
            validation: [],
            runtime_enforced: false,
        },
        {
            rule_id: "child:last_name",
            entity: "child" as const,
            entity_label: "Child",
            field_label: "Last Name",
            tier: "recommended" as const,
            field_key: "child_last_name",
            value_kind: "text" as const,
            option_set_key: null,
            placement_select: null,
            payload_key: "child_last_name",
            form_capture_keys: [] as const,
            validation: [],
            runtime_enforced: false,
        },
        {
            rule_id: "child:date_of_birth",
            entity: "child" as const,
            entity_label: "Child",
            field_label: "Date of Birth",
            tier: "recommended" as const,
            field_key: "child_date_of_birth",
            value_kind: "date" as const,
            option_set_key: null,
            placement_select: null,
            payload_key: "child_date_of_birth",
            form_capture_keys: [] as const,
            validation: [],
            runtime_enforced: false,
        },
    ];
    return {
        ...base,
        groups: [
            ...base.groups,
            { entity: "child", entity_label: "Child", fields: childFields },
        ],
        recommended: [...base.recommended, ...childFields],
    };
}

describe("resolveCreateLeadHouseholdCardEditFields", () => {
    it("surfaces email and phone in the required parent block (code-owned contact)", () => {
        const groups = resolveCreateLeadHouseholdCardEditFields({
            entityType: "parent",
            intakeSpec: createLeadParserSpec("dept-1"),
        });
        const keys = groups.required.map((f) => f.payload_key);
        expect(keys).toEqual(expect.arrayContaining(["first_name", "last_name", "email", "phone"]));
        expect(groups.additional.map((f) => f.payload_key)).not.toContain("email");
        expect(groups.additional.map((f) => f.payload_key)).not.toContain("phone");
    });

    it("surfaces child first/last name in the required child block when Child is configured", () => {
        const groups = resolveCreateLeadHouseholdCardEditFields({
            entityType: "child",
            intakeSpec: specWithChild(),
        });
        const keys = groups.required.map((f) => f.payload_key);
        expect(keys).toEqual(expect.arrayContaining(["child_first_name", "child_last_name"]));
        expect(groups.additional.map((f) => f.payload_key)).not.toContain("child_first_name");
        expect(groups.additional.map((f) => f.payload_key)).not.toContain("child_last_name");
        expect(groups.additional.map((f) => f.payload_key)).toEqual(
            expect.arrayContaining(["child_date_of_birth"])
        );
    });
});
