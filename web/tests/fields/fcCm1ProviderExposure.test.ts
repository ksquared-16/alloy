/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
    assertCapabilityProviderParityForChildProfileSeeds,
    FC_CM1_CHILD_PROFILE_FIELD_KEYS,
} from "@/lib/fields/capabilityProviderParity";
import {
    assembleFocusPanelNestedProviders,
    assembleQueueRowProviders,
} from "@/lib/fields/consumerCanonicalProviderAssembly";
import { isReservedCustomerMemberFieldKey } from "@/lib/fields/customerMemberFieldRegistry";
import {
    isTenantLayoutFieldRenderable,
    type TenantFieldDefinitionRow,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";

function fcCm1Seed(fieldKey: string, extras?: Partial<TenantFieldDefinitionRow>): TenantFieldDefinitionRow {
    return {
        entity_type: "customer_member",
        field_key: fieldKey,
        field_type: fieldKey === "gender" ? "select" : "text",
        label: fieldKey === "gender" ? "Gender" : fieldKey,
        is_system: true,
        is_active: true,
        is_visible_in_drawer: true,
        section_key: "child_profile",
        config: fieldKey === "gender" ? { option_set_key: "person_gender" } : null,
        ...extras,
    };
}

describe("FC-CM-1 canonical provider exposure", () => {
    it("does not suppress FC-CM-1 seeds via reserved-key renderability gate", () => {
        for (const key of FC_CM1_CHILD_PROFILE_FIELD_KEYS) {
            expect(isReservedCustomerMemberFieldKey(key)).toBe(true);
            expect(isTenantLayoutFieldRenderable(fcCm1Seed(key))).toBe(true);
        }
    });

    it("still suppresses native customer_member columns from tenant field_definitions path", () => {
        expect(
            isTenantLayoutFieldRenderable(
                fcCm1Seed("first_name", { field_key: "first_name", field_type: "text", label: "First name" }),
            ),
        ).toBe(false);
    });

    it("Focus Panel assembly includes FC-CM-1 providers without picker allowlists", () => {
        const defs = FC_CM1_CHILD_PROFILE_FIELD_KEYS.map((key) => fcCm1Seed(key));
        const focus = assembleFocusPanelNestedProviders({ tenantFieldDefinitions: defs });
        for (const key of FC_CM1_CHILD_PROFILE_FIELD_KEYS) {
            expect(focus.some((p) => p.refKey === `child.${key}`)).toBe(true);
        }
        expect(focus.filter((p) => p.refKey === "child.gender")).toHaveLength(1);
    });

    it("Queue Row assembly excludes FC-CM-1 seeds that capability marks unavailable", () => {
        const defs = FC_CM1_CHILD_PROFILE_FIELD_KEYS.map((key) => fcCm1Seed(key));
        const queue = assembleQueueRowProviders({ tenantFieldDefinitions: defs });
        for (const key of FC_CM1_CHILD_PROFILE_FIELD_KEYS) {
            expect(queue.some((p) => p.refKey === `child.${key}`)).toBe(false);
        }
    });

    it("capability and provider availability agree for FC-CM-1 Focus Panel", () => {
        const defs = FC_CM1_CHILD_PROFILE_FIELD_KEYS.map((key) => fcCm1Seed(key));
        expect(assertCapabilityProviderParityForChildProfileSeeds(defs, "focus_panel")).toEqual({ ok: true });
        expect(assertCapabilityProviderParityForChildProfileSeeds(defs, "queue_row")).toEqual({ ok: true });
    });
});
