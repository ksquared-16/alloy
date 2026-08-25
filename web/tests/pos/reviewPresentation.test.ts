/**
 * The review's presentation layer, tested where it can be tested: as a projection.
 *
 * Two properties matter more than the copy itself. Filters must be presentation only — a section is
 * a view over one result set, never a second analysis. And the concise row must never invent a
 * conclusion: everything it says has to be derivable from the proposal it was given.
 */

import { describe, expect, it } from "vitest";
import {
    REVIEW_SECTIONS,
    acceptOutcome,
    conciseRow,
    needsOperatorReview,
    readinessSummary,
    sectionFor,
    stopReasonChip,
} from "@/lib/pos/discovery/reviewPresentation";
import type { ConfigurationProposal, DiscoveryCategory } from "@/lib/pos/discovery/contracts";

const proposal = (over: Partial<ConfigurationProposal>): ConfigurationProposal =>
    ({
        contract_version: "fp16.0",
        id: over.id ?? "p1",
        candidate_id: "c1",
        disposition: "reuse_canonical_field",
        confidence: { band: "high", percent: 95, signals: [] },
        alternatives: [],
        decision_state: "proposed",
        validation_issues: [],
        explanation: "",
        source: { page: 1, section_title: "S", section_key: "s", labels: [] },
        ...over,
    }) as ConfigurationProposal;

describe("sections are a view, never a second analysis", () => {
    it("puts every proposal in All, exactly once", () => {
        const rows = [
            proposal({ id: "a" }),
            proposal({ id: "b", disposition: "financial_payment" }),
            proposal({ id: "c", disposition: "held_unknown_owner" }),
        ];
        for (const p of rows) {
            const keys = sectionFor(p, "existing_fields");
            expect(keys.filter((k) => k === "all")).toHaveLength(1);
        }
    });

    it("lets one proposal belong to several sections without duplicating it", () => {
        // A safeguarding row is both "Safeguarding" and "Needs review". That is membership, not a
        // second copy — the row and its decision are the same object in both views.
        const p = proposal({ disposition: "safeguarding_binding" });
        const keys = sectionFor(p, "safeguarding");
        expect(keys).toContain("safeguarding");
        expect(keys).toContain("needs_review");
        expect(keys).toContain("all");
    });

    it("uses the settled category vocabulary rather than inventing one", () => {
        const declared = REVIEW_SECTIONS.flatMap((s) => s.categories ?? []);
        const known: DiscoveryCategory[] = [
            "existing_fields", "new_fields", "collections", "relationships", "safeguarding", "held_for_owner",
            "financial", "derived", "form_responses", "static_content", "output_copies", "acknowledgements",
            "upload_requirements", "signatures",
        ];
        for (const c of declared) expect(known).toContain(c);
    });
});

describe("what counts as the operator's work", () => {
    it("claims undecided ownership, unclassified rows and new durable truth", () => {
        for (const disposition of ["held_unknown_owner", "unresolved", "create_proposed_field"] as const) {
            expect(needsOperatorReview(proposal({ disposition })), disposition).toBe(true);
        }
    });

    it("claims a safeguarding restriction — a conclusion a person must still ratify", () => {
        expect(needsOperatorReview(proposal({ disposition: "safeguarding_binding" }))).toBe(true);
    });

    it("does NOT claim conclusions the operator only inspects", () => {
        // Held-for-a-named-owner, derived and financial are decided. Putting them in the work queue
        // would restore exactly the 84-row list this slice exists to remove.
        for (const disposition of ["reuse_canonical_field", "derived_value_system", "financial_payment", "held_for_canonical_owner", "acknowledgement", "signature_requirement"] as const) {
            expect(needsOperatorReview(proposal({ disposition })), disposition).toBe(false);
        }
    });

    it("claims anything incomplete or refused, whatever its disposition", () => {
        expect(needsOperatorReview(proposal({ validation_issues: ["needs a key"] }))).toBe(true);
        expect(needsOperatorReview(proposal({ refused_binding: { target: { entity_type: "person", field_key: "phone" }, reason: "belongs to the physician" } }))).toBe(true);
    });
});

describe("row copy says one thing per line", () => {
    const cases: Array<[string, Partial<ConfigurationProposal>, RegExp, RegExp]> = [
        ["existing field", { target_field_source: { entity_type: "customer_member", field_key: "dob" } }, /^Child · Dob$/, /existing canonical value/i],
        ["relationship", { disposition: "relationship_binding", target_relationship_role: "physician" }, /^Relationship · Physician$/, /Links or creates a person/i],
        ["safeguarding", { disposition: "safeguarding_binding" }, /^Safeguarding · Restriction$/, /Nothing becomes active until approved/i],
        ["financial credential", { disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "A bank routing or account number. Alloy has no destination…", bulkAcceptSafe: false } }, /^Financials · Bank credential$/, /payment provider.*Not stored/i],
        ["derived", { disposition: "derived_value_system", ownership_routing: { owner: "DERIVED_SYSTEM", basis: "", derivedFrom: "date of birth and the enrolment start date", bulkAcceptSafe: false } }, /^Derived by Alloy$/, /Calculated from date of birth.*No field needed/i],
        ["health held", { disposition: "held_for_canonical_owner", ownership_hold: { state: "AWAITING_HEALTH_FOUNDATION", owner: "Health & Safety", decision: "D-H5", explanation: "" } }, /^Health · Held$/, /Health foundation/i],
        ["acknowledgement", { disposition: "acknowledgement" }, /^Requirement · Acknowledgement$/, /guardian must acknowledge/i],
        ["needs owner", { disposition: "held_unknown_owner" }, /^Needs an owner$/, /Owner undecided/i],
    ];

    for (const [name, over, ownership, consequence] of cases) {
        it(`renders ${name} in two short lines`, () => {
            const row = conciseRow(proposal(over));
            expect(row.ownership, name).toMatch(ownership);
            expect(row.consequence, name).toMatch(consequence);
            // The density target: a breadcrumb and one sentence, not a paragraph.
            expect(row.ownership.length, `${name} ownership too long`).toBeLessThanOrEqual(48);
            expect(row.consequence.length, `${name} consequence too long`).toBeLessThanOrEqual(110);
        });
    }

    it("distinguishes the three financial reasons rather than repeating one", () => {
        const credential = conciseRow(proposal({ disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "A bank routing or account number…", bulkAcceptSafe: false } }));
        const billing = conciseRow(proposal({ disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "An amount the school charges — billing configuration, owned by rate plans.", bulkAcceptSafe: false } }));
        const setup = conciseRow(proposal({ disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "Payment-method setup detail.", bulkAcceptSafe: false } }));
        expect(new Set([credential.consequence, billing.consequence, setup.consequence]).size).toBe(3);
        // And the ownership breadcrumb distinguishes them too — three reasons, three labels.
        expect(new Set([credential.ownership, billing.ownership, setup.ownership]).size).toBe(3);
    });
});

describe("derived copy reads like a sentence", () => {
    it("records an execution value rather than 'calculating' it", () => {
        const row = conciseRow(proposal({ disposition: "derived_value_system", ownership_routing: { owner: "DERIVED_SYSTEM", basis: "", derivedFrom: "when the form was submitted", bulkAcceptSafe: false } }));
        expect(row.consequence).toBe("Recorded when the form was submitted. No field needed.");
        expect(row.consequence).not.toMatch(/Calculated from when/);
    });
});

describe("the needs-review queue sorts itself by eye", () => {
    it("gives a short reason chip rather than one repeated paragraph", () => {
        expect(stopReasonChip(proposal({ disposition: "held_unknown_owner" }))).toBe("Owner undecided");
        expect(stopReasonChip(proposal({ disposition: "safeguarding_binding" }))).toBe("Sensitive restriction");
        expect(stopReasonChip(proposal({ disposition: "held_unknown_owner", ownership_routing: { owner: "HELD_UNKNOWN_OWNER", basis: "", blockedOn: "TIME_ADOPTION", bulkAcceptSafe: false } }))).toBe("Unsupported type");
        expect(stopReasonChip(proposal({ refused_binding: { target: { entity_type: "person", field_key: "phone" }, reason: "x" } }))).toBe("Ambiguous grain");
    });

    it("keeps every chip short enough to scan", () => {
        for (const disposition of ["held_unknown_owner", "safeguarding_binding", "create_proposed_field", "unresolved"] as const) {
            expect(stopReasonChip(proposal({ disposition })).length).toBeLessThanOrEqual(22);
        }
    });
});

describe("accept says what it will do", () => {
    it("names a different outcome for each kind of acceptance", () => {
        const outcomes = (["reuse_canonical_field", "relationship_binding", "safeguarding_binding", "financial_payment", "form_only_response", "acknowledgement", "signature_requirement"] as const)
            .map((disposition) => acceptOutcome(proposal({ disposition })));
        expect(new Set(outcomes).size, "two kinds of acceptance read identically").toBe(outcomes.length);
        for (const o of outcomes) expect(o.length).toBeLessThanOrEqual(40);
    });
});

describe("the headline groups", () => {
    it("splits handled from needing review, and counts bulk-safe within pending", () => {
        const rows = [
            proposal({ id: "1" }),
            proposal({ id: "2", disposition: "derived_value_system" }),
            proposal({ id: "3", disposition: "held_unknown_owner" }),
            proposal({ id: "4", disposition: "safeguarding_binding" }),
        ];
        const r = readinessSummary(rows, {});
        expect(r.handled).toBe(2);
        expect(r.needsReview).toBe(2);
        expect(r.handled + r.needsReview).toBe(rows.length);
        expect(r.blocking).toBe(0);
    });

    it("moves a decided row out of the review queue", () => {
        const rows = [proposal({ id: "1", disposition: "held_unknown_owner" })];
        expect(readinessSummary(rows, {}).needsReview).toBe(1);
        expect(readinessSummary(rows, { "1": "accepted" }).needsReview).toBe(0);
    });

    it("reports an unclassified row as blocking", () => {
        expect(readinessSummary([proposal({ disposition: "unresolved" })], {}).blocking).toBe(1);
    });
});
