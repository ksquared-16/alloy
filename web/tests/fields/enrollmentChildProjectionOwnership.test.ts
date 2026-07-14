/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
    availableFieldsForFocusPanelCard,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker";
import {
    childFocusMutationValueKeyForRef,
    isEnrollmentOcmMutationValueKey,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import {
    CHILD_ENROLLMENT_PROJECTIONS,
    CURRENT_ENROLLMENT_PROJECTION_RESOLUTION,
    enrollmentAssignmentOwnerEntity,
    isEnrollmentAssignmentFieldKeyOnCustomerMember,
    isEnrollmentOwnedChildProjection,
    reconcileLegacyChildEnrollmentAlias,
} from "@/lib/fields/canonicalFieldProjection";
import { validateFieldDefinitionOwnership } from "@/lib/fields/canonicalFieldOwnership";
import {
    childHubOwnershipGrainForEntry,
    groupCatalogEntriesByChildOwnershipGrain,
    type SettingsFieldCatalogEntry,
} from "@/lib/fields/fieldCatalogForSettings";
import { canonicalPickerIdentityForRefKey } from "@/lib/fields/canonicalProviderDedup";

function entry(partial: Partial<SettingsFieldCatalogEntry> & Pick<SettingsFieldCatalogEntry, "entity_type" | "refKey" | "label">): SettingsFieldCatalogEntry {
    return {
        id: partial.id ?? partial.refKey,
        ownership: partial.ownership ?? "platform",
        field_type: partial.field_type ?? "text",
        section_key: partial.section_key ?? "general",
        editable: false,
        configurable: false,
        ...partial,
    };
}

describe("Enrollment Child surface projections", () => {
    it("defines Current Program/Location/Room as Enrollment-owned with Child projection subject", () => {
        for (const row of CHILD_ENROLLMENT_PROJECTIONS) {
            expect(row.ownerEntity).toBe("inquiry_child");
            expect(row.projectionSubject).toBe("child");
            expect(row.projectionKind).toBe("current_enrollment");
        }
        expect(enrollmentAssignmentOwnerEntity("inquiry_child.program")).toBe("inquiry_child");
        expect(enrollmentAssignmentOwnerEntity("inquiry_child.location_id")).toBe("inquiry_child");
        expect(enrollmentAssignmentOwnerEntity("inquiry_child.program_room_cohort_key")).toBe("inquiry_child");
        expect(isEnrollmentOwnedChildProjection("child.program")).toBe(true);
    });

    it("keeps option masters distinct from assignment ownership", () => {
        const program = CHILD_ENROLLMENT_PROJECTIONS.find((p) => p.providerRef === "inquiry_child.program");
        expect(program?.optionSourceEntity).toBe("location_program_category");
        expect(program?.ownerEntity).toBe("inquiry_child");
    });

    it("does not invent a silent first-row current-enrollment rule", () => {
        expect(CURRENT_ENROLLMENT_PROJECTION_RESOLUTION.silentFirstRowForbidden).toBe(true);
        expect(CURRENT_ENROLLMENT_PROJECTION_RESOLUTION.kind).toBe("bound_inquiry_child_participation_row");
    });

    it("rejects Enrollment assignment keys on customer_member ownership", () => {
        expect(isEnrollmentAssignmentFieldKeyOnCustomerMember("program_category_id")).toBe(true);
        expect(validateFieldDefinitionOwnership("customer_member", "program_category_id")).toMatch(/inquiry_child|enrollment/i);
    });

    it("Focus Panel Children picker includes Enrollment projections with Current labels", () => {
        const fields = availableFieldsForFocusPanelCard("children");
        const program = fields.find((f) => f.key === "inquiry_child.program");
        expect(program).toBeTruthy();
        const providers = assembleFocusPanelNestedProviders();
        const enriched = providers.find((p) => p.refKey === "inquiry_child.program");
        expect(enriched?.projection?.ownerEntity).toBe("inquiry_child");
        expect(enriched?.label).toBe("Current Program");
        expect(fields.some((f) => f.key === "inquiry_child.location_id")).toBe(true);
        expect(fields.some((f) => f.key === "inquiry_child.program_room_cohort_key")).toBe(true);
    });

    it("legacy child.program reconciles to Enrollment provider and OCM mutation", () => {
        expect(reconcileLegacyChildEnrollmentAlias("child.program")).toBe("inquiry_child.program");
        expect(canonicalPickerIdentityForRefKey("child.program")).toBe("inquiry_child.program");
        const valueKey = childFocusMutationValueKeyForRef("child.program");
        expect(valueKey).toBe("program_category_id");
        expect(isEnrollmentOcmMutationValueKey(valueKey!)).toBe(true);
        expect(childFocusMutationValueKeyForRef("child.location")).toBe("location_id");
        expect(childFocusMutationValueKeyForRef("inquiry_child.location_id")).toBe("location_id");
    });

    it("Settings Child hub ownership grains separate profile from enrollment", () => {
        const entries = [
            entry({
                entity_type: "customer_member",
                refKey: "child.gender",
                label: "Gender",
                section_key: "child_profile",
            }),
            entry({
                entity_type: "inquiry_child",
                refKey: "inquiry_child.program",
                label: "Program",
                section_key: "enrollment",
            }),
            entry({
                entity_type: "inquiry_child",
                refKey: "child.age",
                label: "Age",
                ownership: "computed",
                section_key: "runtime_signals",
                computedField: {
                    refKey: "child.age",
                    label: "Age",
                    field_type: "text",
                    section_key: "runtime_signals",
                    entity_type: "inquiry_child",
                    ownership: "computed",
                    source_derivation: "dob",
                    concept_kind: "calculated_field",
                } as never,
            }),
        ];
        expect(childHubOwnershipGrainForEntry(entries[0]!)).toBe("child_profile");
        expect(childHubOwnershipGrainForEntry(entries[1]!)).toBe("enrollment");
        expect(childHubOwnershipGrainForEntry(entries[2]!)).toBe("calculated");
        const groups = groupCatalogEntriesByChildOwnershipGrain(entries);
        expect(groups.get("child_profile")?.map((e) => e.refKey)).toContain("child.gender");
        expect(groups.get("enrollment")?.map((e) => e.refKey)).toContain("inquiry_child.program");
    });
});
