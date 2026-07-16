/**
 * D1 — Provisioning contract: the New Leads cohort resolves through STAGE MEMBERSHIP.
 *
 * Governing: docs/platform/runtime/runtime-implementation-authorization.md
 *   U-P3 "Queue truth: the active lens's rows … from Records via the queue evaluator"
 *   U-P2 "Work View resolution: the active lens"
 * and docs/platform/runtime/stage-work-view-queue-canonical-model.md §1.4 (one evaluator),
 * §0.5.1 (Row Grain is Stage-owned; `case` is a compatibility name for `family`).
 *
 * What this pins:
 *   1. The lens admits its cohort by STAGE, not by a status allowlist. The lane predicate system
 *      is a status-only allowlist (`{status_key, created_at, updated_at}`); when status collapsed
 *      to {open, closed} it lost the vocabulary to express "lead" — LIFECYCLE_QUEUE_FILTERS_EMPTY,
 *      "the empty New Leads queue … it is the model". Stage Membership has no such problem.
 *   2. ONE evaluator produces the rows. `computeOperationalProjection` is pure and never touches
 *      QueueService, so the lane error class is unreachable from this path BY CONSTRUCTION.
 *
 * The fixture is the real authored configuration and a real bounded page (500 rows) captured from
 * the representative local seed: 150 `lead` + 350 `closed` inside the New Leads Work Unit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { computeOperationalProjection } from "@/lib/lifecycle/operationalProjection";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";

const fixture = JSON.parse(
    readFileSync(join(__dirname, "fixtures/new-leads-entry.json"), "utf8"),
) as { metadata: unknown; rows: Array<Record<string, unknown>> };

describe("D1 provisioning answer — Stage Membership resolves the cohort", () => {
    const workViews = savedWorkViewsFromDepartmentMetadata(fixture.metadata);
    const baseRows = fixture.rows;

    it("the fixture is the representative bounded page (500 rows: 150 lead / 350 closed)", () => {
        expect(baseRows).toHaveLength(500);
        expect(baseRows.filter((r) => r.stage_key === "lead")).toHaveLength(150);
    });

    it("the New Leads lens is authored with a STAGE predicate, not a status allowlist", () => {
        const newLeads = workViews.find((v) => v.id === "new_leads");
        expect(newLeads).toBeDefined();
        expect(newLeads?.filters_v1).toEqual([
            { field_key: "opportunity_stage", operator: "equals", value: "lead" },
        ]);
    });

    it("U-P3: the ONE evaluator admits exactly the 150-row cohort from 500 base rows", () => {
        const projection = computeOperationalProjection({ baseRows, workViews });
        expect(projection.byViewId["new_leads"]?.count).toBe(150);
    });

    it("membership is stage — every admitted row holds stage_key='lead'", () => {
        const projection = computeOperationalProjection({ baseRows, workViews });
        const rows = projection.byViewId["new_leads"]?.rows ?? [];
        expect(rows).toHaveLength(150);
        expect(rows.every((r) => (r as Record<string, unknown>).stage_key === "lead")).toBe(true);
    });

    it("the lens discriminates: a catch-all lens admits the whole page, New Leads does not", () => {
        const projection = computeOperationalProjection({ baseRows, workViews });
        // `all_work` has no authored predicate — it is legitimately catch-all.
        expect(projection.byViewId["all_work"]?.count).toBe(500);
        // The defect this pins: with NO predicate every lens reported an identical count (the
        // observed 500/500/500/500 pills against a true cohort of 150). An authored stage
        // predicate is what makes the lens mean something.
        expect(projection.byViewId["new_leads"]?.count).not.toBe(
            projection.byViewId["all_work"]?.count,
        );
    });

    it("one evaluation, one page — counts equal rows (no second predicate system)", () => {
        const projection = computeOperationalProjection({ baseRows, workViews });
        for (const view of projection.views) {
            expect(view.count).toBe(view.rows.length);
        }
    });
});
