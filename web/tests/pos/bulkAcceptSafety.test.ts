/**
 * §7 — "Accept N high-confidence" must be safe by construction.
 *
 * The failure it prevents: a bank routing number swept into a customer field by one click, because
 * the matcher was 99% sure about the QUESTION and nobody read the row.
 */

import { describe, expect, it } from "vitest";
import { bulkAcceptVerdict, isBulkAcceptSafe } from "@/lib/pos/discovery/bulkAcceptSafety";
import { matchConcepts } from "@/lib/pos/discovery/configurationMatching";
import { DISCOVERY_CONTRACT_VERSION, type BusinessConceptCandidate, type ConfigurationProposal } from "@/lib/pos/discovery/contracts";

const base = {
    disposition: "reuse_canonical_field" as ConfigurationProposal["disposition"],
    confidence: { band: "high" as const, percent: 96, signals: [] },
    validation_issues: [] as string[],
};

const concept = (label: string): BusinessConceptCandidate => ({
    contract_version: DISCOVERY_CONTRACT_VERSION,
    id: "1:s:f",
    kind: "scalar_field",
    label,
    concept_key: "child.x",
    subject: "child",
    cardinality: "single",
    suggested_data_type: "text",
    source: { page: 1, section_title: "S", section_key: "s", labels: [label] },
    // Deliberately maximal. Confidence must not be able to buy safety.
    confidence: { band: "high", percent: 99, signals: ["exact label match"] },
    explanation: "",
});

describe("both agreements are required", () => {
    it("accepts a confident binding with a safe owner", () => {
        expect(isBulkAcceptSafe(base)).toBe(true);
    });

    it("refuses a confident proposal whose OWNER needs a person", () => {
        const v = bulkAcceptVerdict({
            ...base,
            ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "", bulkAcceptSafe: false },
        });
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/needs a person/i);
    });

    it("refuses a safely-owned proposal that is not confident", () => {
        expect(isBulkAcceptSafe({ ...base, confidence: { band: "review", percent: 60, signals: [] } })).toBe(false);
    });
});

describe("the real financial rows can never be bulk-accepted", () => {
    const FINANCIAL = [
        "Routing number: Typically, the first set of 9 numbers printed on the bottom of checks on the left side.",
        "Account number: Typically, the second set of numbers printed on the bottom of check.",
        "Financial Institution:",
        "Select Account Type:",
        "Account Holder Full Name:",
        "Non-Refundable Annual Material Fee",
    ];

    it("refuses every one at 99% confidence", () => {
        for (const label of FINANCIAL) {
            const p = matchConcepts([concept(label)])[0];
            expect(p.confidence, label).toBeTruthy();
            const v = bulkAcceptVerdict(p);
            expect(v.safe, `${label} → ${JSON.stringify(v)}`).toBe(false);
        }
    });
});

describe("creating durable vocabulary is never a bulk action", () => {
    it("excludes a new-field proposal even when the ownership conclusion is sound", () => {
        // New truth deserves one person reading one row, however confident the router is.
        expect(isBulkAcceptSafe({
            ...base,
            disposition: "create_proposed_field",
            ownership_routing: { owner: "CANONICAL_FIELD", basis: "", bulkAcceptSafe: true },
        })).toBe(false);
    });

    it("excludes held, derived and safeguarding rows", () => {
        for (const disposition of ["held_unknown_owner", "held_for_canonical_owner", "derived_value_system", "financial_payment", "safeguarding_binding", "unresolved"] as const) {
            expect(isBulkAcceptSafe({ ...base, disposition }), disposition).toBe(false);
        }
    });

    it("excludes an unknown future disposition by default", () => {
        expect(isBulkAcceptSafe({ ...base, disposition: "a_disposition_invented_later" as never })).toBe(false);
    });
});

describe("other reasons a confident row still waits", () => {
    it("refuses one with validation issues", () => {
        expect(isBulkAcceptSafe({ ...base, validation_issues: ["needs a field key"] })).toBe(false);
    });

    it("refuses one whose canonical binding was refused on party grounds", () => {
        const v = bulkAcceptVerdict({
            ...base,
            refused_binding: { target: { entity_type: "person", field_key: "phone" }, reason: "belongs to the physician" },
        });
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/refused/i);
    });
});
