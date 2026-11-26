import { describe, expect, it } from "vitest";
import {
    childcareFieldCatalogClass,
    isChildcareCanonicalField,
    isChildcareOperatorPickerVisible,
    isEnrollmentOperatorFieldVisible,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import { isOperatorHiddenField } from "@/lib/fields/fieldSettingsOperatorUi";
import { buildFormSystemFieldPicker } from "@/lib/fields/formFieldRegistryPicker";
import { resolveDrawerFieldPolicy } from "@/lib/fields/drawerFieldPolicyAdapter";
import { ruleIdToCanonicalRef, systemFieldIdToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import {
    isChildcareCatalogRefKey,
    isChildcareHiddenRefKey,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import { fieldDefToCatalog, mergeCatalogWithCuratedFallback } from "@/lib/layout/fieldCatalog";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import {
    buildLayoutRuntimeOpportunityNativePatch,
    isLayoutRuntimeOpportunityNativeRefKey,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { isLayoutRuntimeEditableRefKeySupported } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { inquiryChildPlacementMetadataForRefKey } from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import { submitAddInquiryChildFromDrawer } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import { vi, beforeEach } from "vitest";

vi.mock("@/lib/admin/drawer/inquiryChildFieldEdit", () => ({
    ensureOpportunityCustomerMemberLink: vi.fn().mockResolvedValue({ ocmId: "ocm-1" }),
    patchOpportunityCustomerMemberFromInquiryChild: vi.fn().mockResolvedValue(undefined),
}));

import { patchOpportunityCustomerMemberFromInquiryChild } from "@/lib/admin/drawer/inquiryChildFieldEdit";

const LEAD_LOCATION_FIELD_DEF = {
    entity_type: "opportunity",
    field_key: "location_id",
    field_type: "select",
    label: "Location",
    is_system: true,
    is_active: true,
    config: {
        operator_catalog_class: "operator_configurable",
        option_source: "locations",
        field_kind: "entity_reference",
        target_entity_type: "location",
        storage_class: "native_column",
        storage_table: "opportunities",
        storage_column: "location_id",
    },
};

describe("lead location field exposure", () => {
    it("shows Lead Location in Fields as operator-configurable reference, not relationship_reference", () => {
        expect(childcareFieldCatalogClass("opportunity", "location_id", LEAD_LOCATION_FIELD_DEF.config)).toBe(
            "operator_configurable",
        );
        expect(isChildcareCanonicalField("opportunity", "location_id")).toBe(true);
        expect(isChildcareOperatorPickerVisible("opportunity", "location_id", { is_system: true })).toBe(true);
        expect(isEnrollmentOperatorFieldVisible("opportunity", "location_id", { is_system: true })).toBe(true);
        expect(
            isOperatorHiddenField("opportunity", {
                field_key: "location_id",
                is_system: true,
                label: "Location",
                config: LEAD_LOCATION_FIELD_DEF.config,
            }),
        ).toBe(false);
    });

    it("maps opportunity location_id to native column PATCH, not field_values", () => {
        const policy = resolveDrawerFieldPolicy("opportunity", {
            field_key: "location_id",
            is_system: true,
        });
        expect(policy).toMatchObject({
            storage: "column",
            bodyKey: "location_id",
            policyMode: "enforceable",
        });
    });

    it("offers Lead Location in BP Stage Requirements on lead stage without child location", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", {
            opportunity: [LEAD_LOCATION_FIELD_DEF],
            child: [
                {
                    entity_type: "inquiry_child",
                    field_key: "location_id",
                    label: "Location",
                    is_system: true,
                    is_active: true,
                },
            ],
        });
        expect(palette.some((e) => e.rule_id === "opportunity:location")).toBe(true);
        expect(palette.some((e) => e.rule_id === "child:location")).toBe(false);
    });

    it("still offers Child Location separately on waitlist stage", () => {
        const palette = mergeLifecycleFieldPaletteForStage("waitlist", {
            opportunity: [LEAD_LOCATION_FIELD_DEF],
            child: [
                {
                    entity_type: "inquiry_child",
                    field_key: "location_id",
                    label: "Location",
                    is_system: true,
                    is_active: true,
                },
            ],
        });
        expect(palette.some((e) => e.rule_id === "child:location")).toBe(true);
        expect(palette.some((e) => e.rule_id === "opportunity:location")).toBe(false);
    });

    it("includes opportunity.location_id in layout picker and runtime editability", () => {
        expect(isChildcareHiddenRefKey("opportunity.location_id")).toBe(false);
        expect(isChildcareCatalogRefKey("opportunity.location_id")).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported("opportunity.location_id")).toBe(true);
        expect(isLayoutRuntimeOpportunityNativeRefKey("opportunity.location_id")).toBe(true);

        const merged = mergeCatalogWithCuratedFallback("opportunity", [
            fieldDefToCatalog("opportunity", LEAD_LOCATION_FIELD_DEF),
        ]);
        expect(merged.some((f) => f.refKey === "opportunity.location_id")).toBe(true);
    });

    it("resolves locations picker for opportunity.location_id", () => {
        const control = resolveLayoutRuntimeFieldControl("opportunity.location_id", LEAD_LOCATION_FIELD_DEF);
        expect(control.controlType).toBe("select");
        expect(control.option_source).toBe("locations");
    });

    it("builds PATCH body for opportunities.location_id", () => {
        const patch = buildLayoutRuntimeOpportunityNativePatch(
            { "opportunity.location_id": "" },
            { "opportunity.location_id": "11111111-1111-4111-8111-111111111111" },
        );
        expect(patch).toEqual({ location_id: "11111111-1111-4111-8111-111111111111" });
    });

    it("exposes lead_site forms system field mapped to opportunity.location_id", () => {
        const picker = buildFormSystemFieldPicker([LEAD_LOCATION_FIELD_DEF], []);
        expect(picker.some((e) => e.field_key === "lead_site")).toBe(true);
        expect(systemFieldIdToCanonicalRef("lead_site")).toEqual({
            entity_type: "opportunity",
            field_key: "location_id",
        });
        expect(ruleIdToCanonicalRef("opportunity:location")).toEqual({
            entity_type: "opportunity",
            field_key: "location_id",
        });
        expect(lifecycleFieldRuleBinding("opportunity:location")?.opportunity_field).toBe("location_id");
    });

    it("does not regress child program cascade metadata", () => {
        const programMeta = inquiryChildPlacementMetadataForRefKey("inquiry_child.program_category_id");
        expect(programMeta?.option_source).toBe("programs_for_location");
        expect(programMeta?.depends_on_field_key).toBe("location_id");
        const childLocation = inquiryChildPlacementMetadataForRefKey("inquiry_child.location_id");
        expect(childLocation?.option_source).toBe("locations");
        expect(childLocation?.entity_scope).toBe("inquiry_child");
    });
});

describe("add child lead location inheritance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("inherits lead location when child omits location_id", async () => {
        const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
            if (url === "/api/admin/customer-members" && init?.method === "POST") {
                return {
                    ok: true,
                    json: async () => ({ id: "cm-new", person_id: "person-new" }),
                } as Response;
            }
            throw new Error(`unexpected fetch ${url}`);
        });

        await submitAddInquiryChildFromDrawer({
            opportunityId: "opp-1",
            customerId: "cust-1",
            opportunityLocationId: "11111111-1111-4111-8111-111111111111",
            payload: {
                first_name: "Sam",
                last_name: "Lee",
                date_of_birth: "2020-05-01",
                age_group: "toddler",
                location_id: null,
            },
            existingChildren: [],
            fetchFn,
        });

        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith(
            "ocm-1",
            expect.objectContaining({
                location_id: "11111111-1111-4111-8111-111111111111",
            }),
        );
    });

    it("child override does not patch lead opportunity row", async () => {
        const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
            if (url === "/api/admin/customer-members" && init?.method === "POST") {
                return {
                    ok: true,
                    json: async () => ({ id: "cm-new", person_id: "person-new" }),
                } as Response;
            }
            if (url.includes("/api/admin/opportunities/")) {
                throw new Error("lead opportunity must not be patched when saving child");
            }
            throw new Error(`unexpected fetch ${url}`);
        });

        await submitAddInquiryChildFromDrawer({
            opportunityId: "opp-1",
            customerId: "cust-1",
            opportunityLocationId: "11111111-1111-4111-8111-111111111111",
            payload: {
                first_name: "Sam",
                last_name: "Lee",
                date_of_birth: "2020-05-01",
                age_group: "toddler",
                location_id: "22222222-2222-4222-8222-222222222222",
            },
            existingChildren: [],
            fetchFn,
        });

        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith(
            "ocm-1",
            expect.objectContaining({
                location_id: "22222222-2222-4222-8222-222222222222",
            }),
        );
        expect(fetchFn).not.toHaveBeenCalledWith(expect.stringContaining("/api/admin/opportunities/"), expect.anything());
    });
});
