/**
 * Blocker 2 — participation-detail edits route by lifecycle and never touch OCM:
 *   pre-materialization  → process_instances.metadata
 *   post-materialization → durable model (agreement / placement / schedule assignment)
 * No opportunity_customer_members row is read or written.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * The canonical path EMITS a domain change event after the transaction commits; the in-place bypass
 * emitted nothing, which is the defect the doctrine calls worse than a visible failure. `emitEvent`
 * builds its own admin client from the environment, so a unit test has to stand in for it — and once it
 * does, the event becomes assertable, which is better than it being invisible.
 */
const emitted: Array<Record<string, unknown>> = [];
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: async (input: Record<string, unknown>) => {
        emitted.push(input);
        return "evt-1";
    },
}));

import { applyChildParticipationEdit } from "@/lib/childcareOperational/applyChildParticipationEdit";

const ORG = "org-1";
const CM = "child-A";

type Rec = Record<string, unknown>;

function mockSupabase(cfg: { pi: Rec | null; agreement?: Rec | null; placement?: Rec | null; schedule?: Rec | null; pattern?: Rec | null }) {
    const captured = {
        process_instancesUpdate: null as Rec | null,
        child_enrollment_agreementsUpdate: null as Rec | null,
        child_placementsUpdate: null as Rec | null,
        schedule_assignmentsUpdate: null as Rec | null,
        ocmAccess: 0,
        /** Calls to the canonical temporal primitive: the only durable write path post-materialisation. */
        rpcCalls: [] as Array<{ fn: string; params: Rec }>,
    };
    const captureUpdate = (table: string, p: Rec) => {
        (captured as unknown as Record<string, Rec | null>)[`${table}Update`] = p;
    };
    const client = {
        /*
         * The primitive, not a table write. Post-materialisation the service no longer UPDATEs
         * `child_placements` or `schedule_assignments`; it calls one transactional RPC. A mock without
         * this returns "unknown rpc", which is how the convergence first showed up here as a failure.
         */
        rpc(fn: string, params: Rec) {
            captured.rpcCalls.push({ fn, params });
            const result: Rec = {};
            if (params.p_placement) {
                result.placement = {
                    prior_id: (cfg.placement as Rec | null)?.id ?? "plc-1",
                    prior_end_date: "2026-09-30",
                    successor_id: "plc-successor",
                    successor_status: "planned",
                    successor_start: (params.p_placement as Rec).start_date,
                };
            }
            if (params.p_assignment) {
                result.assignment = {
                    prior_id: (cfg.schedule as Rec | null)?.id ?? "asg-1",
                    prior_end_date: "2026-09-30",
                    successor_id: "asg-successor",
                    successor_status: "planned",
                    successor_start: (params.p_assignment as Rec).start_date,
                };
            }
            return Promise.resolve({ data: { ok: true, replayed: false, result }, error: null });
        },
        from(table: string) {
            if (table === "opportunity_customer_members") captured.ocmAccess++;
            let cols = "*";
            let op: "select" | "update" = "select";
            let patch: Rec | null = null;
            // `roomResolvesToSite` WALKS the parent chain with one query per hop, so the mock has to
            // answer by the id being asked for. Answering by column shape made the walk see the room
            // again at every hop and never reach the site.
            const filters: Rec = {};
            const builder: Rec = {
                select(c?: string) { cols = c ?? "*"; return builder; },
                update(p: Rec) { op = "update"; patch = p; captureUpdate(table, p); return builder; },
                eq(col: string, val: unknown) { filters[col] = val; return builder; },
                in() { return builder; },
                or() { return builder; },
                order() { return builder; },
                limit() { return builder; },
                single() {
                    // The services read the committed successor back by id after the RPC returns.
                    if (table === "child_placements") {
                        return Promise.resolve({ data: { id: "plc-successor", org_id: ORG, status: "planned" }, error: null });
                    }
                    if (table === "schedule_assignments") {
                        return Promise.resolve({
                            data: {
                                id: "asg-successor", org_id: ORG, status: "planned", subject_type: "child",
                                enrollment_agreement_id: "agr-1", customer_member_id: CM,
                                schedule_pattern_id: (cfg.pattern as Rec | null)?.id ?? "pat-full",
                            },
                            error: null,
                        });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                maybeSingle() {
                    /*
                     * The canonical Placement service VALIDATES the program category and room against the
                     * site before it writes. The in-place bypass did not, so these rows never had to exist
                     * for this test to pass — routing through the canonical command is strictly stricter,
                     * and that is the point.
                     */
                    if (table === "location_program_categories") {
                        return Promise.resolve({ data: { id: "new-prog", org_id: ORG, location_id: "site-1" }, error: null });
                    }
                    if (table === "locations") {
                        const id = String(filters.id ?? "");
                        if (id === "site-1") {
                            return Promise.resolve({
                                data: { id: "site-1", org_id: ORG, location_type: "site", parent_location_id: null },
                                error: null,
                            });
                        }
                        if (id === "room-2") {
                            return Promise.resolve({
                                data: { id: "room-2", org_id: ORG, location_type: "unit", parent_location_id: "site-1" },
                                error: null,
                            });
                        }
                        return Promise.resolve({ data: null, error: null });
                    }
                    if (table === "child_enrollment_agreements") return Promise.resolve({ data: cfg.agreement ?? null, error: null });
                    if (table === "child_placements") return Promise.resolve({ data: cfg.placement ?? null, error: null });
                    if (table === "schedule_assignments") return Promise.resolve({ data: cfg.schedule ?? null, error: null });
                    if (table === "schedule_patterns") return Promise.resolve({ data: cfg.pattern ?? null, error: null });
                    return Promise.resolve({ data: null, error: null });
                },
                then(resolve: (r: { data: Rec[] | null; error: null }) => void) {
                    if (op === "update") { resolve({ data: null, error: null }); return; }
                    if (table === "process_instances") { resolve({ data: cfg.pi ? [cfg.pi] : [], error: null }); return; }
                    resolve({ data: [], error: null });
                },
            };
            void patch;
            return builder;
        },
    };
    return { client: client as never, captured };
}

const pi = (metadata: Rec = {}): Rec => ({ id: "pi-1", context_id: "opp-1", metadata });

describe("applyChildParticipationEdit", () => {
    beforeEach(() => {
        emitted.length = 0;
    });

    it("PRE-materialization: writes participation facts to process_instances.metadata (no OCM)", async () => {
        const { client, captured } = mockSupabase({ pi: pi({ program_category_id: "old-prog" }), agreement: null });
        const res = await applyChildParticipationEdit(client, {
            orgId: ORG,
            customerMemberId: CM,
            patch: { program_category_id: "new-prog", start_date: "2026-10-01", schedule_type: "half_day" },
        });
        expect(res.ok).toBe(true);
        expect(res.routed).toBe("process_instance");
        const meta = captured.process_instancesUpdate!.metadata as Rec;
        expect(meta.program_category_id).toBe("new-prog");
        expect(meta.start_date).toBe("2026-10-01");
        expect(meta.schedule_type).toBe("half_day");
        expect(captured.ocmAccess).toBe(0);
        expect(captured.child_placementsUpdate).toBeNull();
    });

    it("POST-materialization: writes to durable model (placement + agreement), not OCM", async () => {
        const { client, captured } = mockSupabase({
            pi: pi({ location_id: "site-1", program_category_id: "old-prog" }),
            agreement: { id: "agr-1", site_location_id: "site-1", status: "active", metadata: {} },
            placement: { id: "plc-1", start_date: "2026-09-01", end_date: null, status: "active" },
        });
        const res = await applyChildParticipationEdit(client, {
            orgId: ORG,
            customerMemberId: CM,
            patch: { program_category_id: "new-prog", program_room_cohort_key: "room-2", start_date: "2026-10-01" },
        });
        expect(res.ok, `edit failed: ${JSON.stringify(res)}`).toBe(true);
        expect(res.routed).toBe("durable");
        expect(res.agreement_id).toBe("agr-1");
        /*
         * THE PLACEMENT IS SUPERSEDED, NOT UPDATED.
         *
         * This assertion used to read `child_placementsUpdate` toMatchObject({...}) — it asserted the
         * in-place write the effective-dating doctrine forbids, and it passed for as long as the bypass
         * existed. The durable change now goes through one transactional call, so the invariant to assert
         * is that no in-place write happened and the canonical command carried the operator's intent.
         */
        expect(captured.child_placementsUpdate).toBeNull();
        const call = captured.rpcCalls.find((c) => c.fn === "apply_participation_operational_change");
        expect(call, "the durable path must go through the canonical temporal primitive").toBeTruthy();
        expect(call!.params.p_placement).toMatchObject({
            program_category_id: "new-prog",
            room_location_id: "room-2",
            start_date: "2026-10-01",
        });
        // Agreement start still updated in place: the relationship header is not effective-dated truth.
        expect(captured.child_enrollment_agreementsUpdate).toMatchObject({ start_date: "2026-10-01" });
        // And the change is integration-visible, which the in-place path never was.
        expect(
            emitted.some((e) => String(e.event_type) === "placement_changed"),
            "a durable placement change must emit its domain event; a partner learns of it through that "
                + "event and nothing else",
        ).toBe(true);
        // Process-instance metadata NOT rewritten with facts post-materialization.
        expect(captured.process_instancesUpdate).toBeNull();
        expect(captured.ocmAccess).toBe(0);
    });

    it("POST-materialization: schedule edit resolves a pattern and updates the schedule assignment", async () => {
        const { client, captured } = mockSupabase({
            pi: pi({ location_id: "site-1" }),
            agreement: { id: "agr-1", site_location_id: "site-1", status: "active", metadata: {} },
            // A prior row needs a real interval: the canonical service validates that the successor
            // starts strictly after it, which the in-place path never checked.
            schedule: { id: "sch-1", start_date: "2026-09-01", end_date: null, status: "active", subject_type: "child", is_primary: true },
            // The canonical service validates the pattern belongs to the org and the site.
            pattern: { id: "pat-full", org_id: ORG, site_location_id: "site-1" },
        });
        const res = await applyChildParticipationEdit(client, { orgId: ORG, customerMemberId: CM, patch: { schedule_type: "full_day" } });
        expect(res.ok, `edit failed: ${JSON.stringify(res)}`).toBe(true);
        expect(res.routed).toBe("durable");
        /*
         * SUPERSEDED, NOT UPDATED — same correction as the placement case above. This previously asserted
         * `schedule_assignmentsUpdate`, an in-place write to effective-dated truth.
         *
         * Note what the payload does NOT carry: no room, site, program category, assignment type or
         * commitment kind. The primitive carries those forward from the prior row, which is why
         * superseding a schedule no longer silently drops the child's room.
         */
        expect(captured.schedule_assignmentsUpdate).toBeNull();
        const call = captured.rpcCalls.find((c) => c.fn === "apply_participation_operational_change");
        expect(call, "the durable path must go through the canonical temporal primitive").toBeTruthy();
        expect(call!.params.p_assignment).toMatchObject({ schedule_pattern_id: "pat-full" });
        expect(Object.keys(call!.params.p_assignment as Rec).sort()).toEqual(
            ["metadata", "schedule_pattern_id", "source_key", "start_date"],
        );
        expect(
            emitted.some((e) => String(e.event_type) === "schedule_assignment_changed"),
            "a durable schedule change must emit its domain event",
        ).toBe(true);
        expect(captured.ocmAccess).toBe(0);
    });

    it("never creates or reads an OCM row in either lifecycle", async () => {
        const pre = mockSupabase({ pi: pi({}), agreement: null });
        await applyChildParticipationEdit(pre.client, { orgId: ORG, customerMemberId: CM, patch: { start_date: "2026-10-01" } });
        expect(pre.captured.ocmAccess).toBe(0);

        const post = mockSupabase({ pi: pi({ location_id: "site-1" }), agreement: { id: "agr-1", site_location_id: "site-1", status: "active", metadata: {} }, placement: { id: "plc-1", start_date: "2026-09-01" } });
        await applyChildParticipationEdit(post.client, { orgId: ORG, customerMemberId: CM, patch: { start_date: "2026-10-01" } });
        expect(post.captured.ocmAccess).toBe(0);
    });

    it("no-op patch returns routed=none without any write", async () => {
        const { client, captured } = mockSupabase({ pi: pi({}) });
        const res = await applyChildParticipationEdit(client, { orgId: ORG, customerMemberId: CM, patch: {} });
        expect(res.routed).toBe("none");
        expect(captured.process_instancesUpdate).toBeNull();
    });
});
