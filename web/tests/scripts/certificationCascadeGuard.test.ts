/**
 * Cascade safety and exact-set preservation — the two defects that cost Firefly a location.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * On 2026-08-04 a reset deleted `locations` 21 → 20. Nothing selected that row. `locations.customer_id`
 * references `customers(id)` ON DELETE CASCADE, and removing a customer took the location with it.
 *
 * Two independent failures made that possible, and each gets its own tests here:
 *   1. the guard inventory enumerated only RESTRICT edges — the ones that BLOCK — and never the
 *      propagating ones that succeed quietly;
 *   2. verification asserted a protected table still had SOME rows, which 21 → 20 passes.
 */

import { describe, expect, it } from "vitest";

import {
    ADJUDICATED_EDGES,
    PROTECTED_CONFIG_TABLES,
    classifyCascadeEdge,
    comparePreservation,
    edgeKey,
    summariseCascadeVerdicts,
    type CascadeEdge,
    type PreservationSnapshot,
} from "@/scripts/lib/certificationCascadeGuard";

const GRAPH = ["opportunities", "customers", "persons", "customer_members", "operational_tasks", "documents"];

const edge = (over: Partial<CascadeEdge> = {}): CascadeEdge => ({
    childTable: "locations",
    childColumn: "customer_id",
    parentTable: "customers",
    action: "CASCADE",
    affectedCount: 1,
    affectedIds: ["loc-1"],
    ...over,
});

describe("silent cascade into protected configuration", () => {
    it("BLOCKS the exact edge that deleted Firefly's location", () => {
        const v = classifyCascadeEdge(edge(), GRAPH);
        expect(v.classification).toBe("protected_configuration_mutation");
        expect(v.blocks).toBe(true);
        expect(v.reason).toMatch(/21st location|operational artifact/i);
    });

    it("has an explicit adjudicated policy for customers → locations", () => {
        expect(ADJUDICATED_EDGES[edgeKey(edge())]).toBeDefined();
        expect(ADJUDICATED_EDGES[edgeKey(edge())].blocks).toBe(true);
    });

    it("BLOCKS any CASCADE into a protected configuration table", () => {
        for (const t of ["departments", "work_units", "form_definitions", "entity_layouts", "configuration_publications"]) {
            const v = classifyCascadeEdge(edge({ childTable: t, childColumn: "x_id" }), GRAPH);
            expect(v.blocks, `${t} must block`).toBe(true);
            expect(v.classification).toBe("protected_configuration_mutation");
        }
    });

    it("BLOCKS SET NULL and SET DEFAULT into protected configuration, not just CASCADE", () => {
        // A nulled configuration column is a mutation too — the row survives but is no longer what
        // was certified.
        for (const action of ["SET NULL", "SET DEFAULT"] as const) {
            const v = classifyCascadeEdge(edge({ childTable: "departments", childColumn: "owner_id", action }), GRAPH);
            expect(v.blocks).toBe(true);
        }
    });

    it("allows a cascade into a table already inside the deletion contract", () => {
        const v = classifyCascadeEdge(edge({ childTable: "operational_tasks", childColumn: "opportunity_id", parentTable: "opportunities" }), GRAPH);
        expect(v.blocks).toBe(false);
        expect(v.classification).toBe("intended_dependent_deletion");
    });

    it("FAILS CLOSED on an unknown propagation edge outside the contract", () => {
        const v = classifyCascadeEdge(edge({ childTable: "some_future_table", childColumn: "customer_id" }), GRAPH);
        expect(v.blocks).toBe(true);
        expect(v.classification).toBe("unexpected_propagation");
        expect(v.reason).toMatch(/no policy/);
    });

    it("does not block an edge that would touch zero rows", () => {
        const v = classifyCascadeEdge(edge({ childTable: "some_future_table", affectedCount: 0, affectedIds: [] }), GRAPH);
        expect(v.blocks).toBe(false);
    });

    it("summarises blocking verdicts for the operator", () => {
        const s = summariseCascadeVerdicts([
            classifyCascadeEdge(edge(), GRAPH),
            classifyCascadeEdge(edge({ childTable: "operational_tasks", parentTable: "opportunities" }), GRAPH),
        ]);
        expect(s.ok).toBe(false);
        expect(s.blocking).toHaveLength(1);
        expect(s.blocking[0].edge.childTable).toBe("locations");
    });

    it("lists locations among the protected configuration tables", () => {
        expect(PROTECTED_CONFIG_TABLES).toContain("locations");
    });
});

describe("exact-set preservation", () => {
    const snap = (count: number, idHash: string): PreservationSnapshot => ({ locations: { count, idHash } });

    it("FAILS on 21 → 20 — the check that previously passed", () => {
        const r = comparePreservation(snap(21, "hash-21"), snap(20, "hash-20"));
        expect(r.ok).toBe(false);
        expect(r.deltas[0].problem).toMatch(/changed from 21 to 20 rows/);
    });

    it("FAILS when the count holds but a row was swapped", () => {
        const r = comparePreservation(snap(21, "hash-a"), snap(21, "hash-b"));
        expect(r.ok).toBe(false);
        expect(r.deltas[0].problem).toMatch(/ID set changed/);
    });

    it("PASSES when count and ID set are both unchanged", () => {
        const r = comparePreservation(snap(21, "same"), snap(21, "same"));
        expect(r.ok).toBe(true);
        expect(r.deltas[0].problem).toBeNull();
    });

    it("accepts an explicitly approved exact delta, and only that one", () => {
        const approved = { locations: { expectedAfterCount: 20, reason: "customer-owned operational row" } };
        expect(comparePreservation(snap(21, "h21"), snap(20, "h20"), approved).ok).toBe(true);
        // 19 is not what was approved.
        expect(comparePreservation(snap(21, "h21"), snap(19, "h19"), approved).ok).toBe(false);
    });

    it("FAILS when a protected table vanishes from the snapshot entirely", () => {
        const r = comparePreservation(snap(21, "h"), {} as PreservationSnapshot);
        expect(r.ok).toBe(false);
        expect(r.deltas[0].problem).toMatch(/missing from the post-reset snapshot/);
    });

    it("the old weak rule would have passed 21 → 20 — this is why it was replaced", () => {
        const stillHasRows = (after: number) => after > 0;
        expect(stillHasRows(20)).toBe(true); // old check: pass
        expect(comparePreservation(snap(21, "a"), snap(20, "b")).ok).toBe(false); // new check: fail
    });
});
