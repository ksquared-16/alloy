/**
 * R5 (hosted qar_4246ac22ece0): lead deletion collected form submissions by opportunity, household and person — never by
 * child. An admin-created submission names only `customer_member_id`, so deleting the household removed the child and
 * left the child's answers (and, through form_submission_documents, its generated PDF) behind.
 *
 * Runs the real graph resolver against an in-memory database that evaluates its filters.
 */
import { describe, expect, it } from "vitest";

import { InMemorySupabase } from "../../harness/inMemorySupabase";
import { resolveOpportunityLeadDeletionGraph } from "@/lib/admin/opportunity/opportunityLeadDeletionGraph";

const ORG = "0a000000-0000-4000-8000-0000000000e5";
const OPP = "0f000000-0000-4000-8000-0000000000e5";
const OTHER_OPP = "0f000000-0000-4000-8000-0000000000e6";
const HH = "c0000000-0000-4000-8000-0000000000e5";
const KID = "cb000000-0000-4000-8000-0000000000e1"; // only on this lead: deleted with it
const SHARED_KID = "cb000000-0000-4000-8000-0000000000e2"; // also on another lead: retained
const SUB = { kid: "5b000000-0000-4000-8000-0000000000e1", sharedKid: "5b000000-0000-4000-8000-0000000000e2", opp: "5b000000-0000-4000-8000-0000000000e3" };

function seeded() {
    const db = new InMemorySupabase();
    db.seed("opportunities", [
        { id: OPP, org_id: ORG, customer_id: HH, primary_person_id: null, work_unit_id: null, location_id: null, status_key: "new" },
        { id: OTHER_OPP, org_id: ORG, customer_id: null, primary_person_id: null, work_unit_id: null, location_id: null, status_key: "new" },
    ]);
    db.seed("customers", [{ id: HH, org_id: ORG }]);
    db.seed("customer_members", [
        { id: KID, org_id: ORG, customer_id: HH, person_id: null, relationship: "child" },
        { id: SHARED_KID, org_id: ORG, customer_id: HH, person_id: null, relationship: "child" },
    ]);
    db.seed("opportunity_customer_members", [
        { id: "ocm-1", org_id: ORG, opportunity_id: OPP, customer_member_id: KID },
        { id: "ocm-2", org_id: ORG, opportunity_id: OPP, customer_member_id: SHARED_KID },
        { id: "ocm-3", org_id: ORG, opportunity_id: OTHER_OPP, customer_member_id: SHARED_KID },
    ]);
    db.seed("form_submissions", [
        { id: SUB.kid, org_id: ORG, customer_member_id: KID, opportunity_id: null, customer_id: null, person_id: null },
        { id: SUB.sharedKid, org_id: ORG, customer_member_id: SHARED_KID, opportunity_id: null, customer_id: null, person_id: null },
        { id: SUB.opp, org_id: ORG, customer_member_id: null, opportunity_id: OPP, customer_id: null, person_id: null },
    ]);
    return db;
}

describe("R5 — lead deletion takes a deleted child's own form submissions", () => {
    it("collects child-only submissions of the children it deletes, never those of a child it keeps", async () => {
        const graph = await resolveOpportunityLeadDeletionGraph(seeded() as never, ORG, OPP);
        expect(graph).not.toBeNull();
        expect(graph!.deletableCustomerMemberIds).toContain(KID);
        expect(graph!.deletableCustomerMemberIds).not.toContain(SHARED_KID);
        expect(graph!.formSubmissionIds).toContain(SUB.kid);
        expect(graph!.formSubmissionIds).toContain(SUB.opp);
        expect(graph!.formSubmissionIds).not.toContain(SUB.sharedKid);
    });
});
