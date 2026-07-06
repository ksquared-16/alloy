/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    piEffectiveStageKey,
    processInstanceBelongsToLane,
} from "@/lib/queues/enrollmentEffectiveStageMembership";
import { enrollmentQueueOcmFallbackEnabled } from "@/lib/queues/enrollmentQueueMembershipFlags";
import { queryEnrollmentProcessInstanceTrackRows } from "@/lib/queues/childGrainProcessInstanceQueue";

describe("effective-stage membership (pure) — the same rule as metrics", () => {
    it("effective stage = PI.stage_key ?? context.stage_key", () => {
        expect(piEffectiveStageKey("waitlist", "lead")).toBe("waitlist"); // PI stage wins
        expect(piEffectiveStageKey(null, "lead")).toBe("lead"); // rides the family track
        expect(piEffectiveStageKey("  ", "lead")).toBe("lead");
        expect(piEffectiveStageKey(null, null)).toBeNull();
    });

    it("a freshly-created child (null stage) belongs to its household's stage lane, not a child lane", () => {
        const fresh = { piStageKey: null, contextStageKey: "lead" };
        expect(processInstanceBelongsToLane({ ...fresh, laneStageKey: "lead" })).toBe(true);
        expect(processInstanceBelongsToLane({ ...fresh, laneStageKey: "waitlist" })).toBe(false);
    });

    it("a branched child (stage=waitlist) belongs to Waitlist, not Lead", () => {
        const waitlisted = { piStageKey: "waitlist", contextStageKey: "lead" };
        expect(processInstanceBelongsToLane({ ...waitlisted, laneStageKey: "waitlist" })).toBe(true);
        expect(processInstanceBelongsToLane({ ...waitlisted, laneStageKey: "lead" })).toBe(false);
    });

    it("Lyons membership: two null-stage children at Lead → New Leads set = 2; move one → 1 + 1", () => {
        const both = [
            { piStageKey: null, contextStageKey: "lead" },
            { piStageKey: null, contextStageKey: "lead" },
        ];
        expect(both.filter((c) => processInstanceBelongsToLane({ ...c, laneStageKey: "lead" })).length).toBe(2);
        expect(both.filter((c) => processInstanceBelongsToLane({ ...c, laneStageKey: "waitlist" })).length).toBe(0);

        const moved = [
            { piStageKey: null, contextStageKey: "lead" }, // child A rides family track
            { piStageKey: "waitlist", contextStageKey: "lead" }, // child B branched
        ];
        expect(moved.filter((c) => processInstanceBelongsToLane({ ...c, laneStageKey: "lead" })).length).toBe(1);
        expect(moved.filter((c) => processInstanceBelongsToLane({ ...c, laneStageKey: "waitlist" })).length).toBe(1);
    });
});

describe("OCM is not canonical unless the explicit fallback flag is enabled", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("defaults OFF; on only when ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK=1", () => {
        vi.stubEnv("ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK", "");
        expect(enrollmentQueueOcmFallbackEnabled()).toBe(false);
        vi.stubEnv("ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK", "1");
        expect(enrollmentQueueOcmFallbackEnabled()).toBe(true);
    });
});

// ── Query-level: the PI track query applies effective-stage over a mocked DB ─────────────────────
type Row = Record<string, unknown>;
function mockSupabase(dataByTable: Record<string, Row[]>): SupabaseClient {
    const make = (rows: Row[]) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "or", "in"]) b[m] = () => b;
        b.then = (onF: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(onF);
        return b;
    };
    return { from: (t: string) => make(dataByTable[t] ?? []) } as unknown as SupabaseClient;
}

function piRow(over: Partial<Row>): Row {
    return { id: `pi-${over.subject_id}`, org_id: "org-1", subject_id: "cm", context_id: "opp-1", stage_key: null, state: null, metadata: {}, updated_at: null, created_at: null, ...over };
}
const LEAD_OPP = [{ id: "opp-1", stage_key: "lead", work_unit_id: "wu-1", name: "Lyons", status_key: "open" }];
const MEMBERS = [
    { id: "cm-a", display_name: "Child A", is_active: true },
    { id: "cm-b", display_name: "Child B", is_active: true },
];

describe("queryEnrollmentProcessInstanceTrackRows applies effective stage", () => {
    it("two null-stage children at a Lead opportunity appear in the 'lead' lane, none in 'waitlist'", async () => {
        const db = mockSupabase({
            process_instances: [piRow({ subject_id: "cm-a" }), piRow({ subject_id: "cm-b" })],
            opportunities: LEAD_OPP,
            customer_members: MEMBERS,
        });
        const lead = await queryEnrollmentProcessInstanceTrackRows({ supabase: db, orgId: "org-1", workUnitId: "wu-1", stageKey: "lead" });
        expect(lead.length).toBe(2);
        const wait = await queryEnrollmentProcessInstanceTrackRows({ supabase: db, orgId: "org-1", workUnitId: "wu-1", stageKey: "waitlist" });
        expect(wait.length).toBe(0);
    });

    it("after one child branches to waitlist: lead lane = 1, waitlist lane = 1", async () => {
        const db = mockSupabase({
            process_instances: [piRow({ subject_id: "cm-a" }), piRow({ subject_id: "cm-b", stage_key: "waitlist" })],
            opportunities: LEAD_OPP,
            customer_members: MEMBERS,
        });
        expect((await queryEnrollmentProcessInstanceTrackRows({ supabase: db, orgId: "org-1", workUnitId: "wu-1", stageKey: "lead" })).length).toBe(1);
        expect((await queryEnrollmentProcessInstanceTrackRows({ supabase: db, orgId: "org-1", workUnitId: "wu-1", stageKey: "waitlist" })).length).toBe(1);
    });
});
