/**
 * The RESOLVED PROCESSING CASE is the authority on which family a relationship attaches to.
 *
 * A public submission is truthful when created — household unresolved, `customer_id` null — and it
 * stays immutable source evidence. Identity resolution belongs to Processing, so downstream
 * Processing actions consume the resolved case, never a back-filled submission row.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect } from "vitest";

import {
    resolveCommitHousehold,
    type ResolvedProcessingCaseContext,
} from "@/lib/pos/processingCase/commit/loadResolvedProcessingCaseContext";
import { resolveRelationshipAnchor } from "@/lib/pos/processingCase/commit/resolveRelationshipAnchor";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";

const ORG = "org-1";
const HOUSEHOLD = "cdc10000-0000-4000-8000-000000000001";
const OTHER_HOUSEHOLD = "cdc10000-0000-4000-8000-0000000000ff";
const CHILD_A = "cdc10000-0000-4000-8000-00000000000a";
const SIBLING_B = "cdc10000-0000-4000-8000-00000000000b";

function context(overrides: Partial<ResolvedProcessingCaseContext> = {}): ResolvedProcessingCaseContext {
    return {
        case_id: "case-1",
        organization_id: ORG,
        customer_id: HOUSEHOLD,
        customer_member_ids: [CHILD_A, SIBLING_B],
        primary_customer_member_id: null,
        person_ids: [],
        operational_record_ids: { household: HOUSEHOLD, lead: "lead-1" },
        resolution_status: "resolved",
        resolution_revision: `${HOUSEHOLD}|attempt:1|lead-1|completed`,
        resolved_at: "2026-07-30T00:00:00.000Z",
        source: "operational_result",
        is_current: true,
        ...overrides,
    };
}

describe("resolved processing case context — household authority", () => {
    it("1. a public submission with NULL customer_id succeeds once the case is resolved", () => {
        const res = resolveCommitHousehold({ context: context(), submissionCustomerId: null });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.customer_id).toBe(HOUSEHOLD);
    });

    it("2 + 3 + 4. preview and commit resolve the SAME context from the same inputs", () => {
        // Both paths call this helper with identical arguments; identical arguments must give an
        // identical answer, or a preview would not describe what the commit will do.
        const args = { context: context(), submissionCustomerId: null };
        const preview = resolveCommitHousehold(args);
        const commit = resolveCommitHousehold(args);
        expect(preview).toEqual(commit);
        expect(preview.ok && preview.customer_id).toBe(HOUSEHOLD);
        expect(preview.ok && preview.revision).toBe(commit.ok && commit.revision);
    });

    it("5. resolution READS only — it never mutates the inputs it was given", () => {
        const ctx = context();
        const snapshot = JSON.parse(JSON.stringify(ctx));
        const submissionCustomerId = null;
        resolveCommitHousehold({ context: ctx, submissionCustomerId });
        expect(ctx, "the case context must not be mutated").toEqual(snapshot);
        expect(submissionCustomerId, "the submission value must not be rewritten").toBeNull();
    });

    it("6. submission household AGREEING with the resolved case is accepted", () => {
        const res = resolveCommitHousehold({ context: context(), submissionCustomerId: HOUSEHOLD });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.customer_id).toBe(HOUSEHOLD);
    });

    it("7. submission household CONFLICTING with the resolved case is rejected, never silently chosen", () => {
        const res = resolveCommitHousehold({ context: context(), submissionCustomerId: OTHER_HOUSEHOLD });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("resolution_conflict");
            expect(res.status).toBe(409);
        }
    });

    it("8. neither a resolved case NOR a submission household is rejected", () => {
        const res = resolveCommitHousehold({
            context: context({ customer_id: null, resolution_status: "unresolved", customer_member_ids: [] }),
            submissionCustomerId: null,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("case_has_no_resolved_household");
    });

    it("9. an UNRESOLVED or FAILED identity case is rejected", () => {
        const failed = resolveCommitHousehold({
            context: context({ customer_id: null, resolution_status: "failed", customer_member_ids: [] }),
            submissionCustomerId: null,
        });
        expect(failed.ok).toBe(false);
        if (!failed.ok) expect(failed.code).toBe("identity_unresolved");

        const missing = resolveCommitHousehold({ context: null, submissionCustomerId: null });
        expect(missing.ok).toBe(false);
        if (!missing.ok) expect(missing.code).toBe("case_has_no_resolved_household");
    });

    it("10. a STALE / superseded resolution is rejected and asks for re-approval", () => {
        const res = resolveCommitHousehold({
            context: context(),
            submissionCustomerId: null,
            expectedRevision: "some-older-revision",
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("resolution_stale");
            expect(res.status).toBe(409);
            expect(res.reason).toMatch(/re-?approve/i);
        }
    });

    it("10b. the CURRENT revision passes the staleness check", () => {
        const ctx = context();
        const res = resolveCommitHousehold({
            context: ctx,
            submissionCustomerId: null,
            expectedRevision: ctx.resolution_revision,
        });
        expect(res.ok).toBe(true);
    });

    it("11. a resolved household from ANOTHER ORGANIZATION cannot supply anchors", () => {
        // The context is org-scoped at load time; an anchor carrying a foreign org is refused here.
        const def = relationshipDefinitionForRole("authorized_pickup")!;
        const res = resolveRelationshipAnchor({
            definition: def,
            orgId: ORG,
            householdChildren: [{ customer_member_id: CHILD_A, customer_id: HOUSEHOLD, org_id: "org-2" }],
            request: { customerId: HOUSEHOLD, scope: "this_child", customerMemberId: CHILD_A },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("anchor_wrong_organization");
    });

    it("12. the child anchor is validated against the RESOLVED household's children", () => {
        const ctx = context();
        const def = relationshipDefinitionForRole("authorized_pickup")!;
        const candidates = ctx.customer_member_ids.map((id) => ({
            customer_member_id: id,
            customer_id: ctx.customer_id!,
            org_id: ctx.organization_id,
        }));

        const good = resolveRelationshipAnchor({
            definition: def,
            orgId: ORG,
            householdChildren: candidates,
            request: { customerId: ctx.customer_id!, scope: "this_child", customerMemberId: CHILD_A },
        });
        expect(good.ok).toBe(true);
        if (good.ok) expect(good.memberIds).toEqual([CHILD_A]);

        // a child that is not in the resolved household is refused
        const foreign = resolveRelationshipAnchor({
            definition: def,
            orgId: ORG,
            householdChildren: candidates,
            request: { customerId: ctx.customer_id!, scope: "this_child", customerMemberId: "member-elsewhere" },
        });
        expect(foreign.ok).toBe(false);
        if (!foreign.ok) expect(foreign.code).toBe("anchor_not_found");
    });

    it("13 + 14. the revision distinguishes retries from a re-resolved case", () => {
        // Same resolution -> same revision -> the idempotency key is the same -> a retry is a no-op.
        const a = resolveCommitHousehold({ context: context(), submissionCustomerId: null });
        const b = resolveCommitHousehold({ context: context(), submissionCustomerId: null });
        expect(a.ok && b.ok && a.revision === b.revision).toBe(true);

        // Re-resolved to a DIFFERENT household -> different revision -> a distinct commit, never a
        // replay of the ledger entry written against the previous family.
        const moved = resolveCommitHousehold({
            context: context({
                customer_id: OTHER_HOUSEHOLD,
                resolution_revision: `${OTHER_HOUSEHOLD}|attempt:2|lead-2|completed`,
            }),
            submissionCustomerId: null,
        });
        expect(moved.ok).toBe(true);
        expect(a.ok && moved.ok && a.revision === moved.revision).toBe(false);
        expect(moved.ok && moved.customer_id).toBe(OTHER_HOUSEHOLD);
    });

    it("the household is NEVER inferred from submission content", () => {
        // No guardian email, child name, or other payload field can stand in for resolution.
        const res = resolveCommitHousehold({
            context: context({ customer_id: null, resolution_status: "unresolved", customer_member_ids: [] }),
            submissionCustomerId: null,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toMatch(/approve identity resolution/i);
    });
});
