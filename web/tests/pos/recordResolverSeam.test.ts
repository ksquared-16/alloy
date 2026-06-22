import { describe, it, expect } from "vitest";
import { availableMatchSignals, deferredRecordResolver, type RecordResolutionSourceContext } from "@/lib/pos/recordResolution/recordResolverSeam";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

function person(opts: Partial<IntakePersonCandidate>): IntakePersonCandidate {
    return {
        candidate_id: opts.candidate_id ?? "p1",
        role: opts.role ?? "parent",
        first_name: opts.first_name ?? null,
        last_name: opts.last_name ?? null,
        emails: opts.emails ?? [],
        phones: opts.phones ?? [],
        dob: opts.dob ?? null,
        age_years: opts.age_years ?? null,
        program_interest: opts.program_interest ?? null,
        source_fact_ids: opts.source_fact_ids ?? [],
        confidence: opts.confidence ?? "high",
        validation_state: opts.validation_state ?? "valid",
    };
}

function household(parents: IntakePersonCandidate[], children: IntakePersonCandidate[]): IntakeHouseholdCandidate {
    return {
        household_id: "h1",
        parents,
        children,
        address: null,
        location: null,
        source: null,
        notes: null,
        unassigned_fact_ids: [],
        review_warnings: [],
    };
}

const ctx: RecordResolutionSourceContext = { org_id: "org1", source_kind: "form_packet_session", source_id: "sess1" };

describe("availableMatchSignals", () => {
    it("detects email, phone, and child name+dob signals (presence only, no matching)", () => {
        const cand = household(
            [person({ emails: ["a@b.com"], phones: ["555"] })],
            [person({ role: "child", first_name: "Ada", dob: "2018-01-01" })],
        );
        expect(availableMatchSignals(cand).sort()).toEqual(["child_name_dob", "parent_email", "parent_phone"]);
    });

    it("returns no signals when identifiers are absent or blank", () => {
        const cand = household([person({ emails: ["  "], phones: [] })], [person({ role: "child", first_name: "Ada", dob: null })]);
        expect(availableMatchSignals(cand)).toEqual([]);
    });
});

describe("deferredRecordResolver", () => {
    it("never matches; always defers and requires review", async () => {
        const cand = household([person({ emails: ["a@b.com"] })], []);
        const proposal = await deferredRecordResolver.resolve(cand, ctx);
        expect(proposal.status).toBe("deferred");
        expect(proposal.matched_on).toEqual([]);
        expect(proposal.review_required).toBe(true);
        expect(proposal.notes).toContain("parent_email");
    });

    it("passes through known launch-context FKs without performing matching", async () => {
        const cand = household([], []);
        const proposal = await deferredRecordResolver.resolve(cand, {
            ...ctx,
            launch_context: { opportunity_id: "opp-9", customer_id: "cust-9" },
        });
        expect(proposal.lead_id).toBe("opp-9");
        expect(proposal.household_id).toBe("cust-9");
        expect(proposal.status).toBe("deferred");
    });

    it("notes absence of signals when the candidate carries none", async () => {
        const proposal = await deferredRecordResolver.resolve(household([], []), ctx);
        expect(proposal.notes).toContain("no match signals");
    });
});
