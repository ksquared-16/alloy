/**
 * R11 — telemetry contract guard for the Initial Panel resource's Activity phase.
 *
 * `initialPanelResource` used to report BOTH `first_paint_resolve_ms` and
 * `activity_timeline_hydrate_ms` as `Date.now() - tDeps0`: one number under two names. That made the
 * Activity leg unobservable and is exactly what a future reader would rely on to re-check R11's
 * DISPROVED verdict, so the separation is guarded here rather than left to inspection.
 *
 * This drives the REAL `buildInitialPanelResource`. Only its collaborators are stubbed, so the timing
 * expressions under test are the shipped ones. Both legs are hand-resolved against a fake clock, so
 * the assertions are exact integers rather than tolerance windows — a re-aliased metric fails loudly
 * instead of drifting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above module initialization, so the spies must be hoisted with it.
const { resolveFirstPaint, loadActivity } = vi.hoisted(() => ({
    resolveFirstPaint: vi.fn(),
    loadActivity: vi.fn(),
}));

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies", () => ({
    resolveOpportunityDrawerFirstPaintDependencies: (...a: unknown[]) => resolveFirstPaint(...a),
    remindersFromFirstPaintData: () => null,
    headerActionsFromFirstPaintData: () => null,
    tourBookingsFromFirstPaintData: () => [],
}));
vi.mock("@/lib/admin/loadOpportunityRelatedActivityEvents", () => ({
    loadOpportunityActivityEvents: (...a: unknown[]) => loadActivity(...a),
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold", () => ({
    compileOpportunityDrawerViewModelShell: () => ({ tabs: ["overview"], sections: [] }),
    buildOpportunityDrawerViewModelAboveFold: () => ({ sections: [] }),
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract", () => ({
    aboveFoldSectionsStructureSettled: () => true,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint", () => ({
    buildOpportunityDrawerFirstPaintContract: () => ({ settled: true }),
    opportunityDrawerFirstPaintContractValid: () => true,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract", () => ({
    buildOpportunityFirstViewportPlan: () => ({ dependencies: [], viewport_slots: [] }),
    resolveTourSlotDisplaySource: () => null,
}));
vi.mock("@/lib/completion/readinessDrawerBootstrap", () => ({ tryEvaluateDrawerRecordReadiness: () => null }));
vi.mock("@/lib/completion/readinessEvaluationMemo", () => ({ createReadinessMemoScope: () => ({}) }));
vi.mock("@/lib/admin/sanitizeDrawerOperTrustPreview", () => ({
    sanitizeDrawerOperTrustPreviewFromHints: () => null,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader", () => ({
    buildOpportunityDrawerHeaderTitle: () => "title",
    buildOpportunityDrawerHeaderSubtitle: () => "subtitle",
    buildOpportunityStatusControlVm: () => null,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions", () => ({
    buildOpportunityDrawerHeaderMenuActions: () => [],
}));
vi.mock("@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate", () => ({
    resolveOpportunityDrawerStatusCanMutateFromGate: () => false,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelSummaries", () => ({
    buildOpportunityDrawerAttentionSummary: () => null,
    buildOpportunityDrawerBosSummary: () => null,
    parseInquirySummaryTasksFromRecord: () => [],
}));

const { buildInitialPanelResource } = await import(
    "@/lib/adminV2/viewModel/drawer/opportunity/initialPanelResource"
);

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** A first-paint result carrying a pre-existing phase key, so key merging is covered too. */
const FIRST_PAINT_RESULT = {
    record_patches: {},
    phases_ms: { first_paint_dependencies_ms: 1234 },
    data: {},
    dependencies: [],
};

const ACTIVITY_ROWS = [
    { id: "evt-1", occurred_at: "2026-01-01T00:00:00.000Z", event_type: "note_added", payload: null },
];

function params(record: Record<string, unknown> = {}) {
    return {
        supabase: {} as never,
        gate: { orgId: "org", role: "admin", roleKeys: [] } as never,
        opportunityId: "opp",
        departmentId: null,
        workUnitId: null,
        statusKey: null,
        record,
        deptMetadata: null,
        layoutConfigJson: {} as never,
        queueDefinition: null,
        wuMetadata: null,
        statusDefs: [],
        lifecycleRail: null as never,
    };
}

/** Let the promise chain under test settle without advancing the fake clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("R11 — Activity phase telemetry is measured at the Activity leg, not aliased", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resolveFirstPaint.mockReset();
        loadActivity.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("Activity finishing FIRST reports its own shorter duration, not the full resolve", async () => {
        const activity = deferred<typeof ACTIVITY_ROWS>();
        const deps = deferred<typeof FIRST_PAINT_RESULT>();
        loadActivity.mockReturnValue(activity.promise);
        resolveFirstPaint.mockReturnValue(deps.promise);

        const pending = buildInitialPanelResource(params() as never);
        await vi.advanceTimersByTimeAsync(100);
        activity.resolve(ACTIVITY_ROWS);
        await flush();
        await vi.advanceTimersByTimeAsync(300);
        deps.resolve(FIRST_PAINT_RESULT);
        const result = await pending;

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The defect this guards: both were `Date.now() - tDeps0`, so both read 400.
        expect(result.phases_ms.activity_timeline_hydrate_ms).toBe(100);
        expect(result.phases_ms.first_paint_resolve_ms).toBe(400);
        expect(result.phases_ms.activity_timeline_hydrate_ms).toBeLessThan(
            result.phases_ms.first_paint_resolve_ms,
        );
    });

    it("Activity finishing LAST is reported at its own later completion, and gates the resolve", async () => {
        const activity = deferred<typeof ACTIVITY_ROWS>();
        const deps = deferred<typeof FIRST_PAINT_RESULT>();
        loadActivity.mockReturnValue(activity.promise);
        resolveFirstPaint.mockReturnValue(deps.promise);

        const pending = buildInitialPanelResource(params() as never);
        await vi.advanceTimersByTimeAsync(100);
        deps.resolve(FIRST_PAINT_RESULT);
        await flush();
        await vi.advanceTimersByTimeAsync(300);
        activity.resolve(ACTIVITY_ROWS);
        const result = await pending;

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Equal here is CORRECT, not aliasing: Promise.all cannot settle before the slower leg, and
        // the first test proves the two values come from different measurements.
        expect(result.phases_ms.activity_timeline_hydrate_ms).toBe(400);
        expect(result.phases_ms.first_paint_resolve_ms).toBe(400);
    });

    it("legs finishing together report equal values without sharing one expression", async () => {
        const activity = deferred<typeof ACTIVITY_ROWS>();
        const deps = deferred<typeof FIRST_PAINT_RESULT>();
        loadActivity.mockReturnValue(activity.promise);
        resolveFirstPaint.mockReturnValue(deps.promise);

        const pending = buildInitialPanelResource(params() as never);
        await vi.advanceTimersByTimeAsync(250);
        activity.resolve(ACTIVITY_ROWS);
        deps.resolve(FIRST_PAINT_RESULT);
        const result = await pending;

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.phases_ms.activity_timeline_hydrate_ms).toBe(250);
        expect(result.phases_ms.first_paint_resolve_ms).toBe(250);
    });

    it("a failing Activity leg reports its true elapsed time and fabricates no history", async () => {
        const activity = deferred<typeof ACTIVITY_ROWS>();
        const deps = deferred<typeof FIRST_PAINT_RESULT>();
        loadActivity.mockReturnValue(activity.promise);
        resolveFirstPaint.mockReturnValue(deps.promise);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const record: Record<string, unknown> = {};
        const pending = buildInitialPanelResource(params(record) as never);
        await vi.advanceTimersByTimeAsync(100);
        activity.reject(new Error("activity boom"));
        await flush();
        await vi.advanceTimersByTimeAsync(300);
        deps.resolve(FIRST_PAINT_RESULT);
        const result = await pending;

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Truthful: the number is when the leg actually concluded (failed), not the sibling's 400 and
        // not a fabricated success.
        expect(result.phases_ms.activity_timeline_hydrate_ms).toBe(100);
        expect(result.phases_ms.first_paint_resolve_ms).toBe(400);
        // A failed hydrate must leave no history behind for a renderer to mistake for real events.
        expect(record._activity_timeline_events).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("keeps the existing phase field names, units and merged upstream keys", async () => {
        loadActivity.mockResolvedValue(ACTIVITY_ROWS);
        resolveFirstPaint.mockResolvedValue(FIRST_PAINT_RESULT);

        const result = await buildInitialPanelResource(params() as never);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const p = result.phases_ms;
        for (const key of ["activity_timeline_hydrate_ms", "first_paint_resolve_ms"]) {
            expect(p).toHaveProperty(key);
            expect(Number.isInteger(p[key])).toBe(true);   // whole milliseconds, as before
            expect(p[key]).toBeGreaterThanOrEqual(0);
        }
        // Upstream phases still merge through unchanged.
        expect(p.first_paint_dependencies_ms).toBe(1234);
    });
});
