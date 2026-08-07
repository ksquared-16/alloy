/**
 * A draft reorder synchronizes from the DRAFT, never from the published projection.
 *
 * The defect: `reorder_stage` saved the new order to `business_process_drafts`, then re-read
 * `departments.metadata` — the PUBLISHED projection — and synchronized Work Unit `sort_order` from
 * it. So an unpublished reorder ordered the queues by whatever was last published: stale by exactly
 * the change the operator had just made.
 *
 * The fix is a boundary, not a behaviour: the synchronizer no longer READS configuration at all, it
 * is HANDED the authoritative builder. That removes the possibility of caller and callee disagreeing
 * about where configuration comes from.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { syncWorkUnitSortOrderFromBuilderStages } from "@/lib/lifecycle/syncWorkUnitSortOrderFromBuilder";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

/** published order A B C — what `departments.metadata` would still say before Apply. */
const PUBLISHED_ORDER = ["a", "b", "c"];
/** draft order A C B — what the operator just saved. */
const DRAFT_ORDER = ["a", "c", "b"];

function builderWithOrder(order: string[]): LifecycleBuilderV1 {
    return {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: order.map((key, index) => ({
                    id: `stage-${key}`,
                    key,
                    label: key.toUpperCase(),
                    sort_order: index,
                    is_active: true,
                })),
            },
        ],
    } as unknown as LifecycleBuilderV1;
}

/** Captures the sort_order writes the synchronizer issues, keyed by work-unit key. */
function makeSupabase(seenWorkUnits: string[]) {
    const writes: Array<{ id: string; sort_order: number }> = [];
    const supabase = {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            let patch: Record<string, unknown> | null = null;
            const builder: Record<string, unknown> = {
                select: () => builder,
                update(p: Record<string, unknown>) {
                    patch = p;
                    return builder;
                },
                eq(col: string, val: unknown) {
                    filters[col] = val;
                    if (patch && col === "id") {
                        writes.push({ id: String(val), sort_order: Number(patch.sort_order) });
                    }
                    return builder;
                },
                maybeSingle() {
                    if (table !== "work_units") return Promise.resolve({ data: null, error: null });
                    const key = String(filters.key ?? "");
                    seenWorkUnits.push(key);
                    return Promise.resolve({ data: { id: `wu-${key}` }, error: null });
                },
                then(resolve_: (r: { data: unknown; error: null }) => void) {
                    resolve_({ data: null, error: null });
                },
            };
            return builder;
        },
    } as never;
    return { supabase, writes };
}

describe("reorder synchronizes from the saved draft, not the projection", () => {
    it("orders work units by the DRAFT order (A C B), not the published order (A B C)", async () => {
        const seen: string[] = [];
        const { supabase, writes } = makeSupabase(seen);

        await syncWorkUnitSortOrderFromBuilderStages(supabase, "org-1", "dept-1", builderWithOrder(DRAFT_ORDER));

        // sort_order follows the draft: a=0, c=1, b=2.
        // Assert the ORDER, deriving keys from the platform's own function rather than hardcoding
        // its format — the point is the sequence, not the naming scheme.
        const expected = DRAFT_ORDER.map((k) => `wu-${lifecycleStageWorkUnitKey(k)}`);
        const stale = PUBLISHED_ORDER.map((k) => `wu-${lifecycleStageWorkUnitKey(k)}`);
        const bySortOrder = writes.slice().sort((x, y) => x.sort_order - y.sort_order).map((w) => w.id);
        expect(bySortOrder).toEqual(expected);
        expect(bySortOrder).not.toEqual(stale);
    });

    it("would have produced the stale order if handed the published builder — the defect, pinned", async () => {
        const { supabase, writes } = makeSupabase([]);

        await syncWorkUnitSortOrderFromBuilderStages(supabase, "org-1", "dept-1", builderWithOrder(PUBLISHED_ORDER));

        const bySortOrder = writes.slice().sort((x, y) => x.sort_order - y.sort_order).map((w) => w.id);
        expect(bySortOrder).toEqual(PUBLISHED_ORDER.map((k) => `wu-${lifecycleStageWorkUnitKey(k)}`));
    });

    it("does nothing when there is no builder, rather than guessing an order", async () => {
        const { supabase, writes } = makeSupabase([]);
        const updated = await syncWorkUnitSortOrderFromBuilderStages(supabase, "org-1", "dept-1", null);
        expect(updated).toBe(0);
        expect(writes).toEqual([]);
    });
});

describe("the route hands over the draft and never re-reads the projection", () => {
    const route = readFileSync(
        resolve(__dirname, "../../app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts"),
        "utf8",
    );
    const reorderBlock = route.slice(
        route.indexOf('if (actionName === "reorder_stage")'),
        route.indexOf('logLifecycleBuilderSaveTiming("lifecycle-builder-patch"'),
    );

    it("passes the persisted draft's builder to the synchronizer", () => {
        expect(reorderBlock).toContain("draftBuilder(savedDraft)");
    });

    it("no longer loads the department or its metadata to decide the order", () => {
        expect(reorderBlock).not.toContain("loadDepartment");
        expect(reorderBlock).not.toContain("deptRow.metadata");
    });

    it("synchronizes only AFTER the compare-and-set draft save", () => {
        expect(route.indexOf("const savedDraft = await saveDraft(")).toBeLessThan(
            route.indexOf("syncWorkUnitSortOrderFromBuilderStages("),
        );
    });

    it("writes no projection — the only department write on this path is the draft service", () => {
        // `departments` is still read elsewhere in the route (to load configuration); what must not
        // exist is an UPDATE of its metadata from this handler.
        expect(route).not.toMatch(/from\("departments"\)[\s\S]{0,200}\.update\(/);
    });
});

describe("the synchronizer cannot read configuration at all", () => {
    const src = readFileSync(
        resolve(__dirname, "../../lib/lifecycle/syncWorkUnitSortOrderFromBuilder.ts"),
        "utf8",
    );

    it("no longer derives a builder from department metadata", () => {
        expect(src).not.toContain("lifecycleBuilderFromDepartmentMetadata");
    });

    it("takes the builder as a parameter", () => {
        expect(src).toContain("builder: LifecycleBuilderV1 | null");
    });
});

// Keeps `vi` referenced for parity with the suite's lint config when no mock is needed.
void vi;
