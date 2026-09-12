/**
 * THE CHILD TRACK BEGINS WHEN THE CHILD JOURNEY BEGINS — NOT AT INTAKE.
 *
 * An Enrollment process runs family-grain stages (`lead`, `tour`, `decision`) and child-grain stages
 * (`waitlist`, `enrolling`, `enrolled`, closed) in one configuration. A child in the family segment
 * has no position of their own, so they have no process instance; the first legitimate transition
 * into a CHILD-grain stage is what brings the track into existence, and from then on that instance
 * owns their stage.
 *
 * Both halves of that sentence are defects if you drop either one:
 *
 *   create eagerly  — a live child journey for every enquiry a school ever receives, minted at the
 *                     moment the product has least to say about them;
 *   never create    — the move finds nothing to write, `moved: 0`, and the single-write assertion
 *                     refuses with "no enrollment track was found for them on this lead" — AFTER the
 *                     disposition was written and a placement candidate minted. Observed live: every
 *                     first waitlisting from Lead failed exactly there.
 *
 * These tests hold the boundary at the grain crossing, hold the bootstrap to one track per child,
 * and hold the created track to the operator's ACTUAL destination rather than to a fabricated
 * starting stage.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const mockResolveScope = vi.fn();
const mockCreateInstance = vi.fn();
const mockEnsureParticipation = vi.fn();

vi.mock("@/lib/process/processInstances", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/process/processInstances")>();
    return {
        ...actual,
        resolveEnrollmentInstanceIdForScope: (...a: unknown[]) => mockResolveScope(...a),
        createEnrollmentProcessInstance: (...a: unknown[]) => mockCreateInstance(...a),
    };
});

vi.mock("@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation", () => ({
    ensureOpportunityCustomerMemberParticipation: (...a: unknown[]) => mockEnsureParticipation(...a),
}));

import {
    ensureChildEnrollmentTrack,
    CHILD_TRACK_BOOTSTRAP_SOURCE,
} from "@/lib/lifecycle/ensureChildEnrollmentTrack";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const OCM = "55555555-5555-4555-8555-555555555555";

function ensure(over: Record<string, unknown> = {}) {
    return ensureChildEnrollmentTrack({} as never, {
        orgId: ORG,
        opportunityId: LEAD,
        customerMemberId: CHILD,
        opportunityCustomerMemberId: OCM,
        ...over,
    });
}

describe("ensureChildEnrollmentTrack", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveScope.mockResolvedValue({ id: null, ambiguous: false });
        mockCreateInstance.mockResolvedValue({ id: "pi-new" });
        mockEnsureParticipation.mockResolvedValue({ ocmId: OCM, created: false });
    });

    it("creates the track when the child has none", async () => {
        const r = await ensure();
        expect(r).toEqual({ ok: true, instanceId: "pi-new", created: true });
        expect(mockCreateInstance).toHaveBeenCalledTimes(1);
    });

    /**
     * NO FABRICATED STARTING STAGE. The track begins with no position at all; the caller's move
     * writes the operator's real destination immediately after. A constructor-supplied "starting"
     * child stage would put a transition in the history that never happened.
     */
    it("creates the track with no stage and no outcome", async () => {
        await ensure();
        const args = mockCreateInstance.mock.calls[0]![1];
        expect(args.stageKey).toBeNull();
        expect(args.state).toBeNull();
        expect(args.source).toBe(CHILD_TRACK_BOOTSTRAP_SOURCE);
    });

    it("anchors the track to the Enrollment Participation, recording the acquisition separately", async () => {
        await ensure();
        const args = mockCreateInstance.mock.calls[0]![1];
        expect(args.subjectId).toBe(CHILD);
        expect(args.contextId).toBe(OCM);
        expect(args.contextType).toBe("enrollment_participation");
        expect(args.acquisitionOpportunityId).toBe(LEAD);
    });

    it("reuses an existing track and creates nothing", async () => {
        mockResolveScope.mockResolvedValue({ id: "pi-existing", ambiguous: false });
        const r = await ensure();
        expect(r).toEqual({ ok: true, instanceId: "pi-existing", created: false });
        expect(mockCreateInstance).not.toHaveBeenCalled();
    });

    it("is idempotent — a second ensure returns the first track and inserts nothing", async () => {
        const first = await ensure();
        expect(first).toMatchObject({ ok: true, created: true });
        // The track now exists, which is what the second call sees.
        mockResolveScope.mockResolvedValue({ id: "pi-new", ambiguous: false });
        const second = await ensure();
        expect(second).toEqual({ ok: true, instanceId: "pi-new", created: false });
        expect(mockCreateInstance).toHaveBeenCalledTimes(1);
    });

    /**
     * THE RACE IS SETTLED BY THE DATABASE, NOT BY THIS MODULE.
     *
     * Two concurrent ensures both resolve "no track" and both attempt the insert. The uniqueness
     * invariant on `(org_id, process_key, subject_id, context_id)` lets exactly one through, and
     * `createEnrollmentProcessInstance` returns the winner's row as a REUSE to the loser. So the
     * loser reports the same instance and `created: false` — one track, two callers, no duplicate.
     */
    it("cannot duplicate under a concurrent writer — the loser reports the winner's track", async () => {
        mockCreateInstance.mockResolvedValue({ id: "pi-winner", reused: true });
        const r = await ensure();
        expect(r).toEqual({ ok: true, instanceId: "pi-winner", created: false });
    });

    it("refuses rather than choosing when the child already has two open journeys", async () => {
        mockResolveScope.mockResolvedValue({ id: null, ambiguous: true });
        const r = await ensure();
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/more than one open enrollment journey/i);
        expect(mockCreateInstance).not.toHaveBeenCalled();
    });

    it("resolves the participation itself when the caller does not hold one", async () => {
        mockEnsureParticipation.mockResolvedValue({ ocmId: "ocm-resolved", created: true });
        await ensure({ opportunityCustomerMemberId: null });
        expect(mockEnsureParticipation).toHaveBeenCalledTimes(1);
        /*
         * NO `outcomeStatusKey`. Naming one would make this a second opinion about the child's
         * disposition — and stamping `enrolling` (which Start Enrollment does, rightly, for its own
         * purpose) while the operator is sending the child to Waitlist would be a contradiction
         * written by the bootstrap itself.
         */
        expect(mockEnsureParticipation.mock.calls[0]![0].outcomeStatusKey).toBeUndefined();
        expect(mockCreateInstance.mock.calls[0]![1].contextId).toBe("ocm-resolved");
    });

    it("reports a failed create rather than returning a track that does not exist", async () => {
        mockCreateInstance.mockResolvedValue({ id: null, error: "boom" });
        const r = await ensure();
        expect(r).toEqual({ ok: false, error: "boom" });
    });

    it("requires an organization and a child", async () => {
        expect(await ensure({ customerMemberId: "  " })).toMatchObject({ ok: false });
        expect(await ensure({ orgId: "" })).toMatchObject({ ok: false });
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function read(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/**
 * INTAKE STAYS FAMILY-GRAIN.
 *
 * Asserted on the source rather than behaviourally: the guarantee is that these paths hold NO
 * reference to process-instance creation at all, which is stronger than any single scenario and is
 * the thing a future edit would break by adding one line.
 */
describe("intake does not fabricate a child track", () => {
    it("Create Lead creates no enrollment process instance", () => {
        const src = read("lib/admin/actions/entryLifecycleActions.ts");
        expect(src).not.toMatch(/createEnrollmentProcessInstance/);
        expect(src).not.toMatch(/ensureChildEnrollmentTrack/);
        expect(src).not.toMatch(/startEnrollment\(/);
    });

    it("Add Child creates no enrollment process instance", () => {
        const src = read("lib/records/addChildService.ts");
        expect(src).not.toMatch(/createEnrollmentProcessInstance/);
        expect(src).not.toMatch(/ensureChildEnrollmentTrack/);
        expect(src).not.toMatch(/startEnrollment\(/);
    });

    /**
     * The boundary is defined ONCE, in the target executor's child stage-move branch — the single
     * chokepoint outcome rules, status-entry automation, the manual transition and the waitlist
     * command all resolve to. A second ensure elsewhere would be a second boundary, reachable
     * around this one.
     */
    it("the grain crossing is the only place the track is ensured", () => {
        const src = read("lib/lifecycle/stageOutcomeRuleTargetExecutor.ts");
        expect(src).toMatch(/ensureChildEnrollmentTrack\(/);

        const callers = [
            "lib/admin/enrollmentStatus/applyEnrollmentStatusTransitionOutcomeEffects.ts",
            "lib/lifecycle/applyChildWaitlistViaOutcomeRuntime.ts",
            "lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus.ts",
        ];
        for (const rel of callers) {
            expect(read(rel), `${rel} must not ensure a track of its own`).not.toMatch(
                /ensureChildEnrollmentTrack/,
            );
        }
    });

    /**
     * Ordering matters as much as placement. The ensure sits AFTER the referential-integrity check
     * and the grain guard, so a destination that is not configured, or is family-grain, refuses
     * without a track ever being created.
     */
    it("ensures the track only after the destination has passed its guards", () => {
        const src = read("lib/lifecycle/stageOutcomeRuleTargetExecutor.ts");
        const guard = src.indexOf("assertStageMoveGrainCompatible");
        const ensureAt = src.indexOf("ensureChildEnrollmentTrack(");
        const move = src.indexOf("moveEnrollmentInstanceStageByScope(supabase");
        expect(guard).toBeGreaterThan(-1);
        expect(ensureAt).toBeGreaterThan(guard);
        expect(move).toBeGreaterThan(ensureAt);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE CROSSING ITSELF, THROUGH THE REAL EXECUTOR.
 *
 * The bootstrap is mocked to insert into the in-memory store the way the database would, so what is
 * under test is the executor's behaviour: that it ensures before it moves, that the move then lands
 * on the operator's destination, that an existing track is reused, and that a family-grain
 * destination never reaches the bootstrap at all.
 */
describe("first child-grain transition, through applyStageOutcomeRuleTarget", () => {
    type PiRow = {
        id: string;
        org_id: string;
        process_key: string;
        context_id: string;
        subject_id: string;
        stage_key: string | null;
        state: string | null;
        close_reason_key: string | null;
    };
    type OcmRow = { id: string; org_id: string; opportunity_id: string; customer_member_id: string };

    const DEPT_METADATA = {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-enrollment",
            processes: [
                {
                    id: "proc-enrollment",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: ["lead", "tour", "decision", "waitlist", "enrolling", "enrolled"].map((key, i) => ({
                        id: `stage-${key}`,
                        key,
                        label: key,
                        sort_order: i,
                        is_active: true,
                        grain: ["lead", "tour", "decision"].includes(key) ? "family" : "child",
                    })),
                },
            ],
        },
    };

    function makeSupabase(state: { process_instances: PiRow[]; ocm: OcmRow[] }) {
        return {
            from(table: string) {
                if (table === "departments") {
                    const chain: Record<string, unknown> = {};
                    chain.select = () => chain;
                    chain.eq = () => chain;
                    chain.maybeSingle = () => Promise.resolve({ data: { metadata: DEPT_METADATA }, error: null });
                    return chain;
                }
                let op: "select" | "update" = "select";
                let patch: Record<string, unknown> | null = null;
                const filters: Record<string, unknown> = {};
                const rowsFor = (): Array<Record<string, unknown>> => {
                    const src =
                        table === "process_instances" ? state.process_instances
                        : table === "opportunity_customer_members" ? state.ocm
                        : [];
                    return (src as Array<Record<string, unknown>>).filter((r) =>
                        Object.entries(filters).every(([k, v]) => r[k] === v),
                    );
                };
                const builder: Record<string, unknown> = {
                    select: () => builder,
                    update(pp: Record<string, unknown>) {
                        op = "update";
                        patch = pp;
                        return builder;
                    },
                    eq(col: string, val: unknown) {
                        filters[col] = val;
                        return builder;
                    },
                    maybeSingle() {
                        return Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
                    },
                    then(resolve: (r: { data: Array<Record<string, unknown>>; error: null }) => void) {
                        const rows = rowsFor();
                        if (op === "update" && patch) for (const r of rows) Object.assign(r, patch);
                        resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
                    },
                };
                return builder;
            },
        } as never;
    }

    const ocmRow = (id: string, childId: string): OcmRow => ({
        id,
        org_id: ORG,
        opportunity_id: LEAD,
        customer_member_id: childId,
    });

    /** Stands in for the database: the bootstrap inserts one row, or returns the existing one. */
    function bootstrapInto(state: { process_instances: PiRow[]; ocm: OcmRow[] }) {
        return vi.fn(async (_sb: unknown, args: { customerMemberId: string }) => {
            const found = state.process_instances.find((r) => r.subject_id === args.customerMemberId);
            if (found) return { ok: true as const, instanceId: found.id, created: false };
            const row: PiRow = {
                id: `pi-${args.customerMemberId}`,
                org_id: ORG,
                process_key: "enrollment",
                context_id: LEAD,
                subject_id: args.customerMemberId,
                // Created with NO position. The move writes the destination.
                stage_key: null,
                state: null,
                close_reason_key: null,
            };
            state.process_instances.push(row);
            return { ok: true as const, instanceId: row.id, created: true };
        });
    }

    async function move(
        state: { process_instances: PiRow[]; ocm: OcmRow[] },
        ocmId: string,
        destination: string,
        bootstrap: ReturnType<typeof bootstrapInto>,
    ) {
        vi.doMock("@/lib/lifecycle/ensureChildEnrollmentTrack", () => ({
            ensureChildEnrollmentTrack: bootstrap,
            CHILD_TRACK_BOOTSTRAP_SOURCE: "child_stage_entry",
        }));
        vi.resetModules();
        const { applyStageOutcomeRuleTarget } = await import(
            "@/lib/lifecycle/stageOutcomeRuleTargetExecutor"
        );
        return applyStageOutcomeRuleTarget(makeSupabase(state), {
            orgId: ORG,
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "lead",
            plan: {} as never,
            subject: {
                journey_segment: "child",
                opportunity_id: LEAD,
                opportunity_customer_member_id: ocmId,
            } as never,
            target: { kind: "move_to_stage", stage_key: destination } as never,
        });
    }

    beforeEach(() => {
        vi.resetModules();
        vi.doUnmock("@/lib/lifecycle/ensureChildEnrollmentTrack");
    });

    it("Lead -> Waitlist: the track is created and lands AT Waitlist", async () => {
        const state = { process_instances: [] as PiRow[], ocm: [ocmRow("ocm-A", "child-A")] };
        const bootstrap = bootstrapInto(state);
        const res = await move(state, "ocm-A", "waitlist", bootstrap);
        expect(res.error).toBeUndefined();
        expect(bootstrap).toHaveBeenCalledTimes(1);
        expect(state.process_instances).toHaveLength(1);
        expect(state.process_instances[0]!.stage_key).toBe("waitlist");
    });

    /** The rule is the GRAIN of the destination, never the name of one stage. */
    it("Lead -> Enrolling: the same crossing, a different destination", async () => {
        const state = { process_instances: [] as PiRow[], ocm: [ocmRow("ocm-A", "child-A")] };
        const bootstrap = bootstrapInto(state);
        const res = await move(state, "ocm-A", "enrolling", bootstrap);
        expect(res.error).toBeUndefined();
        expect(state.process_instances[0]!.stage_key).toBe("enrolling");
    });

    it("an existing track is reused, not duplicated", async () => {
        const state = {
            process_instances: [
                {
                    id: "pi-A",
                    org_id: ORG,
                    process_key: "enrollment",
                    context_id: LEAD,
                    subject_id: "child-A",
                    stage_key: "waitlist",
                    state: null,
                    close_reason_key: null,
                } as PiRow,
            ],
            ocm: [ocmRow("ocm-A", "child-A")],
        };
        const bootstrap = bootstrapInto(state);
        await move(state, "ocm-A", "enrolling", bootstrap);
        expect(state.process_instances).toHaveLength(1);
        expect(state.process_instances[0]!.stage_key).toBe("enrolling");
    });

    it("a sibling still in the family segment gets no track of their own", async () => {
        const state = {
            process_instances: [] as PiRow[],
            ocm: [ocmRow("ocm-A", "child-A"), ocmRow("ocm-B", "child-B")],
        };
        const bootstrap = bootstrapInto(state);
        await move(state, "ocm-A", "waitlist", bootstrap);
        expect(state.process_instances.map((r) => r.subject_id)).toEqual(["child-A"]);
    });

    it("a refused bootstrap refuses the move — no stage is written", async () => {
        const state = { process_instances: [] as PiRow[], ocm: [ocmRow("ocm-A", "child-A")] };
        const bootstrap = vi.fn(async () => ({ ok: false as const, error: "two open journeys" }));
        const res = await move(state, "ocm-A", "waitlist", bootstrap as never);
        expect(res.error).toBe("two open journeys");
        expect(state.process_instances).toHaveLength(0);
    });
});
