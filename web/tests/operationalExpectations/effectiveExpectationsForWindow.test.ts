/**
 * The query seam: rows in, effective expectations out — with the fail-closed
 * lineages surfaced rather than swallowed.
 *
 * The seam must not reproduce resolver semantics, so these tests check what the
 * SEAM is responsible for: tenancy at the query, carrying the facets the resolver
 * deliberately ignores (subject ref, condition), and refusing to let an
 * undeterminable lineage look like an absent one.
 */

import { describe, expect, it, vi } from "vitest";
import {
    effectiveExpectationsForWindow,
    type ExpectationQueryGateway,
    type ExpectationRatificationEvidence,
    type ExpectationQueryRow,
} from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";

const ORG = "org-1";
/**
 * Valid-time is a TIMESTAMP axis, and `valid_to` is an exclusive end — the
 * resolver's own fixtures use full ISO instants. A bare "2026-09-18" with a
 * same-day `valid_to` describes a zero-length window and is effective at no
 * coordinate at all, which is how a correct seam looks broken.
 */
const DAY = "2026-09-18T00:00:00Z";
const NEXT_DAY = "2026-09-19T00:00:00Z";

function row(over: Partial<ExpectationQueryRow>): ExpectationQueryRow {
    return {
        id: "e1",
        org_id: ORG,
        lineage_root_id: over.id ?? "e1", // a create roots itself
        supersedes_expectation_id: null,
        verb: "create",
        transition_type: null,
        modality: "prohibited",
        author_class: "human",
        authority_key: "user:operator",
        standing: "binding",
        subject_kind: "child",
        valid_from: DAY,
        valid_to: NEXT_DAY,
        authored_at: "2026-09-15T09:00:00.000Z",
        subject_ref: { id: "emma" },
        condition: { reason_key: "vacation" },
        ...over,
    } as ExpectationQueryRow;
}

function gatewayOf(
    rows: ExpectationQueryRow[],
    ratifications: ExpectationRatificationEvidence[] = [],
): ExpectationQueryGateway {
    return {
        loadRowsForSubjects: vi.fn(async () => rows),
        loadRatifications: vi.fn(async () => ratifications),
    };
}

const query = {
    orgId: ORG,
    subjects: [{ kind: "child", id: "emma" }],
    asOf: { validTime: DAY },
};

describe("the seam answers a question rather than folding handed-in rows", () => {
    it("returns the effective expectation with its subject and reason", async () => {
        const r = await effectiveExpectationsForWindow(query, gatewayOf([row({})]));
        expect(r.effective).toHaveLength(1);
        expect(r.effective[0]).toMatchObject({
            subjectKind: "child",
            subjectId: "emma",
            modality: "prohibited",
        });
        // The resolver never reads `condition`; the seam is what carries it.
        expect(r.effective[0].condition).toEqual({ reason_key: "vacation" });
    });

    it("short-circuits without touching storage when nothing was asked for", async () => {
        const gw = gatewayOf([row({})]);
        const r = await effectiveExpectationsForWindow({ ...query, subjects: [] }, gw);
        expect(r).toEqual({ effective: [], unresolved: [] });
        expect(gw.loadRowsForSubjects).not.toHaveBeenCalled();
    });

    it("returns nothing for an empty ledger rather than inventing a default", async () => {
        expect(await effectiveExpectationsForWindow(query, gatewayOf([]))).toEqual({
            effective: [],
            unresolved: [],
        });
    });
});

describe("tenancy", () => {
    it("ignores a row belonging to another org even if storage returned it", async () => {
        // Defence in depth: the gateway filters by org, and the resolver filters
        // again. A leak would need both to fail.
        const r = await effectiveExpectationsForWindow(query, gatewayOf([row({ org_id: "other-org" })]));
        expect(r.effective).toEqual([]);
    });
});

describe("revision — the ratified path for changing future intent", () => {
    it("resolves the revision, not the superseded original", async () => {
        const v1 = row({ id: "v1", lineage_root_id: "v1", authored_at: "2026-09-15T09:00:00.000Z" });
        const v2 = row({
            id: "v2",
            lineage_root_id: "v1",
            supersedes_expectation_id: "v1",
            verb: "revise",
            transition_type: "revision",
            authored_at: "2026-09-17T09:00:00.000Z",
            condition: { reason_key: "plans_changed" },
        });
        const r = await effectiveExpectationsForWindow(query, gatewayOf([v1, v2]));
        expect(r.effective).toHaveLength(1);
        expect(r.effective[0].expectationId).toBe("v2");
        expect(r.effective[0].condition).toEqual({ reason_key: "plans_changed" });
        // One lineage, not two competing expectations.
        expect(r.effective[0].lineageRootId).toBe("v1");
    });
});

describe("an undeterminable lineage must never look like an absent one", () => {
    it("surfaces an unratified transition instead of dropping the lineage", async () => {
        const v1 = row({ id: "v1", lineage_root_id: "v1" });
        const v2 = row({
            id: "v2",
            lineage_root_id: "v1",
            supersedes_expectation_id: "v1",
            verb: "cancel",
            transition_type: "cancellation",
            authored_at: "2026-09-17T09:00:00.000Z",
        });
        const r = await effectiveExpectationsForWindow(query, gatewayOf([v1, v2]));

        // Silently returning [] here would tell the roster "no expectation
        // applies" — indistinguishable from a normal day.
        expect(r.effective).toEqual([]);
        expect(r.unresolved).toHaveLength(1);
        expect(r.unresolved[0]).toMatchObject({
            subjectKind: "child",
            subjectId: "emma",
            lineageRootId: "v1",
        });
        expect(r.unresolved[0].reason).toContain("cancellation");
    });

    it("fails only the offending lineage, leaving other subjects resolved", async () => {
        const bad1 = row({ id: "b1", lineage_root_id: "b1", subject_ref: { id: "emma" } });
        const bad2 = row({
            id: "b2",
            lineage_root_id: "b1",
            supersedes_expectation_id: "b1",
            verb: "cancel",
            transition_type: "cancellation",
            authored_at: "2026-09-17T09:00:00.000Z",
            subject_ref: { id: "emma" },
        });
        const good = row({ id: "g1", lineage_root_id: "g1", subject_ref: { id: "finn" } });

        const r = await effectiveExpectationsForWindow(query, gatewayOf([bad1, bad2, good]));
        expect(r.unresolved.map((u) => u.subjectId)).toEqual(["emma"]);
        expect(r.effective.map((e) => e.subjectId)).toEqual(["finn"]);
    });
});

describe("subject refs of other shapes still resolve", () => {
    it("accepts a site subject", async () => {
        const r = await effectiveExpectationsForWindow(
            { ...query, subjects: [{ kind: "site", id: "site-1" }] },
            gatewayOf([row({ subject_kind: "site", subject_ref: { id: "site-1" }, condition: {} })]),
        );
        expect(r.effective[0]).toMatchObject({ subjectKind: "site", subjectId: "site-1" });
    });
});
