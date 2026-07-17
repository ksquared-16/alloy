/**
 * D5 — the Work Unit Settlement Runtime enriches; it never constructs.
 *
 * Governing: the Settlement rules — Settlement may populate reserved geometry and update values; it may
 * never change first-sight geometry, delay operational commit, reconstruct surfaces, replace
 * operational truth, or cause operational reflow. These assertions pin the merge's behavior (pure) and
 * the hook's discipline (source-level) so a regression is caught before a ten-minute browser run.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mergeWorkUnitSettlement, type WorkUnitSettlement } from "../../lib/presentation/runtime/useWorkUnitSettlement";
import type { WorkUnitSurfaceModel } from "../../lib/presentation/runtime/types";

const read = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A minimal committed model with one reserved KPI slot. */
function reservedModel(): WorkUnitSurfaceModel {
    return {
        header: {
            title: "New Leads",
            subtitle: null,
            identityIcon: null,
            identityAccent: null,
            kpis: [
                { slot: 1, label: "Lead count", icon: "chart", accent: null, formattedValue: "", status: "", sourceKey: "enrollment.active_leads", drillHref: null, pending: true },
            ],
        },
        workViews: [],
        queue: { rows: [], totalCount: null, loading: false, error: null, rowConfig: {} as WorkUnitSurfaceModel["queue"]["rowConfig"] },
        activeWorkViewId: "new_leads",
        selectedRecordId: null,
        selectedSubject: { selectedRecordId: null, source: "empty" },
        rightRailActions: [],
        departmentId: null,
        workUnitId: "wu-1",
        ready: true,
        readiness: { shellReady: true, retainedCompositionReady: true, coldCompositionReady: true, interactionReady: true },
    };
}

const item = (formatted: string) => ({
    metric_key: "enrollment.active_leads", label: "Lead count", format: "count",
    value: 150, formatted_value: formatted, window: "last_30d", window_start: "", window_end: "",
    computed_at: "", resolve_mode: "live", sources: [], source_metadata: {} as never,
}) as never;

describe("D5 — Settlement enriches, never constructs", () => {
    it("nothing settled yet → the SAME reserved model reference (no re-render for nothing)", () => {
        const m = reservedModel();
        const out = mergeWorkUnitSettlement(m, { kpiValues: null });
        expect(out).toBe(m);
    });

    it("a resolved value fills the reserved KPI slot: value in, pending cleared", () => {
        const m = reservedModel();
        const out = mergeWorkUnitSettlement(m, { kpiValues: { "enrollment.active_leads": item("150") } as WorkUnitSettlement["kpiValues"] });
        expect(out).not.toBe(m);
        expect(out.header.kpis[0].formattedValue).toBe("150");
        expect(out.header.kpis[0].pending).toBe(false);
    });

    it("settlement touches ONLY the KPI slot — operational truth is untouched", () => {
        const m = reservedModel();
        const out = mergeWorkUnitSettlement(m, { kpiValues: { "enrollment.active_leads": item("150") } as WorkUnitSettlement["kpiValues"] });
        // subject, active lens, queue rows, workViews — the operational world — are the same values.
        expect(out.activeWorkViewId).toBe(m.activeWorkViewId);
        expect(out.selectedSubject).toBe(m.selectedSubject);
        expect(out.queue).toBe(m.queue);
        expect(out.workViews).toBe(m.workViews);
    });

    it("a no-data resolve leaves the slot RESERVED (never flips to a blank value)", () => {
        const m = reservedModel();
        const out = mergeWorkUnitSettlement(m, { kpiValues: { "enrollment.active_leads": item("") } as WorkUnitSettlement["kpiValues"] });
        expect(out).toBe(m);
        expect(out.header.kpis[0].pending).toBe(true);
    });

    it("the hook cannot gate commit or fetch its own geometry — it only reads the committed snapshot", () => {
        const c = code(read("lib/presentation/runtime/useWorkUnitSettlement.ts"));
        // Resolution goes through the deduped OIP warm cache, not a bespoke fetch.
        expect(c).toMatch(/useOperationalAnswers/);
        // No commit gate, no direct row/queue fetch, no timers.
        expect(c).not.toMatch(/setTimeout|setInterval/);
        expect(c).not.toMatch(/queueRowModelFromQueueItem|composeWorkUnitProvisioningAnswer/);
    });

    it("the committed runtime builds the OPERATIONAL model without consulting Settlement", () => {
        const c = code(read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts"));
        // operationalModel is composed purely from the snapshot; settlement is a separate overlay.
        expect(c).toMatch(/const operationalModel = useMemo/);
        expect(c).toMatch(/workUnitSurfaceModelFromSnapshot\(focus\.current\.snapshot\)/);
        expect(c).toMatch(/mergeWorkUnitSettlement\(operationalModel, settlement\)/);
    });
});
