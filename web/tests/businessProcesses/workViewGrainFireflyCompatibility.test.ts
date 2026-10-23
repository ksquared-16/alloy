/**
 * BP V2 D7 — case 10: Firefly's Enrollment configuration stays publishable. READ-ONLY.
 *
 * Firefly is never drafted, validated or published by this slice. Its configuration as the runtime serves it
 * today was read by census `gar_8df61ae8b70aeb` (certification/business-processes-v2/d6d7/
 * work-view-grain-config-census.sql — stage keys, grains and Work View stage conditions only), and QA Shared's
 * with it. Each tenant's stages and Work Views are run through the real publish validator, as is the committed
 * Firefly revision-38 fixture.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";

type Row = Record<string, unknown>;
const census = JSON.parse(
    readFileSync(resolve(__dirname, "../../../certification/business-processes-v2/d6d7/work-view-grain-config-census.sql.results.json"), "utf8"),
) as { results: { questions: Record<string, { rows: unknown[] }> } };
const rowsOf = (q: string): Row[] => {
    const rows = census.results.questions[q]!.rows;
    return (Array.isArray(rows[0]) ? rows[0] : rows) as Row[];
};

/** A payload carrying exactly what the census read: each stage's two grain declarations, each view's stage conditions. */
function tenantPayload(org: "firefly" | "qa_shared") {
    const stages = rowsOf("wg_01_stages").filter((s) => s.org === org);
    const views = rowsOf("wg_02_work_views").filter((v) => v.org === org);
    return {
        version: 1,
        active_process_id: "enrollment",
        processes: [{
            id: "enrollment", key: "enrollment", name: "Enrollment", is_active: true, sort_order: 0, primary_entity: "opportunity",
            stages: stages.map((s, i) => ({
                id: `s-${s.stage_key}`, key: s.stage_key, label: s.stage_label, sort_order: i, is_active: s.stage_active !== false,
                ...(s.grain ? { grain: s.grain } : {}),
                ...(s.segment ? { stage_operating_plan_v1: { journey_segment: s.segment } } : {}),
            })),
            work_views_v1: views.map((v, i) => ({
                id: v.view_id, label: v.view_label, display_order: i, filters_v1: v.stage_filters ?? [],
                ...(v.row_grain_v1 ? { row_grain_v1: v.row_grain_v1 } : {}),
            })),
        }],
    };
}
const grainFindings = (payload: unknown) => {
    const r = validateBusinessProcessForPublish(payload);
    const pick = (list: { code: string; detail?: unknown }[]) =>
        list.filter((d) => d.code.startsWith("work_view_grain_")).map((d) => ({ code: d.code, ...(d.detail as Row) }));
    return { errors: pick(r.errors), warnings: pick(r.warnings) };
};

describe("D7 case 10 — Firefly (read-only) and QA Shared, as served today", () => {
    it("the census read Firefly's real views (not a vacuous pass)", () => {
        const views = rowsOf("wg_02_work_views").filter((v) => v.org === "firefly");
        expect(views.length).toBeGreaterThanOrEqual(8);
        expect(views.filter((v) => v.row_grain_v1).length).toBeGreaterThanOrEqual(5);
    });

    it("Firefly: no view is refused; its Decision view (decision + offered, family) is reported as mixed", () => {
        const f = grainFindings(tenantPayload("firefly"));
        expect(f.errors).toEqual([]);
        expect(f.warnings.map((w) => [w.work_view_id, w.work_view_label, (w.incompatible_stages as Row[]).map((s) => s.stage_key)])).toEqual([
            ["new_work_view_8", "Decision", ["offered"]],
        ]);
    });

    it("QA Shared: nothing refused, nothing mixed", () => {
        expect(grainFindings(tenantPayload("qa_shared"))).toEqual({ errors: [], warnings: [] });
    });

    it("Firefly's committed revision-38 fixture: nothing refused", () => {
        const fixture = JSON.parse(readFileSync(resolve(__dirname, "../enrollment/__fixtures_published_rev38.json"), "utf8"));
        expect(grainFindings(fixture).errors).toEqual([]);
    });
});
