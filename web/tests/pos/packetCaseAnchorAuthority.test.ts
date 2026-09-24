/**
 * THE COMMIT RUNTIME HAD TWO READINGS OF "WHICH FAMILY IS THIS".
 *
 * `resolveCommitHousehold` decides the household, and it accepts the SUBMISSION's own customer when
 * the case carries no operational resolution — which is every Processing case opened from an
 * enrollment packet. The anchor candidates were loaded somewhere else entirely: only for the
 * household named in `metadata.operational_result.records.household`.
 *
 * So the executor resolved the right family and then refused every child in it. MEASURED against a
 * real case: role `emergency_contact`, command `add_emergency_contact`, scope `this_child`,
 * destination `person_child_relationships` — all correct — then `403 anchor_not_found` for a child
 * plainly in the household.
 *
 * One authority now. These guard that the loosening is exactly one thing: WHICH household the
 * candidates are loaded for. Every check on the candidates themselves still stands.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
    resolveCommitHousehold,
    type ResolvedProcessingCaseContext,
} from "@/lib/pos/processingCase/commit/loadResolvedProcessingCaseContext";
import { resolveRelationshipAnchor, type AnchorCandidate } from "@/lib/pos/processingCase/commit/resolveRelationshipAnchor";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";

const ORG = "org-1";
const HOUSEHOLD = "cdc10000-0000-4000-8000-000000000001";
const OTHER_HOUSEHOLD = "cdc10000-0000-4000-8000-0000000000ff";
const TOUREE = "cdc10000-0000-4000-8000-00000000000a";
const BEA = "cdc10000-0000-4000-8000-00000000000b";
const OTHER_CHILD = "cdc10000-0000-4000-8000-0000000000cc";

/** A case opened from an enrollment packet: no operational result, so no resolved household. */
function packetCaseContext(): ResolvedProcessingCaseContext {
    return {
        case_id: "case-packet",
        organization_id: ORG,
        customer_id: null,
        customer_member_ids: [],
        primary_customer_member_id: null,
        person_ids: [],
        operational_record_ids: {},
        resolution_status: "unresolved",
        resolution_revision: "-|-|-|received",
        resolved_at: null,
        source: "operational_result",
        is_current: false,
    };
}

const EMERGENCY = relationshipDefinitionForRole("emergency_contact")!;

/** The candidate list as the repaired executor builds it: children of the DECIDED household. */
const candidatesFor = (customerId: string, ids: readonly string[]): AnchorCandidate[] =>
    ids.map((id) => ({ customer_member_id: id, customer_id: customerId, org_id: ORG }));

describe("the household a packet case commits against", () => {
    it("comes from the submission when the case has no operational resolution", () => {
        const res = resolveCommitHousehold({ context: packetCaseContext(), submissionCustomerId: HOUSEHOLD });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.customer_id).toBe(HOUSEHOLD);
    });

    it("carries a context whose own candidate list is empty — the whole defect in one line", () => {
        const res = resolveCommitHousehold({ context: packetCaseContext(), submissionCustomerId: HOUSEHOLD });
        expect(res.ok && res.context.customer_member_ids).toEqual([]);
    });

    it("anchors successfully once candidates are loaded for the household it decided", () => {
        const res = resolveCommitHousehold({ context: packetCaseContext(), submissionCustomerId: HOUSEHOLD });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            householdChildren: candidatesFor(res.customer_id, [TOUREE, BEA]),
            request: { customerId: res.customer_id, customerMemberId: TOUREE, scope: "this_child" },
        });
        expect(anchor.ok, "ok" in anchor && !anchor.ok ? anchor.reason : "").toBe(true);
        if (anchor.ok) {
            expect(anchor.memberIds).toEqual([TOUREE]);
            expect(anchor.anchorCustomerMemberId).toBe(TOUREE);
            expect(anchor.scope).toBe("this_child");
            expect(anchor.householdWide).toBe(false);
        }
    });

    it("still refuses the anchor when the candidate list is the old metadata-only one", () => {
        // The shipped behaviour, kept as a description of what was wrong.
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            householdChildren: [],
            request: { customerId: HOUSEHOLD, customerMemberId: TOUREE, scope: "this_child" },
        });
        expect(anchor.ok).toBe(false);
        if (!anchor.ok) expect(anchor.code).toBe("anchor_not_found");
    });
});

describe("nothing about candidate validation was loosened", () => {
    it("refuses a child from another household", () => {
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            householdChildren: candidatesFor(HOUSEHOLD, [TOUREE]),
            request: { customerId: HOUSEHOLD, customerMemberId: OTHER_CHILD, scope: "this_child" },
        });
        expect(anchor.ok).toBe(false);
        if (!anchor.ok) expect(anchor.code).toBe("anchor_not_found");
    });

    it("refuses a candidate whose household disagrees with the resolved one", () => {
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            // Loaded, but belonging to a different family.
            householdChildren: [{ customer_member_id: OTHER_CHILD, customer_id: OTHER_HOUSEHOLD, org_id: ORG }],
            request: { customerId: HOUSEHOLD, customerMemberId: OTHER_CHILD, scope: "this_child" },
        });
        expect(anchor.ok).toBe(false);
        if (!anchor.ok) expect(anchor.code).toBe("anchor_wrong_household");
    });

    it("refuses a candidate from another organization", () => {
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            householdChildren: [{ customer_member_id: TOUREE, customer_id: HOUSEHOLD, org_id: "org-other" }],
            request: { customerId: HOUSEHOLD, customerMemberId: TOUREE, scope: "this_child" },
        });
        expect(anchor.ok).toBe(false);
        if (!anchor.ok) expect(anchor.code).toBe("anchor_wrong_organization");
    });

    it("still refuses a child-scoped commit with no child named", () => {
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            householdChildren: candidatesFor(HOUSEHOLD, [TOUREE, BEA]),
            request: { customerId: HOUSEHOLD, scope: "this_child" },
        });
        expect(anchor.ok).toBe(false);
        if (!anchor.ok) expect(anchor.code).toBe("missing_child_anchor");
    });

    it("never expands a named child to the sibling beside them", () => {
        const anchor = resolveRelationshipAnchor({
            definition: EMERGENCY,
            orgId: ORG,
            householdChildren: candidatesFor(HOUSEHOLD, [TOUREE, BEA]),
            request: { customerId: HOUSEHOLD, customerMemberId: TOUREE, scope: "this_child" },
        });
        expect(anchor.ok && anchor.memberIds).toEqual([TOUREE]);
        expect(anchor.ok && anchor.memberIds).not.toContain(BEA);
    });

    it("a conflicting household is still a conflict, never a choice", () => {
        const resolvedElsewhere = { ...packetCaseContext(), customer_id: OTHER_HOUSEHOLD, resolution_status: "resolved" as const };
        const res = resolveCommitHousehold({ context: resolvedElsewhere, submissionCustomerId: HOUSEHOLD });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("resolution_conflict");
    });
});

describe("the executor reads one authority", () => {
    const src = readFileSync(
        new URL("../../lib/pos/processingCase/commit/executeRelationshipProposalCommit.ts", import.meta.url).pathname,
        "utf8",
    );

    it("loads candidates for the household it decided", () => {
        const at = src.indexOf("const anchorCandidates");
        expect(at).toBeGreaterThan(0);
        const block = src.slice(at, at + 500);
        expect(block).toContain("loadHouseholdAnchorCandidates");
        expect(block).toContain("customerId: anchorCustomerId");
    });

    it("no longer reads the projection's metadata-only candidate list", () => {
        const at = src.indexOf("const anchorCandidates");
        expect(src.slice(at, at + 500)).not.toContain("context.customer_member_ids");
    });

    it("still resolves the household before anything is loaded for it", () => {
        expect(src.indexOf("resolveCommitHousehold(")).toBeLessThan(src.indexOf("const anchorCandidates"));
    });
});
