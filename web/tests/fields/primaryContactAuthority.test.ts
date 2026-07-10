import { describe, expect, it } from "vitest";
import {
    resolvePrimaryContactAuthority,
    relationshipDataBagFromTruthRecord,
} from "@/lib/fields/relationship/primaryContactAuthority";

const CUSTOMER_ID = "cust-1";

describe("Primary Contact canonical authority", () => {
    it("canonical household pointer wins over conflicting legacy FK", () => {
        const result = resolvePrimaryContactAuthority({
            customerId: CUSTOMER_ID,
            data: {
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "canonical-person", role_type: "primary_contact", is_primary: true },
                ],
                contactRow: { person_id: "legacy-person" },
            },
        });
        expect(result.status).toBe("resolved");
        expect(result.target_person_id).toBe("canonical-person");
        expect(result.resolution_source).toBe("canonical_pointer");
        expect(result.diagnostics).toContain("relationship_data_conflict");
    });

    it("legacy fallback when pointer absent with exactly one candidate", () => {
        const result = resolvePrimaryContactAuthority({
            customerId: CUSTOMER_ID,
            data: {
                customerPersonRows: [],
                contactRow: { person_id: "legacy-only" },
            },
        });
        expect(result.status).toBe("resolved");
        expect(result.resolution_source).toBe("legacy_fallback");
        expect(result.diagnostics).toContain("legacy_reconciliation_required");
    });

    it("ambiguous when pointer absent and multiple legacy candidates", () => {
        const result = resolvePrimaryContactAuthority({
            customerId: CUSTOMER_ID,
            data: {
                customerPersonRows: [
                    { customer_id: CUSTOMER_ID, person_id: "a", role_type: "primary_contact", is_primary: false },
                    { customer_id: CUSTOMER_ID, person_id: "b", role_type: "primary", is_primary: false },
                ],
                contactRow: null,
            },
        });
        expect(result.status).toBe("ambiguous");
        expect(result.target_person_id).toBeNull();
    });

    it("missing when no signals exist", () => {
        const result = resolvePrimaryContactAuthority({
            customerId: CUSTOMER_ID,
            data: { customerPersonRows: [], contactRow: null },
        });
        expect(result.status).toBe("missing");
    });

    it("Focus Panel truth record uses canonical resolver path", () => {
        const record = {
            customer_id: CUSTOMER_ID,
            _customer_persons: [
                { customer_id: CUSTOMER_ID, person_id: "fp-primary", role_type: "primary_contact", is_primary: true },
            ],
            _primary_person_id: "fp-primary",
            "person.primary_contact_name": "Pat Parent",
            "person.primary_email": "pat@example.com",
        };
        const bag = relationshipDataBagFromTruthRecord(record, CUSTOMER_ID);
        const result = resolvePrimaryContactAuthority({ data: bag, customerId: CUSTOMER_ID, preferOpportunityPointer: true });
        expect(result.status).toBe("resolved");
        expect(result.target_person_id).toBe("fp-primary");
    });
});
