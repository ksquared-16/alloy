/**
 * §4 — the negative control this whole slice exists for.
 *
 *     an authorized_pickup relationship
 *   + an active may_not_pick_up restriction
 *   → the operational result may NOT claim unrestricted pickup authorization
 *
 * Both facts are true at once. The restriction constrains the action; it does not delete the family
 * tie. If this test can be made to pass by deleting the relationship, the model is wrong.
 */

import { describe, expect, it } from "vitest";
import { resolvePickupAuthorization } from "@/lib/safeguarding/resolvePickupAuthorization";
import { isInForce, type SafeguardingRestriction } from "@/lib/safeguarding/safeguardingRestriction";

const TODAY = "2026-09-01";

const restriction = (over: Partial<SafeguardingRestriction> = {}): SafeguardingRestriction => ({
    id: "r1",
    customer_member_id: "child-1",
    affected_person_id: "person-1",
    affected_party_description: null,
    restriction_kind: "protective_or_restraining_order",
    operational_effect: "may_not_pick_up",
    status: "active",
    effective_from: null,
    effective_to: null,
    evidence_basis: "document",
    evidence_document_id: "doc-1",
    source: "operator",
    review_state: "approved",
    supersedes_id: null,
    ...over,
});

const ask = (over: Partial<Parameters<typeof resolvePickupAuthorization>[0]> = {}) =>
    resolvePickupAuthorization({
        relationshipAuthorizedPickup: true,
        restrictions: [restriction()],
        personId: "person-1",
        onDate: TODAY,
        safeguardingScreened: true,
        ...over,
    });

describe("the coexistence case", () => {
    it("refuses pickup even though the family listed this person as authorized", () => {
        const r = ask();
        expect(r.state).toBe("restricted");
        expect(r.authorized).toBe(false);
        expect(r.blockingRestrictionIds).toEqual(["r1"]);
    });

    it("says out loud that BOTH facts are true", () => {
        // The operator must not be left thinking the relationship was deleted or was never there.
        expect(ask().reasons.join(" ")).toMatch(/also lists this person as an authorized pickup/i);
    });

    it("still refuses when the relationship is absent — the restriction is not the relationship's negation", () => {
        expect(ask({ relationshipAuthorizedPickup: null }).state).toBe("restricted");
    });
});

describe("what an unrestricted answer requires", () => {
    it("authorizes only with a relationship, screening done, and nothing in force", () => {
        const r = ask({ restrictions: [] });
        expect(r.state).toBe("authorized");
        expect(r.authorized).toBe(true);
    });

    it("does NOT authorize when safeguarding was never established", () => {
        // The failure this prevents: an unasked question reading as "no restrictions".
        const r = ask({ restrictions: [], safeguardingScreened: false });
        expect(r.state).toBe("unknown");
        expect(r.authorized).toBe(false);
        expect(r.reasons.join(" ")).toMatch(/has not been established/i);
    });

    it("does not authorize a person the family never listed", () => {
        expect(ask({ restrictions: [], relationshipAuthorizedPickup: false }).state).toBe("unknown");
    });
});

describe("a restriction that is not in force does not block", () => {
    it("ignores a proposed restriction — an assertion is not a control", () => {
        // Acting on an unreviewed assertion is its own harm, and so is ignoring an approved one.
        const r = ask({ restrictions: [restriction({ status: "proposed", review_state: "pending_review" })] });
        expect(r.state).toBe("authorized");
    });

    it("ignores an active-but-unapproved row, which the database also forbids", () => {
        expect(ask({ restrictions: [restriction({ review_state: "pending_review" })] }).state).toBe("authorized");
        expect(isInForce(restriction({ review_state: "pending_review" }), TODAY)).toBe(false);
    });

    it("ignores superseded, revoked and expired rows", () => {
        for (const status of ["superseded", "revoked", "expired"] as const) {
            expect(ask({ restrictions: [restriction({ status })] }).state, status).toBe("authorized");
        }
    });

    it("respects effective dates — pickup is a question about today", () => {
        expect(ask({ restrictions: [restriction({ effective_from: "2026-10-01" })] }).state).toBe("authorized");
        expect(ask({ restrictions: [restriction({ effective_to: "2026-08-01" })] }).state).toBe("authorized");
        expect(ask({ restrictions: [restriction({ effective_from: "2026-08-01", effective_to: "2026-12-01" })] }).state).toBe("restricted");
    });
});

describe("evidence absence is not restriction absence", () => {
    it("blocks on a parent's declaration with no document attached", () => {
        // A missing court order must never read as a missing restriction.
        const r = ask({ restrictions: [restriction({ evidence_basis: "parent_declaration", evidence_document_id: null })] });
        expect(r.state).toBe("restricted");
    });

    it("keeps the basis distinguishable rather than collapsing it to a boolean", () => {
        const declared = restriction({ evidence_basis: "parent_declaration", evidence_document_id: null });
        const documented = restriction({ evidence_basis: "document", evidence_document_id: "doc-1" });
        expect(declared.evidence_basis).not.toBe(documented.evidence_basis);
        expect(isInForce(declared, TODAY)).toBe(isInForce(documented, TODAY));
    });
});

describe("a restriction with no named party", () => {
    it("does not silently clear pickup for everyone", () => {
        // "There is a custody arrangement" names nobody. It cannot bar a specific person, and it
        // must not be treated as an all-clear either.
        const r = ask({
            restrictions: [restriction({ affected_person_id: null, restriction_kind: "custody_restriction", operational_effect: "contact_restricted" })],
        });
        expect(r.state).toBe("unknown");
        expect(r.reasons.join(" ")).toMatch(/without a named party/i);
    });

    it("lets an informational-only note through", () => {
        const r = ask({
            restrictions: [restriction({ affected_person_id: null, operational_effect: "informational_only" })],
        });
        expect(r.state).toBe("authorized");
    });
});

describe("a contact restriction is not silently read as a pickup bar", () => {
    it("returns unknown rather than guessing either way", () => {
        const r = ask({ restrictions: [restriction({ operational_effect: "contact_restricted" })] });
        expect(r.state).toBe("unknown");
        expect(r.authorized).toBe(false);
    });
});

describe("a restriction on someone else does not affect this person", () => {
    it("authorizes the person who is not named", () => {
        expect(ask({ restrictions: [restriction({ affected_person_id: "person-2" })] }).state).toBe("authorized");
    });
});
