import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract";

/**
 * Two corrections to the opportunity drawer VM compose, both measured on a production build against
 * the certification tenant.
 *
 * DUPLICATE TRUTH. `first_paint.data.record_visible` published the SAME OBJECT REFERENCE that the
 * orchestrator also snapshots as `above_fold.record`: 51,787 B and 51,548 B, byte-identical across
 * all 93 shared keys, zero differing keys — 28% of a 178 KB response for one truth. A census across
 * `lib`, `components` and `app` found no consumer: only the producer, the dependency-key union, the
 * contract that declares the KEY, and a demo fixture. Removing the copy took the response to
 * 126,680 B (-28.9%).
 *
 * SERIAL ORG READ. The record layout is a function of the org and the entity type — it does not read
 * the opportunity — yet it waited behind the opportunity select. Hoisting it took `base_subject_ms`
 * from 238 ms to 132 ms.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(join(__dirname, "..", "..", rel), "utf8"));

const FIRST_PAINT = "lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies.ts";
const SHARED = "lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts";

describe("the drawer VM carries the visible record exactly once", () => {
    it("the first-paint producer no longer publishes a second copy", () => {
        expect(read(FIRST_PAINT)).not.toMatch(/data\.record_visible\s*=/);
    });

    /**
     * THE READINESS IS NOT WHAT WAS REMOVED. `record_visible` must still be a declared first-viewport
     * dependency, still satisfied at first paint — the operator's readiness contract is unchanged and
     * only the redundant payload is gone. A guard that let the KEY disappear would be protecting the
     * wrong thing.
     */
    it("record_visible remains a declared first-viewport dependency", () => {
        expect(OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES).toContain("record_visible");
    });

    it("and is still finalized as satisfied from record metadata", () => {
        expect(read(FIRST_PAINT)).toMatch(/finalize\("record_visible",\s*readyState\("record_visible",\s*false,\s*"record_metadata"\)\)/);
    });

    it("above_fold.record remains the one place the visible record is published", () => {
        expect(read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts"))
            .toMatch(/record:\s*stripOpportunityDrawerRecordStaging\(record\)/);
    });

    it("POSITIVE CONTROL — the comment stripper does not hide a real assignment", () => {
        expect(strip("/* data.record_visible = params.record */\nfoo();")).not.toMatch(/data\.record_visible\s*=/);
        expect(strip("/* note */\ndata.record_visible = params.record;")).toMatch(/data\.record_visible\s*=/);
    });
});

describe("org-only reads do not wait for the opportunity", () => {
    const src = read(SHARED);

    it("the record layout fetch is started before the opportunity select", () => {
        const layoutAt = src.indexOf("fetchEffectiveRecordDrawerLayout(");
        const selectAt = src.indexOf('.from("opportunities")');
        expect(layoutAt).toBeGreaterThan(-1);
        expect(selectAt).toBeGreaterThan(-1);
        expect(layoutAt).toBeLessThan(selectAt);
    });

    /**
     * The work-unit lookup genuinely depends on the selected row (`work_unit_id`), so it must STAY
     * after the select. Hoisting it too would read a work unit the opportunity may not name.
     */
    it("the work-unit lookup still follows the select that identifies it", () => {
        const selectAt = src.indexOf('.from("opportunities")');
        const wuAt = src.indexOf('.from("work_units")');
        expect(wuAt).toBeGreaterThan(selectAt);
    });

    it("both are still awaited together before the layout is read", () => {
        expect(src).toMatch(/await Promise\.all\(\[layoutP, wuP\]\)/);
    });
});

describe("every compose leg is measurable", () => {
    /**
     * `visible_entity_ms` was 1,091 ms of an 1,880 ms compose with only ~584 ms attributable, and a
     * parallel batch costs its SLOWEST leg — which an aggregate cannot name. These are the legs that
     * turned "the drawer VM is slow" into "children orientation 764 ms and scheduling 451 ms".
     */
    it("the shell batch reports per-leg timing", () => {
        const src = read("lib/admin/opportunityEntityRecord.ts");
        for (const key of ["shell_children_ms", "shell_persons_ms", "shell_activity_signal_ms", "shell_task_preview_ms", "shell_parallel_ms", "case_employment_ms"]) {
            expect(src, `missing ${key}`).toMatch(new RegExp(key.replace(/_/g, "_")));
        }
    });

    it("the first-paint batch reports per-leg timing", () => {
        const src = read(FIRST_PAINT);
        for (const leg of ["attention", "header_actions", "scheduled_sends", "tour_bookings", "scheduling"]) {
            expect(src, `missing ${leg}`).toMatch(new RegExp(`timedLeg\\("${leg}"`));
        }
    });
});
