import { describe, expect, it } from "vitest";

import { normalizeSubjectIdentities } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";

/**
 * The context-free Enrollment subject contract.
 *
 * WHAT THIS PINS, AND WHY IT COST SO MUCH. Path A has no acquisition Opportunity, and
 * `opportunity_id` was typed as a required `string`. A caller with no Opportunity therefore had
 * no way to say so and exactly one way to compile: pass `""`. That is not absence — it is an
 * invalid uuid — and it reached Postgres as `invalid input syntax for type uuid: ""`.
 *
 * That message names the TYPE and not the column, the target or the field, which is why it was
 * read as a tenant configuration fault and chased through three layers before anything said
 * which configured target actually raised it. Complete Enrollment reported failure while its
 * three real targets had already applied.
 *
 * So the contract is pinned from both directions: absence is `null`, and a blank string is
 * normalized rather than propagated.
 */

const base: StageOutcomeExecutionSubject = {
    journey_segment: "child",
    opportunity_id: null,
    customer_member_id: "11111111-1111-4111-8111-111111111111",
    opportunity_customer_member_id: "22222222-2222-4222-8222-222222222222",
    process_instance_id: "33333333-3333-4333-8333-333333333333",
};

describe("context-free Complete Enrollment subject identity", () => {
    it("carries no Opportunity, and says so as null rather than as an empty string", () => {
        const subject = normalizeSubjectIdentities(base);
        expect(subject.opportunity_id).toBeNull();
        // The identities Path A DOES have survive untouched — absence is the only thing rewritten.
        expect(subject.customer_member_id).toBe(base.customer_member_id);
        expect(subject.opportunity_customer_member_id).toBe(base.opportunity_customer_member_id);
        expect(subject.process_instance_id).toBe(base.process_instance_id);
    });

    it("normalizes a blank Opportunity id to null instead of passing it to a uuid column", () => {
        // THE MUTATION GUARD. Restoring the empty-string subject must not survive the boundary.
        // If this ever returns "" again, the blank reaches `.eq()` and Postgres refuses the whole
        // statement — which is the exact regression this file exists to catch.
        for (const blank of ["", "   ", "\t"]) {
            const subject = normalizeSubjectIdentities({ ...base, opportunity_id: blank });
            expect(subject.opportunity_id).toBeNull();
            expect(subject.opportunity_id).not.toBe("");
        }
    });

    it("normalizes every optional uuid on the subject, not only the Opportunity", () => {
        // The blank Opportunity id survived several layers; the audit covers its siblings at the
        // same boundary so the next one cannot repeat the trip.
        const subject = normalizeSubjectIdentities({
            ...base,
            opportunity_id: "",
            customer_member_id: "",
            opportunity_customer_member_id: "  ",
            process_instance_id: "",
            placement_candidate_id: "",
            work_id: "   ",
        });
        expect(subject.opportunity_id).toBeNull();
        expect(subject.customer_member_id).toBeNull();
        expect(subject.opportunity_customer_member_id).toBeNull();
        expect(subject.process_instance_id).toBeNull();
        expect(subject.placement_candidate_id).toBeNull();
        expect(subject.work_id).toBeNull();
    });

    it("passes a real Opportunity through untouched, so Path B keeps its acquisition context", () => {
        // ONE SUBJECT CONTRACT, BOTH PATHS. Making absence expressible must not make presence
        // lossy: the acquisition-backed subject has to arrive with its Opportunity intact.
        const opportunityId = "44444444-4444-4444-8444-444444444444";
        const subject = normalizeSubjectIdentities({ ...base, opportunity_id: opportunityId });
        expect(subject.opportunity_id).toBe(opportunityId);
    });

    it("trims a padded Opportunity id rather than sending whitespace to a uuid column", () => {
        const opportunityId = "44444444-4444-4444-8444-444444444444";
        const subject = normalizeSubjectIdentities({ ...base, opportunity_id: `  ${opportunityId}  ` });
        expect(subject.opportunity_id).toBe(opportunityId);
    });

    it("admits null in the type, so absence no longer has to be encoded", () => {
        // A compile-level assertion: this file would not typecheck if `opportunity_id` were still
        // a required string, which is what forced `""` into existence in the first place.
        const absent: StageOutcomeExecutionSubject["opportunity_id"] = null;
        expect(absent).toBeNull();
    });
});
