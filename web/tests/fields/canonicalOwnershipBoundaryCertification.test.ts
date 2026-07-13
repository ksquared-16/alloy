/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { availableFieldsForFocusPanelCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker";
import {
    buildChildFocusSavePatch,
    seedChildFocusEditValues,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import {
    childFocusMutationValueKeyForRef,
    isEnrollmentOcmMutationValueKey,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import {
    reconcileLegacyChildEnrollmentAlias,
} from "@/lib/fields/canonicalFieldProjection";
import { assertCapabilityProviderParityForChildProfileSeeds } from "@/lib/fields/capabilityProviderParity";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import { canonicalPickerIdentityForRefKey } from "@/lib/fields/canonicalProviderDedup";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const root = resolve(__dirname, "../..");

function fcCm1Defs(): TenantFieldDefinitionRow[] {
    return CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.map((field_key) => ({
        entity_type: "customer_member",
        field_key,
        field_type: field_key === "gender" ? "select" : "text",
        label: field_key,
        is_system: true,
        is_active: true,
        is_visible_in_drawer: true,
        config: field_key === "gender" ? { option_set_key: "person_gender" } : null,
    }));
}

describe("canonical ownership boundary certification", () => {
    it("Focus Panel Children picker includes Gender via providers — no refKey allowlist", () => {
        const pickerSrc = readFileSync(
            resolve(root, "lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker.ts"),
            "utf8",
        );
        expect(pickerSrc).not.toMatch(/gender|preferred_name|allergies/);
        expect(pickerSrc).not.toMatch(/ALLOWLIST|allowlist/);

        const fields = availableFieldsForFocusPanelCard("children", fcCm1Defs());
        for (const key of CUSTOMER_MEMBER_CONFIG_FIELD_KEYS) {
            expect(fields.some((f) => f.key === `child.${key}`)).toBe(true);
        }
        expect(assertCapabilityProviderParityForChildProfileSeeds(fcCm1Defs(), "focus_panel")).toEqual({
            ok: true,
        });
    });

    it("new authoring identity resolves legacy child.program without duplicate picker rows", () => {
        const providers = assembleFocusPanelNestedProviders();
        const programRows = providers.filter(
            (p) => canonicalPickerIdentityForRefKey(p.refKey) === "inquiry_child.program",
        );
        expect(programRows).toHaveLength(1);
        expect(programRows[0]?.refKey).toBe("inquiry_child.program");
        expect(reconcileLegacyChildEnrollmentAlias("child.program")).toBe("inquiry_child.program");
    });

    it("Enrollment projection edits write OCM keys and never claim customer_member ownership", () => {
        const truth = {
            _inquiry_children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: null,
                    location_id: "loc-a",
                    program_category_id: "prog-a",
                    program_room_cohort_key: "room-a",
                    schedule_type: "full_time",
                    start_date: "2026-09-01",
                    dob: null,
                    display_name: "Ada",
                    first_name: "Ada",
                    last_name: "Lovelace",
                    desired_program_label: null,
                    desired_schedule_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                    notes: null,
                    age: null,
                },
            ],
        };
        const seed = seedChildFocusEditValues(truth, "ocm-1");
        expect(seed).toBeTruthy();
        const patch = buildChildFocusSavePatch({
            row: seed!.row,
            draft: {
                ...seed!.values,
                location_id: "loc-b",
                program_category_id: "prog-b",
                program_room_cohort_key: "room-b",
            },
            baseline: seed!.values,
            identityBaseline: seed!.identityBaseline,
            editableKeys: new Set(["location_id", "program_category_id", "program_room_cohort_key"]),
        });
        expect(patch.ocmPatch.location_id).toBe("loc-b");
        expect(patch.ocmPatch.program_category_id).toBe("prog-b");
        expect(patch.ocmPatch.program_room_cohort_key).toBe("room-b");
        expect(Object.keys(patch.identityPatch)).toHaveLength(0);
        for (const ref of [
            "child.program",
            "inquiry_child.program",
            "child.location",
            "inquiry_child.location_id",
            "child.room",
        ] as const) {
            const valueKey = childFocusMutationValueKeyForRef(ref)!;
            expect(isEnrollmentOcmMutationValueKey(valueKey)).toBe(true);
        }
    });
});
