import { describe, expect, it } from "vitest";
import {
    filterSystemFieldsForCollectionIteration,
    nestedFieldCompatibilityForIteration,
    partitionNestedFieldsForProviderSwitch,
} from "@/lib/forms/collection/formsCollectionNestedFieldEligibility";
import { buildCollectionIterationContext } from "@/lib/fields/collection/collectionIterationContext";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

const childrenContext = buildCollectionIterationContext({
    collectionProviderRef: "children",
    itemEntityType: "customer_member",
});

const parentsContext = buildCollectionIterationContext({
    collectionProviderRef: "person.contact_role.parents",
    itemEntityType: "person",
});

describe("collection nested field picker filtering", () => {
    it("allows customer_member fields for Children iteration", () => {
        const filtered = filterSystemFieldsForCollectionIteration(OPERATIONAL_FORM_SYSTEM_FIELDS, childrenContext);
        expect(filtered.some((e) => e.field_key === "child_first_name")).toBe(true);
        expect(filtered.some((e) => e.field_key === "child_date_of_birth")).toBe(true);
    });

    it("excludes inquiry_child fields when inquiry_child context is absent", () => {
        const filtered = filterSystemFieldsForCollectionIteration(OPERATIONAL_FORM_SYSTEM_FIELDS, childrenContext);
        expect(filtered.some((e) => e.entity_type === "enrollment")).toBe(false);
    });

    it("allows person fields for Parents iteration", () => {
        const filtered = filterSystemFieldsForCollectionIteration(OPERATIONAL_FORM_SYSTEM_FIELDS, parentsContext);
        expect(filtered.some((e) => e.entity_type === "guardian" || e.field_key.includes("guardian"))).toBe(true);
    });

    it("marks saved program field as legacy_retained with missing-context reason", () => {
        const compat = nestedFieldCompatibilityForIteration(
            {
                id: "prog",
                type: "select",
                label: "Program",
                required: false,
                field_source: { entity_type: "enrollment", field_key: "program_category_id" },
            },
            childrenContext,
        );
        expect(compat.status).not.toBe("compatible");
        if (compat.status !== "compatible") {
            expect(compat.reason).toMatch(/inquiry|enrollment/i);
        }
    });

    it("partitions fields on provider switch", () => {
        const childField = {
            id: "fn",
            type: "text" as const,
            label: "First",
            required: false,
            field_source: { entity_type: "child", field_key: "child_first_name" },
        };
        const { keep, incompatible } = partitionNestedFieldsForProviderSwitch([childField], {
            collection_provider_ref: "person.contact_role.parents",
            iteration_entity_type: "person",
        });
        expect(keep).toHaveLength(0);
        expect(incompatible).toHaveLength(1);
    });
});
