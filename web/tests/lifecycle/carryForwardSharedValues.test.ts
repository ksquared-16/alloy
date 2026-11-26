/**
 * A field id is an artifact's internal coordinate, not a fact.
 *
 * `field_6` is a phone number on the Oregon CIS and a date on the Oregon Nonmedical Exemption;
 * `field_25` is a date on one and a checkbox on the other. Carrying a finished step's payload
 * forward by field id therefore made the next document unopenable, and a parent who had just signed
 * their first form was shown "Invalid submission payload" instead of their second.
 */

import { describe, expect, it } from "vitest";

import { carryForwardSharedValues } from "@/lib/forms/packets/carryForwardSharedValues";
import {
    processScopedAnswersToFieldIds,
    sharedValuesToFieldIds,
} from "@/lib/forms/packets/sharedValuesToFieldIds";

const CIS = "17bc2de8-0f83-48a6-aabc-bcd72725bce8";
const EXEMPTION = "9a86ec71-e589-41d8-bd09-617dfe23d0d8";

const cisSchema = {
    fields: [
        {
            id: "field_1",
            type: "text",
            label: "Childs Last Name",
            field_source: { entity_type: "customer_member", field_key: "last_name", shared_value_key: "child_last_name" },
        },
        // Unbound on the CIS: a phone box the importer could not tie to a canonical fact.
        { id: "field_6", type: "number", label: "Phone Number" },
        { id: "field_25", type: "date", label: "Date Fecha" },
    ],
} as never;

// The SAME field ids, different questions.
const exemptionSchema = {
    fields: [
        {
            id: "field_1",
            type: "text",
            label: "Childs Last Name",
            field_source: { entity_type: "customer_member", field_key: "last_name", shared_value_key: "child_last_name" },
        },
        { id: "field_6", type: "date", label: "Date Fecha Row1" },
        { id: "field_25", type: "boolean", label: "Dtp" },
    ],
} as never;

const submitted = { field_1: "Verticalson", field_6: "5415551234", field_25: "2026-08-27" };

describe("what one artifact hands the next", () => {
    it("carries a canonically bound value under its own identity", () => {
        const shared = carryForwardSharedValues({}, submitted, { schema: cisSchema, formDefinitionId: CIS });
        expect(shared.child_last_name).toBe("Verticalson");
        expect(shared["customer_member:last_name"]).toBe("Verticalson");
    });

    it("never writes a bare field id into the shared namespace", () => {
        const shared = carryForwardSharedValues({}, submitted, { schema: cisSchema, formDefinitionId: CIS });
        expect(Object.keys(shared)).not.toContain("field_6");
        expect(Object.keys(shared)).not.toContain("field_25");
        expect(shared[`process:${CIS}:field_6`]).toBe("5415551234");
        expect(shared[`process:${CIS}:field_25`]).toBe("2026-08-27");
    });

    it("does not let the CIS's answers reach the Exemption's identically numbered boxes", () => {
        const shared = carryForwardSharedValues({}, submitted, { schema: cisSchema, formDefinitionId: CIS });
        const seeded = {
            ...sharedValuesToFieldIds(exemptionSchema, shared),
            ...processScopedAnswersToFieldIds(exemptionSchema, shared, EXEMPTION),
        };
        // The one genuinely shared fact carries; the two positional collisions do not.
        expect(seeded).toEqual({ field_1: "Verticalson" });
    });

    it("returns an artifact's own answers to that artifact when it is opened again", () => {
        const shared = carryForwardSharedValues({}, submitted, { schema: cisSchema, formDefinitionId: CIS });
        expect(processScopedAnswersToFieldIds(cisSchema, shared, CIS)).toEqual({
            field_6: "5415551234",
            field_25: "2026-08-27",
        });
    });

    it("leaves a key that is not a field on this schema exactly as it is", () => {
        // Canonical keys the participant runtime writes are not field ids; re-keying them would be
        // the same mistake pointing the other way.
        const shared = carryForwardSharedValues({}, { ...submitted, "customer_member:dob": "2021-04-02" }, {
            schema: cisSchema,
            formDefinitionId: CIS,
        });
        expect(shared["customer_member:dob"]).toBe("2021-04-02");
    });

    it("falls back to the historical merge when there is nothing to identify against", () => {
        expect(carryForwardSharedValues({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });
});
