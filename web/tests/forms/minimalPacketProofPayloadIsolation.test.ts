import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";
import {
    MINIMAL_PACKET_PROOF_CHILD_SCHEMA,
    MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA,
} from "@/lib/forms/seeds/minimalPacketProofDemo";

/**
 * Step 2 historically failed submit because `shared_values` shallow-merged step 1 field ids into
 * `payload.values`; validation rejects unknown field ids for the current form schema.
 */
describe("minimal packet proof — step 2 payload vs shared_values pollution", () => {
    it("rejects guardian schema validation when step-1 keys are present in values", () => {
        const schema = validateFormSchema(MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA);
        const polluted = {
            values: {
                child_first_name: "Ada",
                child_last_name: "Lovelace",
                child_date_of_birth: "2020-01-15",
                desired_start_date: "2026-09-01",
                guardian_first_name: "Grace",
                guardian_last_name: "Hopper",
                guardian_email: "grace@example.com",
                guardian_phone: "5551234567",
            },
        };
        const r = validateFormPayload({ schemaJson: schema, payload: polluted, mode: "submit" });
        expect(r.ok).toBe(false);
    });

    it("accepts guardian submit after filtering values to the guardian schema fields", () => {
        const schema = validateFormSchema(MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA);
        const polluted = {
            values: {
                child_first_name: "Ada",
                guardian_first_name: "Grace",
                guardian_last_name: "Hopper",
                guardian_email: "grace@example.com",
                guardian_phone: "5551234567",
            },
        };
        const cleaned = {
            ...polluted,
            values: filterPayloadValuesToSchemaFields(schema, polluted.values),
        };
        const r = validateFormPayload({ schemaJson: schema, payload: cleaned, mode: "submit" });
        expect(r.ok).toBe(true);
    });

    it("child schema still validates independently (step 1)", () => {
        const schema = validateFormSchema(MINIMAL_PACKET_PROOF_CHILD_SCHEMA);
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    child_first_name: "Ada",
                    child_last_name: "Lovelace",
                    child_date_of_birth: "2020-01-15",
                    desired_start_date: "2026-09-01",
                },
            },
            mode: "submit",
        });
        expect(r.ok).toBe(true);
    });
});
