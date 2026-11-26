/**
 * DELETE LEAD NEVER LEAVES AN ENROLLMENT JOURNEY POINTING AT NOTHING.
 *
 * Staging: 254 Enrollment journeys whose child no longer exists, and Delete Lead (and the single-child
 * DELETE route) could create more — they hard-deleted children and participations and never touched their
 * journeys, packet sessions or participant links. The database now refuses that delete
 * (child_has_enrollment_journey, migration 20261128090000); Delete Lead says so in its preview, before the
 * operator confirms, and the child route answers 409 with the same instruction (archive instead).
 */
import { describe, expect, it } from "vitest";

import { resolveOpportunityLeadDeletionGraph } from "@/lib/admin/opportunity/opportunityLeadDeletionGraph";

type Row = Record<string, unknown>;
function fake(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let head = false;
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: (_c?: string, opts?: { head?: boolean }) => { head = Boolean(opts?.head); return api; },
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return api; },
                order: () => api,
                limit: () => api,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res(head ? { data: null, count: rows().length, error: null } : { data: rows(), count: rows().length, error: null }),
            };
            return api;
        },
    };
}

const ORG = "org-1";
const world = (journeys: Row[]) => fake({
    opportunities: [{ id: "opp-1", org_id: ORG, name: "Lead", customer_id: "house-1" }],
    customers: [{ id: "house-1", org_id: ORG }],
    customer_members: [{ id: "child-1", org_id: ORG, customer_id: "house-1", relationship: "child" }],
    opportunity_customer_members: [{ id: "ocm-1", org_id: ORG, opportunity_id: "opp-1", customer_member_id: "child-1" }],
    process_instances: journeys,
});

describe("Delete Lead and Enrollment journeys", () => {
    it("is blocked, before anything is deleted, when a child in the family has an Enrollment journey", async () => {
        const graph = await resolveOpportunityLeadDeletionGraph(world([{ id: "pi-1", org_id: ORG, subject_type: "child", subject_id: "child-1" }]) as never, ORG, "opp-1");
        expect(graph?.blocked).toBe(true);
        expect(graph?.blockReason).toMatch(/started Enrollment.*Archive the lead/);
    });

    it("is not blocked for a lead whose children never started Enrollment", async () => {
        const graph = await resolveOpportunityLeadDeletionGraph(world([]) as never, ORG, "opp-1");
        expect(graph?.blockReason ?? "").not.toMatch(/Enrollment/);
    });
});
