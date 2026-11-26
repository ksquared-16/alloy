import { describe, expect, it } from "vitest";
import {
    buildCollectionIterationContext,
    withSupplementalIterationContexts,
} from "@/lib/fields/collection/collectionIterationContext";
import { evaluateProviderAvailabilityForIteration } from "@/lib/fields/collection/evaluateProviderAvailabilityForIteration";
import { providerContextRequirementsFromCanonicalRef } from "@/lib/fields/collection/providerContextRequirements";
import { providerContextRequirementsForFormField } from "@/lib/forms/collection/formsProviderContextRequirements";
import { evaluateFormFieldAvailabilityForIteration } from "@/lib/forms/collection/formsProviderAvailability";
import { validateFormsDocumentsP2Bindings } from "@/lib/forms/binding/validateFormsDocumentsP2Bindings";
import { validateFormSchema } from "@/lib/forms/schema";

const childrenBinding = {
    collection_provider_ref: "children",
    iteration_entity_type: "customer_member",
} as const;

const childrenIterationContext = buildCollectionIterationContext({
    collectionProviderRef: "children",
    itemEntityType: "customer_member",
});

function field(
    id: string,
    entity_type: string,
    field_key: string,
    type: "text" | "date" | "select" = "text",
) {
    return { id, type, label: id, required: false, field_source: { entity_type, field_key } };
}

describe("provider context requirements — derived from canonical ownership", () => {
    it("maps customer_member profile fields to customer_member context requirement", () => {
        expect(providerContextRequirementsFromCanonicalRef({ entity_type: "customer_member", field_key: "first_name" })).toEqual([
            { entity_type: "customer_member", required: true },
        ]);
    });

    it("maps inquiry_child enrollment fields to inquiry_child context requirement", () => {
        expect(providerContextRequirementsFromCanonicalRef({ entity_type: "inquiry_child", field_key: "program_category_id" })).toEqual([
            { entity_type: "inquiry_child", required: true },
        ]);
    });

    it("maps active enrollment projections to qualified enrollment context", () => {
        expect(providerContextRequirementsFromCanonicalRef({ entity_type: "enrollment", field_key: "current_classroom" })).toEqual([
            { entity_type: "enrollment", qualifier: "active", required: true },
        ]);
    });
});

describe("Children collection iteration context", () => {
    it("First Name available — customer_member context present on collection item", () => {
        const result = evaluateFormFieldAvailabilityForIteration(
            field("child_first_name", "child", "child_first_name"),
            childrenIterationContext,
        );
        expect(result.available).toBe(true);
        expect(result.reason).toBe("available");
    });

    it("DOB available through same customer_member context", () => {
        const result = evaluateFormFieldAvailabilityForIteration(
            field("child_dob", "child", "child_date_of_birth", "date"),
            childrenIterationContext,
        );
        expect(result.available).toBe(true);
    });

    it("Program unavailable — inquiry_child context missing", () => {
        const result = evaluateFormFieldAvailabilityForIteration(
            field("program", "enrollment", "program_category_id"),
            childrenIterationContext,
        );
        expect(result.available).toBe(false);
        expect(result.reason).toBe("missing_required_context");
        expect(result.missing_contexts).toContain("inquiry_child");
        expect(result.message).toMatch(/inquiry|enrollment/i);
    });

    it("Program becomes available when iteration context includes inquiry_child", () => {
        const extended = withSupplementalIterationContexts(childrenIterationContext, [
            { entity_type: "inquiry_child", source: "packet_subject" },
        ]);
        const result = evaluateFormFieldAvailabilityForIteration(
            field("program", "enrollment", "program_category_id"),
            extended,
        );
        expect(result.available).toBe(true);
    });

    it("Classroom unavailable without active enrollment context", () => {
        const withInquiry = withSupplementalIterationContexts(childrenIterationContext, [
            { entity_type: "inquiry_child", source: "packet_subject" },
        ]);
        const result = evaluateProviderAvailabilityForIteration({
            requirements: providerContextRequirementsFromCanonicalRef({
                entity_type: "enrollment",
                field_key: "current_classroom",
            }),
            iterationContext: withInquiry,
        });
        expect(result.available).toBe(false);
        expect(result.missing_contexts?.[0]).toBe("enrollment:active");
    });

    it("Enrollment status available when opportunity context is supplied", () => {
        const withOpp = withSupplementalIterationContexts(childrenIterationContext, [
            { entity_type: "opportunity", source: "packet_subject" },
        ]);
        const result = evaluateFormFieldAvailabilityForIteration(
            field("status", "opportunity", "status_key"),
            withOpp,
        );
        expect(result.available).toBe(true);
    });
});

describe("non-child domain pressure test — invoice lines", () => {
    const invoiceLineContext = buildCollectionIterationContext({
        collectionProviderRef: "invoice.lines",
        itemEntityType: "invoice_line",
        includeCustomerRoot: false,
    });

    it("Product field available through invoice_line context", () => {
        const result = evaluateProviderAvailabilityForIteration({
            requirements: providerContextRequirementsFromCanonicalRef({
                entity_type: "invoice_line",
                field_key: "product_id",
            }),
            iterationContext: invoiceLineContext,
        });
        expect(result.available).toBe(true);
    });

    it("Customer credit status unavailable without customer context", () => {
        const result = evaluateProviderAvailabilityForIteration({
            requirements: providerContextRequirementsFromCanonicalRef({
                entity_type: "customer",
                field_key: "credit_status",
            }),
            iterationContext: invoiceLineContext,
        });
        expect(result.available).toBe(false);
        expect(result.reason).toBe("missing_required_context");
    });
});

describe("picker and publish share the same evaluator", () => {
    const schema = validateFormSchema({
        schema_version: 1,
        title: "T",
        sections: [{ id: "s", field_ids: ["kids"] }],
        fields: [
            {
                id: "kids",
                type: "group",
                label: "Children",
                required: false,
                repeat: { min: 0, max: 5 },
                collection_binding: childrenBinding,
                fields: [
                    field("child_first_name", "child", "child_first_name"),
                    field("program", "enrollment", "program_category_id"),
                ],
            },
        ],
    });

    it("publish blocks program nested field with semantic missing-context message", () => {
        const programField = field("program", "enrollment", "program_category_id");
        const pickerAvailability = evaluateFormFieldAvailabilityForIteration(programField, childrenIterationContext);
        expect(pickerAvailability.available).toBe(false);

        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.field_id === "program")).toBe(true);
        expect(violations.find((v) => v.field_id === "program")?.message).toMatch(/inquiry|enrollment/i);
    });
});

describe("runtime refuses ambiguous context — no field-key branching", () => {
    it("derives requirements from entity ownership, not display field keys", () => {
        const fromEnrollmentTransport = providerContextRequirementsForFormField(
            field("desired_start", "enrollment", "start_date", "date"),
        );
        expect(fromEnrollmentTransport).toEqual([{ entity_type: "inquiry_child", required: true }]);
        expect(fromEnrollmentTransport.some((r) => r.entity_type === "start_date")).toBe(false);
    });
});
