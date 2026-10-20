/**
 * BP V2 Slice 2 — the chain Business Process → Work View → domain projection → queue → record, through
 * the REAL totals evaluator, provisioning answer, surface model and landing builder. Only the cohort
 * loader is replaced (its own behaviour is proven in domainProjectionSubstrate.test.ts), so these prove
 * the wiring: one cohort for counts and rows, no lifecycle path touched, explicit refusals, Enrollment
 * untouched.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const cohortSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/businessProcesses/projections/domainProjectionRegistry", async (orig) => {
    const actual = await orig<typeof import("@/lib/businessProcesses/projections/domainProjectionRegistry")>();
    return { ...actual, loadDomainProjectionCohort: cohortSpy };
});
const laneSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queues/QueueService", async (orig) => {
    const actual = await orig<typeof import("@/lib/queues/QueueService")>();
    return { ...actual, getWorkUnitQueueItems: laneSpy };
});

import { evaluateWorkViewTotalsForGroup } from "@/lib/queues/evaluateWorkViewTotalsForGroup";
import { composeWorkUnitProvisioningAnswer, PROVISIONING_ROW_PAGE_CAP } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { __clearConfigReadCacheForTests } from "@/lib/runtime/provisioning/configReadCache";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import { buildOperatorLifecycleLandingCards } from "@/lib/admin/buildOperatorLifecycleLanding";
import { catalogEntriesFromDepartmentRows } from "@/lib/lifecycle/lifecycleCatalog";
import { domainProjectionHostWorkUnitKey, DOMAIN_PROJECTION_BASE_QUEUE_KEY } from "@/lib/businessProcesses/projections/domainProjectionHost";
import type { DomainProjectionRow } from "@/lib/businessProcesses/projections/domainProjectionTypes";

const ORG = "11111111-1111-4111-8111-000000000001";
const DEPT = "dddddddd-0000-4000-8000-00000000000d";
const HOST_KEY = domainProjectionHostWorkUnitKey(DEPT);
const HOST = { id: "wu-host", key: HOST_KEY, name: "Assignments", org_id: ORG, department_id: DEPT, queue_definition: {}, metadata: {}, is_active: true };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const projectionMetadata = {
    lifecycle_builder_v1: {
        version: 1,
        active_process_id: "p",
        processes: [{
            id: "p", key: "assignments", name: "Assignments", is_active: true, stages: [],
            process_model_v1: { kind: "domain_projection", domain: "assignments" },
            work_views_v1: [
                { id: "all", label: "All Assignments", projection_key: "current_assignments", display_order: 1 },
                { id: "dup", label: "Same projection again", projection_key: "current_assignments", display_order: 2 },
                { id: "bad", label: "Unregistered", projection_key: "nope", display_order: 3 },
            ],
        }],
    },
};

function cohortOf(n: number, truncated = false) {
    const rows: DomainProjectionRow[] = Array.from({ length: n }, (_, i) => ({
        subject: { type: i % 3 === 0 ? "person" : "child", id: uuid(1000 + i) },
        label: `Subject ${String(i).padStart(4, "0")}`,
        source: { kind: "schedule_assignment", id: uuid(9000 + i), count: 1, statusLabel: "Active primary" },
        siteLocationId: null,
    }));
    return { status: "ok" as const, domain: "assignments" as const, projectionKey: "current_assignments", rows, total: truncated ? null : n, truncated };
}

/** Permissive recording stub: any chain; work_units / departments answer by table. */
function stub() {
    const touched: string[] = [];
    const writes: string[] = [];
    const client = {
        touched,
        writes,
        from(table: string) {
            touched.push(table);
            const eqs: Array<[string, unknown]> = [];
            const done = () => Promise.resolve({ data: table === "work_units" ? [HOST] : [], error: null });
            const b: Record<string, unknown> = new Proxy({}, {
                get(_t, prop: string) {
                    if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej);
                    if (prop === "maybeSingle" || prop === "single") {
                        return async () => {
                            if (table === "work_units") {
                                const key = eqs.find(([c]) => c === "key")?.[1];
                                return { data: key === HOST_KEY ? HOST : null, error: null };
                            }
                            if (table === "departments") return { data: { id: DEPT, metadata: projectionMetadata }, error: null };
                            return { data: null, error: null };
                        };
                    }
                    if (["insert", "update", "upsert", "delete"].includes(prop)) return () => (writes.push(`${prop}:${table}`), b);
                    if (prop === "eq") return (c: string, v: unknown) => (eqs.push([c, v]), b);
                    return () => b;
                },
            });
            return b;
        },
    };
    return client as unknown as import("@supabase/supabase-js").SupabaseClient & { touched: string[]; writes: string[] };
}

const SCOPE = { siteScope: "restricted" as const, allowedSiteLocationIds: ["site-a"] };
const spans = () => ({ views: 0, child_views: 0, lane_views: 0, unknown_views: 0, population: 0 } as never);

beforeEach(() => {
    cohortSpy.mockReset();
    laneSpy.mockReset();
    __clearConfigReadCacheForTests();
});

describe("counts — the projection cohort, and nothing else", () => {
    it("each view counts its cohort's total; two views on one projection read it ONCE; no lane path", async () => {
        cohortSpy.mockResolvedValue(cohortOf(1234));
        const out = await evaluateWorkViewTotalsForGroup({
            supabase: stub(), orgId: ORG,
            group: { workUnitId: "wu-host", queueKey: DOMAIN_PROJECTION_BASE_QUEUE_KEY, viewIds: new Set(["all", "dup"]) },
            prerequisite: { accessible: true, departmentMetadata: projectionMetadata },
            recordScopeConstraints: null, recordScopeImpossible: false, viewerDisplayTimeZone: null as never, spans: spans(),
            projection: { userId: "u1", scope: SCOPE },
        });
        expect(out.map((t) => [t.workViewId, t.count, t.known])).toEqual([["all", 1234, true], ["dup", 1234, true]]);
        expect(cohortSpy).toHaveBeenCalledTimes(1);
        expect(cohortSpy.mock.calls[0]![1]).toMatchObject({ domain: "assignments", projectionKey: "current_assignments", orgId: ORG, userId: "u1", scope: SCOPE });
        expect(laneSpy).not.toHaveBeenCalled();
    });

    it("unregistered, refused, truncated or unscoped → UNKNOWN, never a number", async () => {
        cohortSpy.mockImplementation(async (_s: unknown, a: { projectionKey: string }) =>
            a.projectionKey === "nope" ? { status: "refused", code: "projection_unsupported", message: "x" } : cohortOf(5, true));
        const base = {
            supabase: stub(), orgId: ORG,
            group: { workUnitId: "wu-host", queueKey: DOMAIN_PROJECTION_BASE_QUEUE_KEY, viewIds: new Set(["all", "bad", "ghost"]) },
            prerequisite: { accessible: true, departmentMetadata: projectionMetadata },
            recordScopeConstraints: null, recordScopeImpossible: false, viewerDisplayTimeZone: null as never, spans: spans(),
        };
        const out = await evaluateWorkViewTotalsForGroup({ ...base, projection: { userId: "u1", scope: SCOPE } });
        expect(out.map((t) => [t.workViewId, t.count, t.known])).toEqual([["all", null, false], ["bad", null, false], ["ghost", null, false]]);
        const unscoped = await evaluateWorkViewTotalsForGroup(base);
        expect(unscoped.every((t) => t.count === null && !t.known)).toBe(true);
        expect(laneSpy).not.toHaveBeenCalled();
    });
});

describe("rows — the provisioning answer serves the SAME cohort, one bounded page", () => {
    const req = (over: Record<string, unknown> = {}) => ({
        supabase: stub(), orgId: ORG, workUnitSlug: HOST_KEY.replace(/_/g, "-"), requestedWorkViewId: "all",
        currentUserId: "u1", projectionScope: SCOPE, ...over,
    }) as Parameters<typeof composeWorkUnitProvisioningAnswer>[0];

    it("a projection terminal: page of the cohort, cohort total, durable-subject row ids, no opportunity read", async () => {
        cohortSpy.mockResolvedValue(cohortOf(1234));
        const supabase = stub();
        const a = await composeWorkUnitProvisioningAnswer(req({ supabase }));
        expect(a.terminal).toBe("projection");
        if (a.terminal !== "projection") return;
        expect(a.projection).toEqual({ domain: "assignments", projectionKey: "current_assignments", total: 1234, truncated: false });
        expect(a.rows).toHaveLength(PROVISIONING_ROW_PAGE_CAP);
        expect(a.rows[0]!.id).toBe(`person:${uuid(1000)}`);
        expect(a.rows[1]!.context?.drawer_open).toEqual({ entity_type: "customer_members", entity_id: uuid(1001) });
        expect(a.selectedRowId).toBeNull();
        expect(a.businessProcess.key).toBe("assignments");
        expect(supabase.touched).not.toContain("opportunities");
        expect(supabase.touched).not.toContain("process_instances");
        expect(supabase.writes).toEqual([]);
        expect(laneSpy).not.toHaveBeenCalled();
        expect(cohortSpy.mock.calls[0]![1]).toMatchObject({ scope: SCOPE, userId: "u1" });
    });

    it("a named row in the page is selected; one outside it is not invented", async () => {
        cohortSpy.mockResolvedValue(cohortOf(3));
        const hit = await composeWorkUnitProvisioningAnswer(req({ requestedSubjectId: `child:${uuid(1001)}` }));
        expect(hit.terminal === "projection" && hit.selectedRowId).toBe(`child:${uuid(1001)}`);
        cohortSpy.mockResolvedValue(cohortOf(3));
        __clearConfigReadCacheForTests();
        const miss = await composeWorkUnitProvisioningAnswer(req({ requestedSubjectId: `child:${uuid(4242)}` }));
        expect(miss.terminal === "projection" && miss.selectedRowId).toBeNull();
    });

    it("refusals are explicit errors that keep the way out — never Enrollment rows, never empty", async () => {
        cohortSpy.mockResolvedValue({ status: "refused", code: "projection_forbidden", message: "no fin.read" });
        const forbidden = await composeWorkUnitProvisioningAnswer(req());
        expect(forbidden).toMatchObject({ terminal: "error", code: "projection_forbidden" });
        expect(forbidden.terminal === "error" && forbidden.navigationFrame?.lensSet.map((l) => l.id)).toEqual(["all", "dup", "bad"]);
        __clearConfigReadCacheForTests();
        const unscoped = await composeWorkUnitProvisioningAnswer(req({ projectionScope: null }));
        expect(unscoped).toMatchObject({ terminal: "error", code: "projection_unavailable" });
    });

    it("the surface model renders those rows as durable subjects with no default subject", async () => {
        cohortSpy.mockResolvedValue(cohortOf(4));
        const a = await composeWorkUnitProvisioningAnswer(req());
        const model = workUnitSurfaceModelFromSnapshot(a);
        expect(model.queue.rows.map((r) => [r.entityType, r.entityId])).toEqual([
            ["durable_subject", `person:${uuid(1000)}`],
            ["durable_subject", `child:${uuid(1001)}`],
            ["durable_subject", `child:${uuid(1002)}`],
            ["durable_subject", `person:${uuid(1003)}`],
        ]);
        expect(model.selectedRecordId).toBeNull();
        expect(model.queue.error).toBeNull();
        expect(model.workViews.find((w) => w.isActive)?.id).toBe("all");
    });
});

describe("landing — the projection tile lists its own views on its own host", () => {
    const rows = [{ id: DEPT, key: "assignments", name: "Assignments", is_active: true, metadata: projectionMetadata }];
    const catalog = () =>
        catalogEntriesFromDepartmentRows(rows, {
            workspaceById: new Map([[DEPT, { name: "Assignments" }]]),
            wuCountByDept: new Map(),
            departmentIdAllowed: () => true,
        });

    it("with a host: views become tile rows on the projection lane, and the tile opens", () => {
        const [card] = buildOperatorLifecycleLandingCards({ catalogEntries: catalog(), departments: rows, workUnits: [HOST] });
        expect(card!.workQueues.map((q) => [q.work_view_id, q.host_work_unit_id, q.base_queue_key])).toEqual([
            ["all", "wu-host", DOMAIN_PROJECTION_BASE_QUEUE_KEY],
            ["dup", "wu-host", DOMAIN_PROJECTION_BASE_QUEUE_KEY],
            ["bad", "wu-host", DOMAIN_PROJECTION_BASE_QUEUE_KEY],
        ]);
        expect(card!.entryHref).toBe("/workspace/work-unit/all-assignments");
        expect(card!.unavailableReason).toBeNull();
        expect(JSON.stringify(card)).not.toMatch(/new[-_]leads|enrollment_pipeline/);
    });

    it("without a host (not yet published with views): the honest unavailable state", () => {
        const [card] = buildOperatorLifecycleLandingCards({ catalogEntries: catalog(), departments: rows, workUnits: [] });
        expect(card!.entryHref).toBeNull();
        expect(card!.workQueues).toEqual([]);
    });
});
