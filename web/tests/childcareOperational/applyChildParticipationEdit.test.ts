/**
 * Blocker 2 — participation-detail edits route by lifecycle and never touch OCM:
 *   pre-materialization  → process_instances.metadata
 *   post-materialization → durable model (agreement / placement / schedule assignment)
 * No opportunity_customer_members row is read or written.
 */
import { describe, it, expect } from "vitest";
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
    };
    const captureUpdate = (table: string, p: Rec) => {
        (captured as unknown as Record<string, Rec | null>)[`${table}Update`] = p;
    };
    const client = {
        from(table: string) {
            if (table === "opportunity_customer_members") captured.ocmAccess++;
            let cols = "*";
            let op: "select" | "update" = "select";
            let patch: Rec | null = null;
            const builder: Rec = {
                select(c?: string) { cols = c ?? "*"; return builder; },
                update(p: Rec) { op = "update"; patch = p; captureUpdate(table, p); return builder; },
                eq() { return builder; },
                in() { return builder; },
                or() { return builder; },
                order() { return builder; },
                limit() { return builder; },
                maybeSingle() {
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
            void cols; void patch;
            return builder;
        },
    };
    return { client: client as never, captured };
}

const pi = (metadata: Rec = {}): Rec => ({ id: "pi-1", context_id: "opp-1", metadata });

describe("applyChildParticipationEdit", () => {
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
            placement: { id: "plc-1", start_date: "2026-09-01" },
        });
        const res = await applyChildParticipationEdit(client, {
            orgId: ORG,
            customerMemberId: CM,
            patch: { program_category_id: "new-prog", program_room_cohort_key: "room-2", start_date: "2026-10-01" },
        });
        expect(res.ok).toBe(true);
        expect(res.routed).toBe("durable");
        expect(res.agreement_id).toBe("agr-1");
        // Placement updated with the new program/room/start.
        expect(captured.child_placementsUpdate).toMatchObject({ program_category_id: "new-prog", room_location_id: "room-2", start_date: "2026-10-01" });
        // Agreement start updated (relationship header).
        expect(captured.child_enrollment_agreementsUpdate).toMatchObject({ start_date: "2026-10-01" });
        // Process-instance metadata NOT rewritten with facts post-materialization.
        expect(captured.process_instancesUpdate).toBeNull();
        expect(captured.ocmAccess).toBe(0);
    });

    it("POST-materialization: schedule edit resolves a pattern and updates the schedule assignment", async () => {
        const { client, captured } = mockSupabase({
            pi: pi({ location_id: "site-1" }),
            agreement: { id: "agr-1", site_location_id: "site-1", status: "active", metadata: {} },
            schedule: { id: "sch-1" },
            pattern: { id: "pat-full" },
        });
        const res = await applyChildParticipationEdit(client, { orgId: ORG, customerMemberId: CM, patch: { schedule_type: "full_day" } });
        expect(res.routed).toBe("durable");
        expect(captured.schedule_assignmentsUpdate).toMatchObject({ schedule_pattern_id: "pat-full" });
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
