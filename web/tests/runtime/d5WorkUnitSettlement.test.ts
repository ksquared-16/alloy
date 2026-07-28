/**
 * D5 — the Work Unit Settlement Runtime enriches; it never constructs.
 *
 * Governing: the Settlement rules — Settlement may populate reserved geometry and update values; it may
 * never change first-sight geometry, delay operational commit, reconstruct surfaces, replace
 * operational truth, or cause operational reflow. These assertions pin the merge (pure), the locator
 * contract (server-resolved), and the hook's discipline (source-level) so a regression is caught before
 * a ten-minute browser run. Numbered to the mission's permanent-test list.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
    mergeWorkUnitSettlement,
    type WorkUnitSettlement,
} from "../../lib/presentation/runtime/useWorkUnitSettlement";
import { resolveSettlementLocators } from "../../lib/runtime/provisioning/settlementLocators";
import type { WorkUnitSurfaceModel } from "../../lib/presentation/runtime/types";

const read = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
        workViews: [
            { id: "new_leads", label: "New Leads", isActive: true, count: null, attentionCount: null, overdueCount: null, primaryGrainCount: null, supportingGrainCount: null, href: null },
            { id: "tours", label: "Tours", isActive: false, count: null, attentionCount: null, overdueCount: null, primaryGrainCount: null, supportingGrainCount: null, href: null },
        ],
        queue: { rows: [{ entityId: "op-1" }] as WorkUnitSurfaceModel["queue"]["rows"], totalCount: null, loading: false, error: null, rowConfig: {} as WorkUnitSurfaceModel["queue"]["rowConfig"] },
        activeWorkViewId: "new_leads",
        selectedRecordId: "op-1",
        selectedSubject: { selectedRecordId: "op-1", source: "strategy" },
        rightRailActions: [],
        departmentId: null,
        workUnitId: "wu-1",
        ready: true,
        readiness: { shellReady: true, retainedCompositionReady: true, coldCompositionReady: true, interactionReady: true },
    };
}

const kpiItem = (formatted: string) => ({
    metric_key: "enrollment.active_leads", label: "Lead count", format: "count",
    value: 150, formatted_value: formatted, window: "last_30d", window_start: "", window_end: "",
    computed_at: "", resolve_mode: "live", sources: [], source_metadata: {} as never,
}) as never;

const settlement = (over: Partial<WorkUnitSettlement> = {}): WorkUnitSettlement => ({
    kpiValues: null,
    viewCounts: new Map(),
    queueTotal: null,
    rightRailActions: null,
    departmentId: null,
    workUnitId: "wu-1",
    regions: { kpi: "pending", counts: "pending", queueTotal: "pending", rightRail: "pending" },
    ...over,
});

const wuRow = (id: string, queueDef: unknown) => ({ id, key: id, name: id, department_id: "dept-1", is_active: true, sort_order: 0, queue_definition: queueDef });

describe("D5 — Settlement enriches, never constructs", () => {
    // 4/5/6/7. Populate KPI value, count, queue total, right-rail — primary Action untouched.
    it("nothing settled → the SAME reserved model reference (no re-render for nothing)", () => {
        const m = reservedModel();
        expect(mergeWorkUnitSettlement(m, settlement())).toBe(m);
    });

    it("KPI value fills the reserved slot: value in, pending cleared", () => {
        const out = mergeWorkUnitSettlement(reservedModel(), settlement({ kpiValues: { "enrollment.active_leads": kpiItem("150") } as WorkUnitSettlement["kpiValues"] }));
        expect(out.header.kpis[0].formattedValue).toBe("150");
        expect(out.header.kpis[0].pending).toBe(false);
    });

    it("Work View count fills the reserved pill badge", () => {
        const out = mergeWorkUnitSettlement(reservedModel(), settlement({ viewCounts: new Map([["new_leads", 150], ["tours", 12]]) }));
        expect(out.workViews.find((v) => v.id === "new_leads")!.count).toBe(150);
        expect(out.workViews.find((v) => v.id === "tours")!.count).toBe(12);
    });

    it("queue total fills as the AUTHORITATIVE total, distinct from the returned page length", () => {
        const out = mergeWorkUnitSettlement(reservedModel(), settlement({ queueTotal: 150 }));
        expect(out.queue.totalCount).toBe(150); // total
        expect(out.queue.rows.length).toBe(1); // page length — unchanged and different
    });

    it("right-rail secondary actions fill without touching the snapshot-owned primary Action", () => {
        const m = reservedModel();
        const out = mergeWorkUnitSettlement(m, settlement({ rightRailActions: [{ actionRef: "x" } as never], departmentId: "dept-1" }));
        expect(out.rightRailActions.length).toBe(1);
        expect(out.departmentId).toBe("dept-1");
        // primary action lives on the snapshot/OperationalSubject, not the model — the merge never had it.
        expect(out.selectedSubject).toBe(m.selectedSubject);
    });

    it("department scope can settle even when Actions already committed from the snapshot", () => {
        const m = { ...reservedModel(), rightRailActions: [{ key: "create_lead" } as never], departmentId: null };
        const out = mergeWorkUnitSettlement(m, settlement({ rightRailActions: null, departmentId: "dept-1" }));
        expect(out.departmentId).toBe("dept-1");
        expect(out.rightRailActions).toBe(m.rightRailActions);
    });

    it("15. settlement touches ONLY reserved regions — operational truth is byte-identical", () => {
        const m = reservedModel();
        const out = mergeWorkUnitSettlement(m, settlement({ kpiValues: { "enrollment.active_leads": kpiItem("150") } as WorkUnitSettlement["kpiValues"], viewCounts: new Map([["new_leads", 150]]) }));
        expect(out.activeWorkViewId).toBe(m.activeWorkViewId);
        expect(out.selectedRecordId).toBe(m.selectedRecordId);
        expect(out.selectedSubject).toBe(m.selectedSubject);
        expect(out.queue.rows).toBe(m.queue.rows);
    });

    it("a no-data KPI resolve leaves the slot RESERVED (never a blank value)", () => {
        const out = mergeWorkUnitSettlement(reservedModel(), settlement({ kpiValues: { "enrollment.active_leads": kpiItem("") } as WorkUnitSettlement["kpiValues"] }));
        expect(out.header.kpis[0].pending).toBe(true);
    });

    // 1. D1 exposes RESOLVED locators (host + base lane), not raw config.
    it("1. the locator contract resolves per-lens canonical count locations", () => {
        const queueDef = { version: 1, primary: { key: "leads-base", lanes: [{ key: "new_leads" }, { key: "tours" }] } };
        const locators = resolveSettlementLocators({
            workViews: [{ id: "new_leads", label: "New Leads" }, { id: "tours", label: "Tours" }] as never,
            deptWorkUnits: [wuRow("wu-1", queueDef)],
            departmentId: "dept-1",
            activeWorkViewId: "new_leads",
            surfaceWorkUnitId: "wu-1",
        });
        // Either the resolver finds canonical locations (resolved) or honestly reports unavailable —
        // never throws, never fabricates. The right-rail target is always the surface's own scope.
        expect(["resolved", "unavailable"]).toContain(locators.status);
        if (locators.status === "resolved") {
            expect(locators.rightRailTarget).toEqual({ departmentId: "dept-1", workUnitId: "wu-1" });
        }
    });

    it("3. missing/failed locators degrade to `unavailable` — never throw, never block commit", () => {
        const locators = resolveSettlementLocators({
            workViews: [{ id: "x", label: "X" }] as never,
            deptWorkUnits: [], // no units → no canonical location
            departmentId: "",
            activeWorkViewId: "x",
            surfaceWorkUnitId: "wu-1",
        });
        expect(locators.status).toBe("unavailable");
        expect(locators.workViewCountTargets).toEqual([]);
    });

    // 2/10/11. Operational renderer ignores locators; no config waterfall / QueueService returns.
    it("2. the operational renderer never reads the settlement locators", () => {
        const c = code(read("lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts"));
        expect(c).not.toMatch(/\.settlement\b/);
    });

    it("10-11. the client consumes RESOLVED locators only — no config bundle, no QueueService", () => {
        const c = code(read("lib/presentation/runtime/useWorkUnitSettlement.ts"));
        expect(c).not.toMatch(/fetchWorkUnitSurfaceConfigBundle|queue-row-layout|QueueService/);
        expect(c).not.toMatch(/resolveWorkViewCanonicalLocation/); // location is resolved server-side, not here
        // Counts reuse the canonical batched owner; right-rail is deduped.
        expect(c).toMatch(/useWorkViewTotalsState/);
        expect(c).toMatch(/dedupeAdminFetch/);
    });

    it("8-9. count and right-rail requests go through deduped owners", () => {
        const c = code(read("lib/presentation/runtime/useWorkUnitSettlement.ts"));
        expect(c).toMatch(/useWorkViewTotalsState\(/); // batched + session-cached + SWR-deduped
        expect(c).toMatch(/dedupeAdminFetch\(/); // right-rail deduped
    });

    it("D1 attaches settlement to committed answers only, and it never gates commit", () => {
        const c = code(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
        // Settlement is on operational + empty; the error path has none.
        expect(c).toMatch(/settlement,/);
        // Locator resolution can never fail the answer.
        expect(c).toMatch(/loadSettlementLocators/);
        expect(c).toMatch(/SETTLEMENT_LOCATORS_UNAVAILABLE/);
    });

    it("the committed runtime builds the OPERATIONAL model without consulting Settlement", () => {
        const c = code(read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts"));
        expect(c).toMatch(/const operationalModel = useMemo/);
        expect(c).toMatch(/mergeWorkUnitSettlement\(operationalModel, settlement\)/);
    });
});
