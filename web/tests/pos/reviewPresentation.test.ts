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
        expect(keys).toContain("needs_review");
        // …and it is ALSO something the family is asked, so it appears where an operator looks to
        // answer "what will this family see".
        expect(keys).toContain("families_provide");
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

describe("there is exactly one categorizer", () => {
    it("routes financial and derived rows to their own sections, not to the fallback", async () => {
        // The defect this locks: the review kept a private copy of the category switch, and the copy
        // fell behind. `financial_payment` and `derived_value_system` rendered correctly inside "All"
        // while their own tabs read zero — a duplicated taxonomy disagrees in the one place nobody
        // is looking. Found in the browser, on the real packet.
        const { categoryFor } = await import("@/lib/pos/discovery/discoverConfiguration");
        expect(categoryFor(proposal({ disposition: "financial_payment" }))).toBe("financial");
        expect(categoryFor(proposal({ disposition: "derived_value_system" }))).toBe("derived");
        expect(categoryFor(proposal({ disposition: "held_unknown_owner" }))).toBe("needs_ownership_review");
        expect(sectionFor(proposal({ disposition: "financial_payment" }), "financial")).toContain("families_provide");
        expect(sectionFor(proposal({ disposition: "derived_value_system" }), "derived")).toContain("automatic");
    });

    it("gives every disposition a section other than All", async () => {
        const { categoryFor } = await import("@/lib/pos/discovery/discoverConfiguration");
        const dispositions = [
            "reuse_canonical_field", "reuse_existing_field", "create_proposed_field", "relationship_binding",
            "safeguarding_binding", "financial_payment", "derived_value_system", "held_for_canonical_owner",
            "held_unknown_owner", "form_only_response", "acknowledgement", "signature_requirement",
            "upload_requirement", "static_content", "output_binding", "structured_collection",
        ] as const;
        for (const disposition of dispositions) {
            const p = proposal({ disposition });
            const keys = sectionFor(p, categoryFor(p)).filter((k) => k !== "all");
            expect(keys.length, `${disposition} is only reachable through All`).toBeGreaterThan(0);
        }
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
        ["existing field", { target_field_source: { entity_type: "customer_member", field_key: "dob" } }, /^Alloy already has · Dob$/, /Confirmed or prefilled/i],
        ["relationship", { disposition: "relationship_binding", target_relationship_role: "physician" }, /^Relationship · Physician$/, /Asked during enrollment/i],
        ["safeguarding", { disposition: "safeguarding_binding" }, /^Safeguarding · Restriction$/, /Nothing becomes active until approved/i],
        ["financial credential", { disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "A bank routing or account number. Alloy has no destination…", bulkAcceptSafe: false } }, /^Families provide$/, /straight to your payment provider/i],
        ["derived", { disposition: "derived_value_system", ownership_routing: { owner: "DERIVED_SYSTEM", basis: "", derivedFrom: "date of birth and the enrolment start date", bulkAcceptSafe: false } }, /^Handled automatically$/, /works this out from date of birth/i],
        ["health held", { disposition: "held_for_canonical_owner", ownership_hold: { state: "AWAITING_HEALTH_FOUNDATION", owner: "Health & Safety", decision: "D-H5", explanation: "" } }, /^Families provide$/, /Asked during enrollment.*Health & Safety/i],
        ["acknowledgement", { disposition: "acknowledgement" }, /^Requirement · Acknowledgement$/, /guardian acknowledges/i],
        ["needs owner", { disposition: "held_unknown_owner" }, /^Needs your decision$/, /Asked during enrollment/i],
    ];

    for (const [name, over, ownership, consequence] of cases) {
        it(`renders ${name} in two short lines`, () => {
            const row = conciseRow(proposal(over));
            expect(row.ownership, name).toMatch(ownership);
            expect(row.consequence, name).toMatch(consequence);
            // The density target: a breadcrumb and one sentence, not a paragraph.
            expect(row.ownership.length, `${name} ownership too long`).toBeLessThanOrEqual(48);
            expect(row.consequence.length, `${name} consequence too long`).toBeLessThanOrEqual(120);
        });
    }

    it("distinguishes the three financial reasons rather than repeating one", () => {
        const credential = conciseRow(proposal({ disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "A bank routing or account number…", bulkAcceptSafe: false } }));
        const billing = conciseRow(proposal({ disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "An amount the school charges — billing configuration, owned by rate plans.", bulkAcceptSafe: false } }));
        const setup = conciseRow(proposal({ disposition: "financial_payment", ownership_routing: { owner: "FINANCIAL_PAYMENT", basis: "Payment-method setup detail.", bulkAcceptSafe: false } }));
        expect(new Set([credential.consequence, billing.consequence, setup.consequence]).size).toBe(3);
        // The ownership line groups by WHAT HAPPENS, not by reason: a credential and a setup detail
        // are both asked of the family, while a school-set fee is asked of nobody. Two labels for
        // three reasons is the correct collapse — the reasons stay distinct in the consequence.
        expect(billing.ownership).toBe("Handled automatically");
        expect(credential.ownership).toBe("Families provide");
        expect(setup.ownership).toBe("Families provide");
    });
});

describe("derived copy reads like a sentence", () => {
    it("records an execution value rather than 'calculating' it", () => {
        const row = conciseRow(proposal({ disposition: "derived_value_system", ownership_routing: { owner: "DERIVED_SYSTEM", basis: "", derivedFrom: "when the form was submitted", bulkAcceptSafe: false } }));
        expect(row.consequence).toBe("Alloy records this when the form was submitted. No question needed.");
        expect(row.consequence).not.toMatch(/Calculated from when/);
    });
});

describe("collection and durable ownership are different questions", () => {
    it("never presents a health concept as if it will not be asked", () => {
        // The correction: medications ARE collected through Enrollment. Health becomes the durable
        // owner later. Grouping them under "held" read as "this will not be asked", which is both
        // false and the most alarming thing this screen could imply.
        const meds = proposal({
            disposition: "held_for_canonical_owner",
            ownership_hold: { state: "AWAITING_HEALTH_FOUNDATION", owner: "Health & Safety", decision: "D-H5", explanation: "" },
        });
        const row = conciseRow(meds);
        expect(row.ownership).toBe("Families provide");
        expect(row.consequence).toMatch(/^Asked during enrollment/);
        expect(row.consequence).not.toMatch(/\bheld\b/i);
        expect(row.ownership).not.toMatch(/held|owned elsewhere/i);
    });

    it("puts every family-facing concept in the families list, decision or not", () => {
        for (const disposition of ["held_for_canonical_owner", "held_unknown_owner", "financial_payment", "form_only_response", "safeguarding_binding"] as const) {
            const p = proposal({ disposition });
            const keys = sectionFor(p, disposition === "financial_payment" ? "financial" : "form_responses");
            expect(keys, disposition).toContain("families_provide");
        }
    });

    it("keeps architecture vocabulary out of the primary line", () => {
        for (const disposition of ["held_for_canonical_owner", "held_unknown_owner", "derived_value_system", "financial_payment"] as const) {
            const row = conciseRow(proposal({ disposition }));
            expect(row.ownership, disposition).not.toMatch(/owner|routing|grain|canonical|disposition/i);
        }
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
