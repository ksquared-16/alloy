import { describe, expect, it } from "vitest";
import {
    enrollmentIntakeRequiresOperatorAttention,
    isCleanCreatedEnrollmentLead,
    isCleanOperationalizedEnrollmentLead,
} from "@/lib/forms/intakeEnrollmentLeadClassification";

const attachEmpty = {
    person_id: null as string | null,
    customer_id: null as string | null,
    customer_member_id: null as string | null,
    opportunity_id: null as string | null,
};

const cleanAttach = {
    person_id: "p1",
    customer_id: "c1",
    customer_member_id: null,
    opportunity_id: "o1",
};

describe("intakeEnrollmentLeadClassification", () => {
    it("clean website inquiry — created_records + auto-op is operationalized", () => {
        const meta = {
            intake_resolution_path: "created_records",
            intake_opportunity_match: "created",
            intake_auto_operationalized: true,
            intake_needs_review: false,
        };
        expect(
            isCleanOperationalizedEnrollmentLead({
                status: "submitted",
                payloadMeta: meta,
                attachRow: cleanAttach,
            })
        ).toBe(true);
        expect(
            isCleanCreatedEnrollmentLead({
                status: "submitted",
                payloadMeta: meta,
                attachRow: cleanAttach,
            })
        ).toBe(true);
        expect(enrollmentIntakeRequiresOperatorAttention({ payloadMeta: meta, attachRow: cleanAttach })).toBe(false);
    });

    it("duplicate name mismatch still requires operator attention", () => {
        const meta = {
            intake_resolution_path: "matched_email",
            intake_identity_name_mismatch: true,
            intake_needs_review: true,
        };
        expect(enrollmentIntakeRequiresOperatorAttention({ payloadMeta: meta, attachRow: cleanAttach })).toBe(true);
        expect(
            isCleanOperationalizedEnrollmentLead({
                status: "submitted",
                payloadMeta: meta,
                attachRow: cleanAttach,
            })
        ).toBe(false);
    });

    it("intake error remains needs attention", () => {
        const meta = { intake_resolution_path: "skipped_error", intake_error: "boom" };
        expect(enrollmentIntakeRequiresOperatorAttention({ payloadMeta: meta, attachRow: attachEmpty })).toBe(true);
    });

    it("existing-record attach with review stays out of clean created bucket", () => {
        const meta = {
            intake_resolution_path: "matched_email",
            intake_opportunity_match: "attached_existing",
            intake_needs_review: true,
        };
        expect(
            isCleanCreatedEnrollmentLead({
                status: "submitted",
                payloadMeta: meta,
                attachRow: cleanAttach,
            })
        ).toBe(false);
        expect(enrollmentIntakeRequiresOperatorAttention({ payloadMeta: meta, attachRow: cleanAttach })).toBe(true);
    });

    it("trusts auto-op meta when row FK columns are missing from list payloads", () => {
        const meta = {
            intake_resolution_path: "created_records",
            intake_opportunity_match: "created",
            intake_auto_operationalized: true,
            intake_needs_review: false,
        };
        expect(
            isCleanOperationalizedEnrollmentLead({
                status: "submitted",
                payloadMeta: meta,
                attachRow: attachEmpty,
            })
        ).toBe(true);
    });
});
