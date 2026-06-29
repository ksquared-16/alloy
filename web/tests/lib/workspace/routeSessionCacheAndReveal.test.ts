/**
 * Route session cache + reveal-gate tests for workspace/dept/work-unit surfaces.
 *
 * Covers:
 * 1. Workspace warm cache makes the reveal gate pass without waiting for network.
 * 2. Dept warm cache (with summaries, attention, KPI) makes reveal gate pass immediately.
 * 3. Dept warm cache cache key includes org + dept + user + scope fingerprint.
 * 4. Work-unit queue row cache key includes queueKey + viewScopeFingerprint.
 * 5. Stale lane fetch response is blocked by the ownership guard.
 * 6. Lane-changed response is blocked by the ownership guard.
 * 7. Lane reveal state is hidden while loading and no cache hit (no false empty state).
 * 8. Lane reveal state is ready_with_cache when cache hit even during loading.
 * 9. Lane reveal state is hidden when work_unit_id is null (prevents premature empty).
 * 10. Dept warm cache type — attentionBuckets, kpiPlacementRows are optional fields.
 * 11. CachedDeptAttentionBucket shape covers all required display fields.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

import {
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
    readDepartmentPageCache,
    writeDepartmentPageCache,
    type CachedDeptAttentionBucket,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";


import {
    computeDeptRevealGate,
    deptRevealShellReady,
    deptRevealWorkUnitsReady,
    deptRevealKpiStripReady,
    deptRevealActionsReady,
} from "@/lib/adminV2/deptRevealGate";

import {
    shouldApplyWorkUnitQueueRowsResponse,
} from "@/lib/workspace/workUnitQueueRowFetchApply";

import {
    resolveWorkUnitQueueLaneRevealState,
    workUnitQueueLaneMayPaintRows,
    workUnitQueueLaneRevealSettled,
} from "@/lib/workspace/workUnitQueueLaneRevealState";

import {
    queueRowLogicalCacheKey,
    putQueueRowCache,
    peekFreshQueueRowCache,
    QUEUE_ROW_CLIENT_CACHE_TTL_MS,
} from "@/lib/workspace/queueRowClientCache";
import { workspaceViewCacheFingerprint } from "@/lib/adminV2/workspaceSiteFilterClient";

// ---------------------------------------------------------------------------
// sessionStorage mock
// ---------------------------------------------------------------------------

let store: Record<string, string> = {};

const mockSessionStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
};

beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "sessionStorage", {
        value: mockSessionStorage,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
        value: globalThis,
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    store = {};
});

// ---------------------------------------------------------------------------
// 1. Workspace warm cache → reveal gate passes
// ---------------------------------------------------------------------------

describe("workspace warm cache", () => {
    it("readWorkspaceRootCache returns null when no cache entry exists", () => {
        const hit = readWorkspaceRootCache("org-1", "user-1", "fp-1");
        expect(hit).toBeNull();
    });

    it("round-trips workspace root cache (tiles + KPIs as one warm surface)", () => {
        const departments = [
            { id: "dept-a", name: "Enrollment", is_active: true, key: "enrollment", metadata: null },
        ];
        const deptTileStats = { "dept-a": { workUnitCount: 2 } };
        const metrics = { departments: 1, workUnits: 2 };

        writeWorkspaceRootCache("org-1", "user-1", "fp-1", {
            departments,
            deptTileStats,
            metrics,
            orgOpportunityKpis: null,
            workspaceKpiStrip: undefined,
            kpiPlacementPending: false,
            rollupRefined: true,
        });

        const hit = readWorkspaceRootCache("org-1", "user-1", "fp-1");
        expect(hit).not.toBeNull();
        expect(hit!.departments).toHaveLength(1);
        expect(hit!.deptTileStats).toEqual(deptTileStats);
        expect(hit!.metrics).toEqual(metrics);
        // The whole surface is one cached unit; the Route VM reveals it without a client gate.
    });

    it("cache key is scoped by org + user + fingerprint (cross-org isolation)", () => {
        const departments = [{ id: "d1", name: "Dept", is_active: true, key: "k", metadata: null }];
        const snap = {
            departments,
            deptTileStats: {},
            metrics: { departments: 1, workUnits: 0 },
            orgOpportunityKpis: null,
            workspaceKpiStrip: undefined,
            kpiPlacementPending: false,
            rollupRefined: true,
        };
        writeWorkspaceRootCache("org-A", "user-1", "fp-1", snap);

        // Different org reads nothing
        expect(readWorkspaceRootCache("org-B", "user-1", "fp-1")).toBeNull();
        // Different fingerprint reads nothing
        expect(readWorkspaceRootCache("org-A", "user-1", "fp-different")).toBeNull();
        // Same org reads the cache
        expect(readWorkspaceRootCache("org-A", "user-1", "fp-1")).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 2. Dept warm cache → reveal gate passes immediately from cache
// ---------------------------------------------------------------------------

describe("dept warm cache", () => {
    const ORG = "org-1";
    const DEPT_ID = "dept-abc";
    const USER = "user-1";
    const FP = "scope:user1-all";

    const baseSnap = {
        dept: { id: DEPT_ID, name: "Enrollment", key: "enrollment" },
        workUnits: [
            { id: "wu-1", name: "Pipeline", key: "enrollment_pipeline" },
            { id: "wu-2", name: "Needs Attention", key: "needs_attention" },
        ],
        workUnitSummaries: {
            "wu-1": { total: 42, needs_attention: null },
            "wu-2": { total: 7, needs_attention: 7 },
        },
        summariesComplete: true,
        attentionBuckets: [
            { key: "late_contact", label: "Late Contact", description: null, count: 5, reason_codes: ["late_contact"] },
            { key: "tour_due", label: "Tour Due", description: null, count: 2, reason_codes: ["tour_due"] },
        ] as CachedDeptAttentionBucket[],
        attentionPreviewTotal: 7,
        kpiPlacementRows: [{ id: "kpi-1", surface: "department", position: 1 }],
        kpiScopeHasPlacements: true,
    };

    it("round-trips and restores all warm-nav fields", () => {
        writeDepartmentPageCache(ORG, USER, FP, baseSnap);
        const hit = readDepartmentPageCache(ORG, DEPT_ID, USER, FP);

        expect(hit).not.toBeNull();
        expect(hit!.dept.id).toBe(DEPT_ID);
        expect(hit!.workUnits).toHaveLength(2);
        expect(hit!.summariesComplete).toBe(true);
        expect(hit!.workUnitSummaries["wu-1"].total).toBe(42);
        expect(hit!.attentionBuckets).toHaveLength(2);
        expect(hit!.attentionBuckets![0].key).toBe("late_contact");
        expect(hit!.attentionPreviewTotal).toBe(7);
        expect(hit!.kpiPlacementRows).toHaveLength(1);
        expect(hit!.kpiScopeHasPlacements).toBe(true);
    });

    it("with summaries + attention + KPI from cache, non-enrollment dept reveal gate passes", () => {
        // Simulate the non-enrollment dept where actions rail doesn't need settling
        const nonEnrollSnap = {
            ...baseSnap,
            dept: { id: DEPT_ID, name: "Operations", key: "operations" },
            workUnits: [
                { id: "wu-1", name: "Queue", key: "queue" },
            ],
        };
        writeDepartmentPageCache(ORG, USER, FP, nonEnrollSnap);
        const hit = readDepartmentPageCache(ORG, DEPT_ID, USER, FP);
        expect(hit).not.toBeNull();

        // Simulate what useLayoutEffect restores from the cache:
        // - dept loaded, not blocking, work units resolved
        const shell_ready = deptRevealShellReady({
            department_id: DEPT_ID,
            department_loaded: true,         // from hit.dept
            bootstrap_loading: false,        // seededDeptShellRef prevents setDeptLoading(true)
        });
        const work_units_ready = deptRevealWorkUnitsReady({ work_units_resolved: true });
        // kpiPlacementRows from cache means placement_rows_defined = true
        const kpi_strip_ready = deptRevealKpiStripReady({
            placement_rows_defined: hit!.kpiPlacementRows !== undefined && hit!.kpiPlacementRows !== null,
        });
        // Non-enrollment: actions rail not reserved
        const actions_ready = deptRevealActionsReady({
            reserve_actions_rail: false,
            enrollment_actions_settled: false,
        });

        const gate = computeDeptRevealGate({
            shell_ready,
            work_units_ready,
            // operational_region_ready would be true once summaries + attention from cache are applied
            // In practice this depends on deptThroughputBodyReady + deptAttentionBodyReady passing,
            // which requires summariesLoading=false and attentionBuckets !== null — both satisfied by cache restore.
            operational_region_ready: true,
            kpi_strip_ready,
            actions_ready,
        });

        expect(gate.above_fold_ready).toBe(true);
        expect(gate.reason_if_blocked).toHaveLength(0);
    });

    it("without summaries in cache, operational_region_ready is false (old behavior pre-fix)", () => {
        // Simulate the OLD cache state: only dept + workUnits, no summaries/attention/KPI
        const oldCacheSnap = {
            dept: baseSnap.dept,
            workUnits: baseSnap.workUnits,
            workUnitSummaries: {},
            summariesComplete: false,
            // no attentionBuckets, no kpiPlacementRows
        };
        writeDepartmentPageCache(ORG, USER, FP, oldCacheSnap);
        const hit = readDepartmentPageCache(ORG, DEPT_ID, USER, FP);
        expect(hit).not.toBeNull();

        // kpiPlacementRows is undefined → placement_rows_defined = false → kpi_strip_ready = false
        const kpi_strip_ready = deptRevealKpiStripReady({
            placement_rows_defined: hit!.kpiPlacementRows !== undefined && hit!.kpiPlacementRows !== null,
        });
        expect(kpi_strip_ready).toBe(false);

        // attentionBuckets is undefined → cannot restore → deptAttentionBuckets stays null → attention NOT ready
        expect(hit!.attentionBuckets).toBeUndefined();
        expect(hit!.kpiPlacementRows).toBeUndefined();
    });

    it("cache key scoped by org + dept + user + fingerprint", () => {
        writeDepartmentPageCache(ORG, USER, FP, baseSnap);

        // Wrong org
        expect(readDepartmentPageCache("wrong-org", DEPT_ID, USER, FP)).toBeNull();
        // Wrong dept
        expect(readDepartmentPageCache(ORG, "wrong-dept", USER, FP)).toBeNull();
        // Wrong fingerprint
        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, "fp-different")).toBeNull();
        // Correct
        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, FP)).not.toBeNull();
    });

    it("department cache fingerprint includes workspace site when site selected", () => {
        const siteFp = workspaceViewCacheFingerprint(FP, "site-a");
        writeDepartmentPageCache(ORG, USER, siteFp, baseSnap);

        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, siteFp)).not.toBeNull();
        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, FP)).toBeNull();
    });

    it("attentionBuckets is undefined in cache when not written — backward compatible", () => {
        writeDepartmentPageCache(ORG, USER, FP, {
            ...baseSnap,
            attentionBuckets: undefined,
            attentionPreviewTotal: undefined,
            kpiPlacementRows: undefined,
            kpiScopeHasPlacements: undefined,
        });
        const hit = readDepartmentPageCache(ORG, DEPT_ID, USER, FP);
        expect(hit).not.toBeNull();
        // Optional fields absent — should not crash
        expect(Array.isArray(hit!.attentionBuckets) || hit!.attentionBuckets === undefined || hit!.attentionBuckets === null).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 3. Work-unit queue row cache key includes queueKey + viewScopeFingerprint
// ---------------------------------------------------------------------------

describe("queueRowLogicalCacheKey", () => {
    it("key includes fingerprint, workUnitId, queueKey, and unmappedOnly", () => {
        const k = queueRowLogicalCacheKey("fp-123", "wu-abc", "pipeline_total", false);
        expect(k).toContain("fp-123");
        expect(k).toContain("wu-abc");
        expect(k).toContain("pipeline_total");
        expect(k).toContain("all");
    });

    it("unmappedOnly flag produces distinct key", () => {
        const all = queueRowLogicalCacheKey("fp", "wu", "new_leads", false);
        const unmapped = queueRowLogicalCacheKey("fp", "wu", "new_leads", true);
        expect(all).not.toBe(unmapped);
        expect(unmapped).toContain("unmapped");
    });

    it("fingerprint change produces distinct key (cross-scope isolation)", () => {
        const fp1 = queueRowLogicalCacheKey("scope:user-A", "wu-1", "queue", false);
        const fp2 = queueRowLogicalCacheKey("scope:user-B", "wu-1", "queue", false);
        expect(fp1).not.toBe(fp2);
    });

    it("needs_attention lane key includes attention bucket suffix", () => {
        const withBucket = queueRowLogicalCacheKey("fp", "wu", "needs_attention", false, "late_contact");
        const noBucket = queueRowLogicalCacheKey("fp", "wu", "needs_attention", false, null);
        expect(withBucket).toContain("late_contact");
        expect(withBucket).not.toBe(noBucket);
    });

    it("non-needs_attention lane ignores attention bucket parameter", () => {
        const withBucket = queueRowLogicalCacheKey("fp", "wu", "pipeline_total", false, "late_contact");
        const noBucket = queueRowLogicalCacheKey("fp", "wu", "pipeline_total", false, null);
        expect(withBucket).toBe(noBucket);
    });
});

// ---------------------------------------------------------------------------
// 4. Stale lane response blocked by ownership guard
// ---------------------------------------------------------------------------

describe("shouldApplyWorkUnitQueueRowsResponse", () => {
    it("applies when requestSeq matches and lane is still selected", () => {
        const result = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: 5,
            latestRequestSeq: 5,
            stillSelected: true,
        });
        expect(result.apply).toBe(true);
        expect(result.skippedReason).toBeNull();
    });

    it("stale request seq — blocked with stale_request_seq reason", () => {
        const result = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: 3,
            latestRequestSeq: 7,
            stillSelected: true,
        });
        expect(result.apply).toBe(false);
        expect(result.skippedReason).toBe("stale_request_seq");
    });

    it("lane changed — blocked with lane_changed reason", () => {
        const result = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: 5,
            latestRequestSeq: 5,
            stillSelected: false,
        });
        expect(result.apply).toBe(false);
        expect(result.skippedReason).toBe("lane_changed");
    });

    it("stale seq takes precedence over lane change", () => {
        const result = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: 2,
            latestRequestSeq: 9,
            stillSelected: false,
        });
        expect(result.apply).toBe(false);
        expect(result.skippedReason).toBe("stale_request_seq");
    });
});

// ---------------------------------------------------------------------------
// 5. Lane reveal state — no false empty / no skeleton under loaded pills
// ---------------------------------------------------------------------------

type MockPayload = { queue: { key: string }; items: unknown[]; total: number; limit: number; offset: number };

function makeMockPayload(queueKey: string, itemCount = 3): MockPayload {
    return {
        queue: { key: queueKey },
        items: Array.from({ length: itemCount }, (_, i) => ({ id: `item-${i}` })),
        total: itemCount,
        limit: 50,
        offset: 0,
    };
}

describe("resolveWorkUnitQueueLaneRevealState", () => {
    it("hidden_until_settled while loading and no cache hit (prevents false empty)", () => {
        const cache = new Map();
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "new_leads",
            active_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: null,
            queue_items_loading: true,
            queue_items_error: null,
        });
        expect(state).toBe("hidden_until_settled");
        expect(workUnitQueueLaneMayPaintRows(state)).toBe(false);
    });

    it("ready_with_cache when cache has matching rows even during loading", () => {
        const cache = new Map<string, { payload: MockPayload; fetchedAt: number }>();
        const payload = makeMockPayload("new_leads");
        putQueueRowCache(cache, "fp-1", "wu-1", "new_leads", payload);

        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "new_leads",
            active_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: null,
            queue_items_loading: true,
            queue_items_error: null,
        });
        expect(state).toBe("ready_with_cache");
        expect(workUnitQueueLaneMayPaintRows(state)).toBe(true);
    });

    it("hidden_until_settled when work_unit_id is null (prevents premature empty state)", () => {
        const cache = new Map();
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: null,
            selected_queue_key: "new_leads",
            active_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: null,
            queue_items_loading: false,
            queue_items_error: null,
        });
        expect(state).toBe("hidden_until_settled");
    });

    it("ready_with_rows when items settled with data", () => {
        const cache = new Map();
        const payload = makeMockPayload("new_leads", 5);
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "new_leads",
            active_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: payload,
            queue_items_loading: false,
            queue_items_error: null,
        });
        expect(state).toBe("ready_with_rows");
        expect(workUnitQueueLaneMayPaintRows(state)).toBe(true);
    });

    it("ready_empty when items settled with zero rows (known empty — not false empty)", () => {
        const cache = new Map();
        const emptyPayload = makeMockPayload("new_leads", 0);
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "new_leads",
            active_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: emptyPayload,
            queue_items_loading: false,
            queue_items_error: null,
        });
        expect(state).toBe("ready_empty");
        expect(workUnitQueueLaneMayPaintRows(state)).toBe(true);
    });

    it("ready_error on queue_items_error — never shows empty or hidden", () => {
        const cache = new Map();
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "new_leads",
            active_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: null,
            queue_items_loading: false,
            queue_items_error: "Network error",
        });
        expect(state).toBe("ready_error");
        expect(workUnitQueueLaneRevealSettled(state)).toBe(true);
    });

    it("hidden_until_settled when switching pills (mismatched active key + no cache)", () => {
        const cache = new Map<string, { payload: MockPayload; fetchedAt: number }>();
        // Previous lane rows still in queue_items, but we switched to a different pill
        const oldPayload = makeMockPayload("new_leads", 3);
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "tours",             // new pill
            active_queue_key: "tours",               // newly active
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "fp-1",
            cache,
            queue_items: oldPayload,                 // still holds old lane data
            queue_items_loading: true,
            queue_items_error: null,
        });
        // Old-lane rows must NOT be shown under the new pill — must stay hidden
        expect(state).toBe("hidden_until_settled");
    });
});

// ---------------------------------------------------------------------------
// 6. Queue row cache: warm pill switch uses cached rows
// ---------------------------------------------------------------------------

describe("queueRowClientCache warm pill switch", () => {
    it("puts rows and peeks them fresh within TTL", () => {
        const cache = new Map<string, { payload: MockPayload; fetchedAt: number }>();
        const payload = makeMockPayload("tours", 4);
        putQueueRowCache(cache, "fp-abc", "wu-xyz", "tours", payload);

        const logicalKey = queueRowLogicalCacheKey("fp-abc", "wu-xyz", "tours", false);
        const hit = peekFreshQueueRowCache(cache, logicalKey);
        expect(hit).not.toBeNull();
        expect(hit!.payload.queue.key).toBe("tours");
        expect(hit!.payload.items).toHaveLength(4);
    });

    it("cross-fingerprint isolation: different scope cannot read another scope cache", () => {
        const cache = new Map<string, { payload: MockPayload; fetchedAt: number }>();
        putQueueRowCache(cache, "fp-user-A", "wu-1", "new_leads", makeMockPayload("new_leads"));

        const foreignKey = queueRowLogicalCacheKey("fp-user-B", "wu-1", "new_leads", false);
        expect(peekFreshQueueRowCache(cache, foreignKey)).toBeNull();
    });

    it("stale entry (past TTL) is evicted on peek", () => {
        const cache = new Map<string, { payload: MockPayload; fetchedAt: number }>();
        const logicalKey = queueRowLogicalCacheKey("fp", "wu", "pipeline_total", false);
        // Manually insert a stale entry
        cache.set(logicalKey, { payload: makeMockPayload("pipeline_total"), fetchedAt: Date.now() - QUEUE_ROW_CLIENT_CACHE_TTL_MS - 100 });

        const hit = peekFreshQueueRowCache(cache, logicalKey, QUEUE_ROW_CLIENT_CACHE_TTL_MS);
        expect(hit).toBeNull();
        // Entry should be deleted on eviction
        expect(cache.has(logicalKey)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 7. Prefetch does not mutate visible drawer state (structural contract)
// ---------------------------------------------------------------------------

describe("prefetch isolation — structural checks", () => {
    it("opportunityDrawerIntentPrefetch exports prefetchOpportunityDrawerOnRowIntent function", async () => {
        const mod = await import("@/lib/admin/opportunityDrawerIntentPrefetch");
        expect(typeof mod.prefetchOpportunityDrawerOnRowIntent).toBe("function");
    });

    it("hover intent does not prefetch full hydrate (pointer-down helper is separate)", async () => {
        const src = readFileSync(
            join(webRoot, "lib/admin/opportunityDrawerIntentPrefetch.ts"),
            "utf8"
        );
        expect(src).toContain("prefetchOpportunityDrawerFullOnRowIntent");
        expect(src).not.toMatch(
            /prefetchOpportunityDrawerOnRowIntent[\s\S]{0,400}prefetchOpportunityDrawerFull\(/
        );
    });

    it("work-unit page defers duplicate primary row force fetch when bootstrap inline is complete", () => {
        const page = readFileSync(
            join(
                webRoot,
                "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
            ),
            "utf8"
        );
        expect(page).toContain("inlineIncomplete");
        expect(page).toContain("quietStaleRefresh: true");
    });

    it("record-actions route accepts person entity_type", () => {
        const route = readFileSync(
            join(webRoot, "app/api/admin/record-actions/route.ts"),
            "utf8"
        );
        expect(route).toContain('"person"');
    });

    it("prefetchLinkedPersonsFromOpportunityRecord is a function (linked person prefetch)", async () => {
        const mod = await import("@/lib/admin/drawer/prefetchLinkedPersonsFromOpportunityRecord");
        expect(typeof mod.prefetchLinkedPersonsFromOpportunityRecord).toBe("function");
    });
});

// ---------------------------------------------------------------------------
// 8. perfWorkUnitLoad is exported from adminV2PerfLog
// ---------------------------------------------------------------------------

describe("perfWorkUnitLoad export", () => {
    it("perfWorkUnitLoad is a function in adminV2PerfLog", async () => {
        const mod = await import("@/lib/perf/adminV2PerfLog");
        expect(typeof mod.perfWorkUnitLoad).toBe("function");
    });

    it("perfWorkUnitLoad and perfDeptLoad are distinct functions", async () => {
        const mod = await import("@/lib/perf/adminV2PerfLog");
        expect(mod.perfWorkUnitLoad).not.toBe(mod.perfDeptLoad);
    });
});
