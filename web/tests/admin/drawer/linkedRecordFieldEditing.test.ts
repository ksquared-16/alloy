import { describe, expect, it, vi } from "vitest";
import {
    applyPersonPatchToOpportunityHydration,
    partitionOpportunitySaveByLinkedFields,
    patchLinkedPersonFromOpportunityDrawer,
    resolveOpportunityLinkedFieldSources,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { personFieldOnOpportunityInteractionPolicy } from "@/lib/fields/fieldInteractionPolicy";
import { buildDrawerFieldPolicyChromeFromEntityData } from "@/lib/admin/drawer/fieldEditabilityInDrawer";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

function oppRecord(overrides: Record<string, unknown> = {}) {
    return {
        primary_person_id: PERSON_ID,
        _primary_person_id: PERSON_ID,
        _primary_person_name: "Ada Lovelace",
        _primary_person_email: "ada@example.com",
        _primary_person_phone: "555-0100",
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        phone: "555-0100",
        ...overrides,
    };
}

function personFieldDef(fieldKey: string) {
    return {
        field_key: fieldKey,
        entity_type: "opportunity",
        is_system: false,
        is_visible_in_drawer: true,
        interaction_policy: personFieldOnOpportunityInteractionPolicy(fieldKey),
    };
}

describe("linkedRecordFieldEditing", () => {
    it("resolves editable linked person field when policy allows and person is linked", () => {
        const sources = resolveOpportunityLinkedFieldSources(oppRecord(), [personFieldDef("first_name")]);
        expect(sources.first_name?.editable).toBe(true);
        expect(sources.first_name?.source_record_id).toBe(PERSON_ID);
        expect(sources.first_name?.patch_route).toBe(`/api/admin/persons/${PERSON_ID}`);
        expect(sources.first_name?.target_field_key).toBe("first_name");
    });

    it("marks linked field read-only when primary person is missing", () => {
        const sources = resolveOpportunityLinkedFieldSources(
            oppRecord({ primary_person_id: null, _primary_person_id: null }),
            [personFieldDef("email")]
        );
        expect(sources.email?.editable).toBe(false);
        expect(sources.email?.read_only_reason).toMatch(/primary person/i);
    });

    it("partitions save so person mirror fields PATCH person not opportunity", () => {
        const record = oppRecord();
        const defs = [personFieldDef("first_name"), personFieldDef("last_name")];
        const initial = { first_name: "Ada", last_name: "Lovelace", name: "Inquiry A" };
        const formData = { ...initial, first_name: "Augusta", name: "Inquiry B" };
        const { opportunityPayload, personPatch, personId } = partitionOpportunitySaveByLinkedFields({
            formData,
            initial,
            record,
            defs,
        });
        expect(personId).toBe(PERSON_ID);
        expect(personPatch).toEqual({ first_name: "Augusta" });
        expect(opportunityPayload.first_name).toBeUndefined();
        expect(opportunityPayload.last_name).toBeUndefined();
        expect(opportunityPayload.name).toBe("Inquiry B");
    });

    it("buildDrawerFieldPolicyChrome marks linked person field editable with source label", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                ...oppRecord(),
                _field_definitions: [personFieldDef("phone")],
                _field_policy_resolved: {
                    phone: {
                        entityType: "opportunity",
                        fieldKey: "phone",
                        storage: "field_values",
                        bodyKey: "phone",
                        policyMode: "enforceable",
                        requirementSupported: true,
                        interactionSupported: true,
                        reason: "test",
                    },
                },
            },
            "opportunities"
        );
        expect(chrome.phone?.readOnly).toBe(false);
        expect(chrome.phone?.linkedSourceLabel).toBe("Primary person");
    });

    it("applyPersonPatchToOpportunityHydration updates mirror and display fields", () => {
        const host: Record<string, unknown> = { _primary_person_id: PERSON_ID };
        applyPersonPatchToOpportunityHydration(host, {
            first_name: "Grace",
            last_name: "Hopper",
            full_name: "Grace Hopper",
            email: "grace@example.com",
            phone: "555-0199",
        });
        expect(host.first_name).toBe("Grace");
        expect(host._primary_person_name).toBe("Grace Hopper");
        expect(host._primary_person_email).toBe("grace@example.com");
    });

    it("patchLinkedPersonFromOpportunityDrawer surfaces permission denied", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => ({ error: "Forbidden" }),
        });
        const result = await patchLinkedPersonFromOpportunityDrawer({
            personId: PERSON_ID,
            body: { first_name: "Test" },
            fetchFn: fetchFn as unknown as typeof fetch,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.error).toBe("Forbidden");
        }
        expect(fetchFn).toHaveBeenCalledWith(
            `/api/admin/persons/${PERSON_ID}`,
            expect.objectContaining({ method: "PATCH" })
        );
    });

    it("patchLinkedPersonFromOpportunityDrawer calls person route on success", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ id: PERSON_ID, first_name: "Saved" }),
        });
        const result = await patchLinkedPersonFromOpportunityDrawer({
            personId: PERSON_ID,
            body: { first_name: "Saved" },
            fetchFn: fetchFn as unknown as typeof fetch,
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.json.first_name).toBe("Saved");
        }
    });
});
