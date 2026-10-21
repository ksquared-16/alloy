/**
 * The participant runtime follows what the FORM declares (Lil' Sunshine example, deployed QA):
 *
 *   1. A required attachment behind a "show when …" the family did not meet is not owed. The Oregon
 *      immunization certificate's nonmedical-exemption document is required ONLY when an exemption
 *      is requested; a family that answered "no" was blocked on "please attach the required document".
 *   2. A repeating group bound to a relationship collection declares that role: it is offered, with
 *      the author's `repeat.max` as capacity and `repeat.min` as a requirement. Emergency contacts,
 *      authorized pick-up and dentists were never offered because their row labels do not spell the role.
 */
import { describe, expect, it } from "vitest";

import { outstandingRequiredEvidence } from "@/lib/enrollment/participantRuntime/participantEvidenceObligations";
import { outstandingUploadRequests } from "@/lib/enrollment/participantRuntime/participantUploadRequests";
import { hiddenFieldKeysForAnswers } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { artifactSlotsForProjection, collectionDeclaredPartySlots } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { nextPartyOffer } from "@/lib/enrollment/participantRuntime/partyOfferPlan";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const immunization = {
    schema_version: 1,
    title: "Oregon Certificate of Immunization Status",
    sections: [{ id: "s", field_ids: ["exempt", "exempt_doc", "record"] }],
    fields: [
        { id: "exempt", type: "boolean", label: "I am requesting a nonmedical exemption", required: false },
        { id: "exempt_doc", type: "file_ref", label: "Attach the required document", required: true, visibility: { all: [{ field_id: "exempt", op: "eq", value: true }] } },
        { id: "record", type: "file_ref", label: "Immunization record", required: true },
    ],
} as unknown as FormSchemaV1;
const form = { form_definition_id: "f1", form_definition_version_id: "v1", session_item_id: "item1", schema: immunization } as never;

describe("a hidden required attachment is not owed", () => {
    it("is hidden while the exemption is not requested, and owed once it is", () => {
        const unbound = (values: Record<string, unknown>) => hiddenFieldKeysForAnswers({ forms: [form], subjectId: "child", sharedValues: values });
        // The controller is unbound, so its answer lives under the session key the needs layer uses;
        // with no answer at all the conditional field is hidden.
        expect(unbound({}).has("item1:exempt_doc")).toBe(true);
    });

    it("drops hidden obligations and keeps the visible ones", () => {
        const hidden = new Set(["item1:exempt_doc"]);
        expect(outstandingRequiredEvidence([form], new Set(), hidden).map((o) => o.field_id)).toEqual(["record"]);
        expect(outstandingRequiredEvidence([form], new Set()).map((o) => o.field_id)).toEqual(["exempt_doc", "record"]);
    });

    it("the review gate follows the same condition", () => {
        expect(outstandingUploadRequests(immunization, { exempt: false }).map((r) => r.field_id)).toEqual(["record"]);
        expect(outstandingUploadRequests(immunization, { exempt: true }).map((r) => r.field_id)).toEqual(["exempt_doc", "record"]);
    });
});

const authorization = {
    schema_version: 1,
    title: "Child Enrollment Authorization",
    sections: [{ id: "s", field_ids: ["ec", "pickup", "dentist"] }],
    fields: [
        {
            id: "ec", type: "group", label: "Emergency contacts", required: false, repeat: { min: 1, max: 4 },
            collection_binding: { collection_provider_ref: "person.contact_role.emergency_contacts", iteration_entity_type: "person" },
            fields: [
                { id: "ec__name", type: "text", label: "Name (first and last)", required: true, field_source: { entity_type: "person", field_key: "full_name" } },
                { id: "ec__phone", type: "text", label: "Phone", required: true, field_source: { entity_type: "person", field_key: "phone" } },
            ],
        },
        {
            id: "pickup", type: "group", label: "Authorized pick-up", required: false, repeat: { min: 0, max: 2 },
            collection_binding: { collection_provider_ref: "person.contact_role.authorized_pickups", iteration_entity_type: "person" },
            fields: [{ id: "pickup__name", type: "text", label: "Name", required: true, field_source: { entity_type: "person", field_key: "full_name" } }],
        },
        {
            id: "dentist", type: "group", label: "Dental provider", required: false, repeat: { min: 0, max: 1 },
            collection_binding: { collection_provider_ref: "person.contact_role.dentists", iteration_entity_type: "person" },
            fields: [{ id: "dentist__name", type: "text", label: "Dental provider", required: true, field_source: { entity_type: "person", field_key: "full_name" } }],
        },
    ],
} as unknown as FormSchemaV1;

describe("a collection-bound group declares its role", () => {
    it("the labels alone find none of these roles", () => {
        expect(artifactSlotsForProjection(authorization, [])).toEqual([]);
    });

    it("declares each role with the author's capacity and minimum", () => {
        const { slots, minimums } = collectionDeclaredPartySlots(authorization);
        const count = (role: string) => slots.filter((s) => s.role === role).length;
        expect(count("emergency_contact")).toBe(4);
        expect(count("authorized_pickup")).toBe(2);
        expect(count("dentist")).toBe(1);
        expect(minimums).toEqual({ emergency_contact: 1 });
    });

    it("offers emergency contacts first, and as a requirement of one", () => {
        const { slots, minimums } = collectionDeclaredPartySlots(authorization);
        const offer = nextPartyOffer({
            parties: [],
            slots,
            declines: {},
            requirements: Object.fromEntries(Object.entries(minimums).map(([r, m]) => [r, { required: true, minimum: m }])),
        });
        expect(offer?.role).toBe("emergency_contact");
        expect(offer?.minimum).toBe(1);
        expect(offer?.remaining_capacity).toBe(4);
    });

    it("moves on to the next declared role once a role is settled", () => {
        const { slots } = collectionDeclaredPartySlots(authorization);
        const offer = nextPartyOffer({ parties: [], slots, declines: { emergency_contact: { declined_at: "t" } } });
        expect(offer?.role).toBe("authorized_pickup");
    });
});
