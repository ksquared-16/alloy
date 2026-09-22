/**
 * THE TWO SCHEDULING EDGES REMOVED FROM A COUNT GROUP, ASSERTED AS BEHAVIOUR.
 *
 * Both were serial only because of the order they were written in, and both were measured on
 * deployed 486ea3eb9:
 *
 *   child membership -> population/EPP/tours   the lane chain never reads a child count, yet the
 *                                              binding group spent 102ms of lane work strictly
 *                                              after a 521ms child lens
 *   EPP -> tours                               both are pure attaches over the SAME population
 *                                              rows and tours reads only `row.id`
 *
 * A source-text assertion would pin today's spelling. These assert the boundary a serial chain
 * cannot cross: at the moment the first read settles, the independent work must ALREADY have been
 * issued. Re-introducing either `await` fails this by construction, however it is written.
 */
import { describe, expect, it, vi } from "vitest";

const attachEpp = vi.fn();
const attachTours = vi.fn();

vi.mock("@/lib/process/definitions/enrollment/attachEffectiveEnrollmentStagesToOpportunityRows", () => ({
    attachEffectiveEnrollmentStagesToOpportunityRows: (p: { rows: Record<string, unknown>[] }) =>
        attachEpp(p),
}));
vi.mock("@/lib/tours/queue/attachActiveTourFactsToOpportunityRows", () => ({
    attachActiveTourFactsToOpportunityRows: (p: { rows: Record<string, unknown>[] }) => attachTours(p),
}));

/** Records the table of every query and when the first one settles. */
function recordingClient(rowsByTable: Record<string, unknown[]> = {}) {
    const issued: string[] = [];
    let beforeFirstSettle: string[] | null = null;
    const builder = (table: string) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "or", "order", "limit", "not", "is", "neq", "gte", "lte", "overlaps", "contains"]) {
            b[m] = () => b;
        }
        b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            issued.push(table);
            return new Promise((res) => setTimeout(res, 0))
                .then(() => {
                    if (beforeFirstSettle === null) beforeFirstSettle = [...issued];
                    return { data: rowsByTable[table] ?? [], error: null };
                })
                .then(resolve, reject);
        };
        return b;
    };
    return {
        supabase: { from: (t: string) => builder(t) } as never,
        issued: () => issued,
        beforeFirstSettle: () => beforeFirstSettle,
    };
}

describe("a count group starts its independent work together", () => {
    it("REPAIR B: EPP and tours are both invoked before either resolves", async () => {
        let resolveEpp: (v: unknown) => void = () => {};
        let eppSettled = false;
        attachEpp.mockImplementation(() => new Promise((r) => { resolveEpp = (v) => { eppSettled = true; r(v); }; }));
        // Tours must be called while EPP is still pending. If the two were chained, this assertion
        // could never hold: the second call would not exist until the first had resolved.
        attachTours.mockImplementation((p: { rows: Record<string, unknown>[] }) => {
            expect(eppSettled, "tours must be invoked while EPP is still in flight").toBe(false);
            expect(attachEpp).toHaveBeenCalled();
            resolveEpp(p.rows);
            return Promise.resolve(p.rows);
        });

        const { evaluateWorkViewTotalsForGroup } = await import("@/lib/queues/evaluateWorkViewTotalsForGroup");
        const { emptyWorkViewTotalsSpans } = await import("@/lib/runtime/provisioning/workViewTotalsSeedContract");
        const rec = recordingClient({ opportunities: [{ id: "o1" }] });

        await evaluateWorkViewTotalsForGroup({
            supabase: rec.supabase,
            orgId: "org_1",
            group: { workUnitId: "wu_1", queueKey: "lifecycle_lead", viewIds: new Set(["v1"]) },
            prerequisite: { accessible: true, departmentMetadata: laneOnlyMetadata() },
            recordScopeConstraints: null as never,
            recordScopeImpossible: false,
            viewerDisplayTimeZone: { iana: "UTC", source: "default", cacheHit: false } as never,
            spans: emptyWorkViewTotalsSpans(),
        });

        expect(attachEpp).toHaveBeenCalledTimes(1);
        expect(attachTours).toHaveBeenCalledTimes(1);
        // Both received the SAME base rows. Handing tours the EPP output is the serial shape.
        expect(attachTours.mock.calls[0][0].rows).toBe(attachEpp.mock.calls[0][0].rows);
    });
    it("REPAIR A: the lane's population read is issued before the child membership settles", async () => {
        /*
         * THE DISCRIMINATOR. The child path reads `process_instances` first; the lane path reads
         * `opportunities` (the process population) first. Under the old serial shape the population
         * read could not be issued until the ENTIRE child block had finished, so it could never
         * appear in the snapshot taken when the first query settles. Seeing both there is proof the
         * two branches started together.
         */
        attachEpp.mockImplementation((p: { rows: Record<string, unknown>[] }) => Promise.resolve(p.rows));
        attachTours.mockImplementation((p: { rows: Record<string, unknown>[] }) => Promise.resolve(p.rows));

        const { evaluateWorkViewTotalsForGroup } = await import("@/lib/queues/evaluateWorkViewTotalsForGroup");
        const { emptyWorkViewTotalsSpans } = await import("@/lib/runtime/provisioning/workViewTotalsSeedContract");
        const rec = recordingClient({
            opportunities: [{ id: "o1", org_id: "org_1", stage_key: "lead", status_key: "open", work_unit_id: "wu_1" }],
            process_instances: [],
        });

        await evaluateWorkViewTotalsForGroup({
            supabase: rec.supabase,
            orgId: "org_1",
            group: { workUnitId: "wu_1", queueKey: "lifecycle_lead", viewIds: new Set(["v1", "vc"]) },
            prerequisite: { accessible: true, departmentMetadata: childAndLaneMetadata() },
            recordScopeConstraints: null as never,
            recordScopeImpossible: false,
            viewerDisplayTimeZone: { iana: "UTC", source: "default", cacheHit: false } as never,
            spans: emptyWorkViewTotalsSpans(),
        });

        const snap = rec.beforeFirstSettle() ?? [];
        expect(snap, "the child lens must have been issued").toContain("process_instances");
        expect(
            snap,
            "the lane population read must be in flight before the child membership settles",
        ).toContain("opportunities");
    });
});

/** Department metadata with one LANE (family-grain) Work View, so only the lane chain runs. */
function laneOnlyMetadata() {
    // Built lazily inside the test file to keep the import graph small; the shape is the one
    // `classifyRequestedWorkViews` reads.
    const proc = {
        id: "p1", key: "enrollment", name: "E", primary_entity: "opportunity", sort_order: 0,
        is_active: true,
        stages: [{ id: "s1", key: "lead", label: "Lead", grain: "family", is_active: true, sort_order: 0 }],
        work_views_v1: [{ id: "v1", label: "All Leads", filters_v1: [] }],
    };
    return { lifecycle_builder_v1: { version: 1, active_process_id: "p1", processes: [proc] } };
}

/** One family-grain lane view AND one child-grain lens, so a single group runs both branches. */
function childAndLaneMetadata() {
    const proc = {
        id: "p1", key: "enrollment", name: "E", primary_entity: "opportunity", sort_order: 0,
        is_active: true,
        stages: [
            { id: "s1", key: "lead", label: "Lead", grain: "family", is_active: true, sort_order: 0 },
            { id: "s2", key: "waitlist", label: "Waitlist", grain: "child", is_active: true, sort_order: 1 },
        ],
        work_views_v1: [
            { id: "v1", label: "All Leads", filters_v1: [] },
            { id: "vc", label: "Waitlist Children", row_grain_v1: "child",
              filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }] },
        ],
    };
    return { lifecycle_builder_v1: { version: 1, active_process_id: "p1", processes: [proc] } };
}
