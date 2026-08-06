/**
 * Per-child Decision execution invariants.
 *
 * Fixture-based end to end: a real family case row, three real child `process_instances` rows, and
 * the real seam. No live tenant, no operational data.
 *
 * Every assertion here is about what must NOT happen. Sibling rows and the family row are compared
 * BYTE-IDENTICAL (deep-equal against a snapshot taken before the call) rather than field-by-field,
 * because a field-by-field check only ever proves the fields someone remembered to list.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { executeParticipantDecisionForChild } from "@/lib/lifecycle/executeParticipantDecisionForChild";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const EMMA = "aaaaaaaa-0000-4000-8000-00000000000a";
const LIAM = "aaaaaaaa-0000-4000-8000-00000000000b";
const NOAH = "aaaaaaaa-0000-4000-8000-00000000000c";

type PiRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_id: string;
    context_id: string;
    stage_key: string | null;
    stage_entered_at: string | null;
    state: string | null;
    close_reason_key: string | null;
    updated_at: string | null;
};

type OppRow = {
    id: string;
    org_id: string;
    stage_key: string;
    status_key: string;
    close_reason_key: string | null;
    stage_entered_at: string | null;
    metadata: Record<string, unknown>;
    updated_at: string | null;
};

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
                stages: [
                    { key: "lead", grain: "family" },
                    { key: "tour", grain: "family" },
                    { key: "decision", grain: "family" },
                    { key: "waitlist", grain: "child" },
                    { key: "enrolling", grain: "child" },
                    { key: "enrolled", grain: "child" },
                    { key: "closed", grain: "family" },
                    { key: "closed_withdrawn", grain: "child" },
                ].map((s, i) => ({ id: `stage-${s.key}`, key: s.key, label: s.key, grain: s.grain, sort_order: i, is_active: true })),
            },
        ],
    },
};

const PLAN = parseStageOperatingPlanV1({
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "decision",
    journey_segment: "family",
    work_templates: [
        {
            template_key: "review_child_paths",
            label: "Review each child's path",
            required: true,
            due_policy: { kind: "offset_days", days: 2 },
            owner_strategy: "record_owner",
            completion_policy: { requires_all_participants_resolved: true },
            participant_decisions: [
                {
                    decision_key: "child_waitlist",
                    action_ref: "waitlist_child",
                    label: "Waitlist",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        { kind: "move_to_stage", stage_key: "waitlist" },
                    ],
                },
                {
                    decision_key: "child_begin_enrolling",
                    action_ref: "enroll_child",
                    label: "Begin Enrolling",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                        { kind: "move_to_stage", stage_key: "enrolling" },
                    ],
                },
                {
                    decision_key: "child_not_enrolling",
                    action_ref: "update_child_enrollment_status",
                    label: "Not Enrolling",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                        { kind: "move_to_stage", stage_key: "closed_withdrawn" },
                    ],
                    required_inputs: [
                        {
                            key: "close_reason_key",
                            label: "Reason",
                            type: "select",
                            required: true,
                            binds_to_target_field: "close_reason_key",
                            options: [
                                { value: "chose_another_provider", label: "Chose another provider" },
                                { value: "no_capacity", label: "No suitable capacity" },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
    outcomes: [{ outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true }],
    outcome_rules: [],
    attention_rules: [],
})!;

function piRow(id: string, subjectId: string): PiRow {
    return {
        id,
        org_id: ORG,
        process_key: "enrollment",
        subject_id: subjectId,
        context_id: LEAD,
        stage_key: "decision",
        stage_entered_at: "2026-08-01T00:00:00.000Z",
        state: null,
        close_reason_key: null,
        updated_at: "2026-08-01T00:00:00.000Z",
    };
}

type World = {
    process_instances: PiRow[];
    opportunities: OppRow[];
    customer_members: Array<{ id: string; org_id: string; first_name: string; last_name: string }>;
};

function makeWorld(): World {
    return {
        process_instances: [piRow("pi-emma", EMMA), piRow("pi-liam", LIAM), piRow("pi-noah", NOAH)],
        opportunities: [
            {
                id: LEAD,
                org_id: ORG,
                stage_key: "decision",
                status_key: "open",
                close_reason_key: null,
                stage_entered_at: "2026-08-01T00:00:00.000Z",
                metadata: {},
                updated_at: "2026-08-01T00:00:00.000Z",
            },
        ],
        customer_members: [
            { id: EMMA, org_id: ORG, first_name: "Emma", last_name: "Rivera" },
            { id: LIAM, org_id: ORG, first_name: "Liam", last_name: "Rivera" },
            { id: NOAH, org_id: ORG, first_name: "Noah", last_name: "Rivera" },
        ],
    };
}

/** Chainable in-memory Supabase over the three tables the seam touches. */
function makeSupabase(world: World, opts?: { failStageMove?: boolean }) {
    return {
        from(table: string) {
            if (table === "departments") {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = () =>
                    Promise.resolve({ data: { metadata: DEPT_METADATA }, error: null });
                return chain;
            }
            let op: "select" | "update" = "select";
            let patch: Record<string, unknown> | null = null;
            const filters: Record<string, unknown> = {};
            const inFilters: Array<[string, unknown[]]> = [];
            const src = (): Array<Record<string, unknown>> =>
                (world as unknown as Record<string, Array<Record<string, unknown>>>)[table] ?? [];
            const rowsFor = () =>
                src().filter(
                    (r) =>
                        Object.entries(filters).every(([k, v]) => r[k] === v)
                        && inFilters.every(([k, vs]) => vs.includes(r[k])),
                );
            const applyUpdate = () => {
                const rows = rowsFor();
                // A stage-move failure is simulated as a REJECTED write, not as a silent no-op —
                // the no-op case has its own test.
                if (
                    opts?.failStageMove
                    && table === "process_instances"
                    && patch
                    && "stage_key" in patch
                    && patch.stage_key !== "decision"
                ) {
                    return { rows: [], error: { message: "simulated stage move failure" } };
                }
                if (patch) for (const r of rows) Object.assign(r, patch);
                return { rows, error: null };
            };
            const builder: Record<string, unknown> = {
                select: () => builder,
                update(p: Record<string, unknown>) {
                    op = "update";
                    patch = p;
                    return builder;
                },
                eq(col: string, val: unknown) {
                    filters[col] = val;
                    return builder;
                },
                in(col: string, vals: unknown[]) {
                    inFilters.push([col, vals]);
                    return builder;
                },
                maybeSingle() {
                    if (op === "update") {
                        const { rows, error } = applyUpdate();
                        return Promise.resolve({ data: rows[0] ?? null, error });
                    }
                    return Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
                },
                then(resolve: (r: { data: unknown; error: unknown }) => void) {
                    if (op === "update") {
                        const { rows, error } = applyUpdate();
                        resolve({ data: error ? null : rows.map((r) => ({ id: r.id })), error });
                        return;
                    }
                    resolve({ data: rowsFor(), error: null });
                },
            };
            return builder;
        },
    } as never;
}

function run(
    world: World,
    params: {
        decisionKey: string;
        customerMemberId?: string | null;
        processInstanceId?: string | null;
        label?: string;
        inputValues?: Record<string, unknown>;
        supabase?: ReturnType<typeof makeSupabase>;
    },
) {
    return executeParticipantDecisionForChild({
        supabase: params.supabase ?? makeSupabase(world),
        orgId: ORG,
        userId: "user-1",
        departmentId: "dept-1",
        stageKey: "decision",
        plan: PLAN,
        templateKey: "review_child_paths",
        decisionKey: params.decisionKey,
        opportunityId: LEAD,
        childIdentity: {
            customer_member_id: params.customerMemberId ?? null,
            process_instance_id: params.processInstanceId ?? null,
        },
        participantLabel: params.label ?? null,
        inputValues: params.inputValues ?? null,
    });
}

const snapshot = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rowOf = (w: World, id: string) => w.process_instances.find((r) => r.subject_id === id)!;

// FILE scope, not per-describe. The waitlist placement hook reads tables this fixture does not
// model; disabling it in one describe left the others exercising it, which is what first surfaced
// the unguarded-throw defect in the target executor.
const PLACEMENT_HOOK_PREV = process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED;
beforeAll(() => {
    process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = "1";
});
afterAll(() => {
    process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = PLACEMENT_HOOK_PREV;
});

describe("per-child Decision — sibling and family protection", () => {
    it("waitlisting Emma leaves Liam and Noah byte-identical", async () => {
        const world = makeWorld();
        const liamBefore = snapshot(rowOf(world, LIAM));
        const noahBefore = snapshot(rowOf(world, NOAH));

        const result = await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });

        expect(result.ok).toBe(true);
        expect(rowOf(world, EMMA).state).toBe("waitlisted");
        expect(rowOf(world, EMMA).stage_key).toBe("waitlist");
        expect(rowOf(world, LIAM)).toEqual(liamBefore);
        expect(rowOf(world, NOAH)).toEqual(noahBefore);
    });

    it("waitlisting Emma leaves the family case byte-identical", async () => {
        const world = makeWorld();
        const familyBefore = snapshot(world.opportunities[0]);

        await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });

        expect(world.opportunities[0]).toEqual(familyBefore);
        expect(world.opportunities[0].stage_key).toBe("decision");
        expect(world.opportunities[0].status_key).toBe("open");
    });

    it("beginning enrollment for Liam preserves Emma's waitlisted track", async () => {
        const world = makeWorld();
        await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });
        const emmaAfterWaitlist = snapshot(rowOf(world, EMMA));

        const result = await run(world, {
            decisionKey: "child_begin_enrolling",
            customerMemberId: LIAM,
            label: "Liam",
        });

        expect(result.ok).toBe(true);
        expect(rowOf(world, LIAM).state).toBe("enrolling");
        expect(rowOf(world, LIAM).stage_key).toBe("enrolling");
        expect(rowOf(world, EMMA)).toEqual(emmaAfterWaitlist);
    });

    it("closing Noah leaves active siblings and the family open", async () => {
        const world = makeWorld();
        await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });
        await run(world, { decisionKey: "child_begin_enrolling", customerMemberId: LIAM, label: "Liam" });
        const familyBefore = snapshot(world.opportunities[0]);

        const result = await run(world, {
            decisionKey: "child_not_enrolling",
            customerMemberId: NOAH,
            label: "Noah",
            inputValues: { close_reason_key: "no_capacity" },
        });

        expect(result.ok).toBe(true);
        expect(rowOf(world, NOAH).state).toBe("not_enrolling");
        expect(rowOf(world, NOAH).stage_key).toBe("closed_withdrawn");
        expect(rowOf(world, EMMA).state).toBe("waitlisted");
        expect(rowOf(world, LIAM).state).toBe("enrolling");
        expect(world.opportunities[0]).toEqual(familyBefore);
    });
});

describe("per-child Decision — explicit child identity", () => {
    it("refuses with no child named, and mutates nothing", async () => {
        const world = makeWorld();
        const before = snapshot(world);

        const result = await run(world, { decisionKey: "child_waitlist" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("child_identity_required");
        expect(world).toEqual(before);
    });

    it("refuses to infer a child from a participation id alone — never fans out", async () => {
        const world = makeWorld();
        const before = snapshot(world);

        const result = await run(world, { decisionKey: "child_waitlist", processInstanceId: "pi-emma" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("child_identity_ambiguous");
        // The decisive proof: nothing moved. A fan-out implementation would have written all three.
        expect(world).toEqual(before);
        expect(world.process_instances.every((r) => r.state === null)).toBe(true);
    });

    it("refuses a child with no enrollment track rather than reporting a phantom success", async () => {
        const world = makeWorld();
        world.process_instances = world.process_instances.filter((r) => r.subject_id !== EMMA);

        const result = await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("participant_not_found");
        expect(result.ok === false && result.message).toContain("Emma");
    });
});

describe("per-child Decision — write-count contract", () => {
    it("treats a duplicate enrollment track as an integrity failure, not a success", async () => {
        const world = makeWorld();
        // Two instances for the same child under the same lead: the scope now matches both.
        world.process_instances.push({ ...piRow("pi-emma-dup", EMMA) });

        const result = await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("write_count_violation");
        expect(result.ok === false && result.write_error?.code).toBe("participant_write_ambiguous");
        expect(result.ok === false && result.write_error?.moved).toBe(2);
        expect(result.ok === false && result.message).toContain("more than one");
    });
});

describe("per-child Decision — regression guard", () => {
    it("refuses to move an enrolled child back to waitlist or enrolling", async () => {
        const world = makeWorld();
        rowOf(world, EMMA).state = "enrolled";
        rowOf(world, EMMA).stage_key = "enrolled";
        const before = snapshot(rowOf(world, EMMA));

        const waitlist = await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });
        const enrolling = await run(world, {
            decisionKey: "child_begin_enrolling",
            customerMemberId: EMMA,
            label: "Emma",
        });

        expect(waitlist.ok).toBe(false);
        expect(waitlist.ok === false && waitlist.code).toBe("transition_refused");
        expect(waitlist.ok === false && waitlist.message).toContain("already enrolled");
        expect(enrolling.ok).toBe(false);
        expect(rowOf(world, EMMA)).toEqual(before);
    });

    it("refuses to implicitly reopen a closed child track", async () => {
        const world = makeWorld();
        rowOf(world, NOAH).state = "not_enrolling";
        rowOf(world, NOAH).stage_key = "closed_withdrawn";
        const before = snapshot(rowOf(world, NOAH));

        const result = await run(world, { decisionKey: "child_waitlist", customerMemberId: NOAH, label: "Noah" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("transition_refused");
        expect(result.ok === false && result.message).toContain("already closed");
        expect(rowOf(world, NOAH)).toEqual(before);
    });

    it("fails closed on an unrecognized current state", async () => {
        const world = makeWorld();
        rowOf(world, EMMA).state = "something_the_platform_never_taught";
        const before = snapshot(rowOf(world, EMMA));

        const result = await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("transition_refused");
        expect(rowOf(world, EMMA)).toEqual(before);
    });

    it("is idempotent for an identical repeat — no second write", async () => {
        const world = makeWorld();
        await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });
        const afterFirst = snapshot(rowOf(world, EMMA));

        const second = await run(world, { decisionKey: "child_waitlist", customerMemberId: EMMA, label: "Emma" });

        expect(second.ok).toBe(true);
        expect(second.ok === true && second.changed).toBe(false);
        // Byte-identical, so `updated_at` and `stage_entered_at` were not re-stamped either.
        expect(rowOf(world, EMMA)).toEqual(afterFirst);
    });
});

describe("per-child Decision — required-input binding", () => {
    it("requires the configured close reason and refuses without it", async () => {
        const world = makeWorld();
        const before = snapshot(world);

        const result = await run(world, {
            decisionKey: "child_not_enrolling",
            customerMemberId: NOAH,
            label: "Noah",
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("inputs_invalid");
        expect(result.ok === false && result.input_issues?.[0]?.code).toBe("required_missing");
        expect(world).toEqual(before);
    });

    it("refuses a value outside the configured options", async () => {
        const world = makeWorld();
        const result = await run(world, {
            decisionKey: "child_not_enrolling",
            customerMemberId: NOAH,
            inputValues: { close_reason_key: "made_up_reason" },
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.input_issues?.[0]?.code).toBe("not_a_configured_option");
    });

    it("persists the operator's reason on that child's process instance only", async () => {
        const world = makeWorld();

        await run(world, {
            decisionKey: "child_not_enrolling",
            customerMemberId: NOAH,
            label: "Noah",
            inputValues: { close_reason_key: "chose_another_provider" },
        });

        expect(rowOf(world, NOAH).close_reason_key).toBe("chose_another_provider");
        // Never copied to siblings.
        expect(rowOf(world, EMMA).close_reason_key).toBeNull();
        expect(rowOf(world, LIAM).close_reason_key).toBeNull();
    });
});

describe("per-child Decision — failure containment and refresh contract", () => {
    it("a failed child write leaves the family and siblings unchanged", async () => {
        const world = makeWorld();
        const familyBefore = snapshot(world.opportunities[0]);
        const liamBefore = snapshot(rowOf(world, LIAM));
        const noahBefore = snapshot(rowOf(world, NOAH));

        const result = await run(world, {
            decisionKey: "child_waitlist",
            customerMemberId: EMMA,
            label: "Emma",
            supabase: makeSupabase(world, { failStageMove: true }),
        });

        expect(result.ok).toBe(false);
        expect(world.opportunities[0]).toEqual(familyBefore);
        expect(rowOf(world, LIAM)).toEqual(liamBefore);
        expect(rowOf(world, NOAH)).toEqual(noahBefore);
        // Emma's own state was compensated back — the saga unwound the disposition write that
        // succeeded before the stage move failed.
        expect(rowOf(world, EMMA).state).toBeNull();
    });

    it("names both the family and the affected child so callers can refresh both", async () => {
        const world = makeWorld();
        const result = await run(world, {
            decisionKey: "child_waitlist",
            customerMemberId: EMMA,
            label: "Emma",
        });

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.affected).toEqual({
            opportunity_id: LEAD,
            customer_member_id: EMMA,
            process_instance_id: "pi-emma",
        });
    });
});

describe("a terminal child path needs no stage, and no stage list", () => {
    /**
     * A child stops pursuing enrollment through DURABLE STATE, not by being filed in a stage.
     * Firefly's Not Enrolling is configured with a disposition and a required reason and NO
     * movement target — the shape this proves. Nothing in the platform requires a
     * `closed_withdrawn` stage to exist for that to work.
     */
    const NO_MOVEMENT_PLAN = parseStageOperatingPlanV1({
        ...JSON.parse(JSON.stringify(PLAN)),
        work_templates: [
            {
                ...JSON.parse(JSON.stringify(PLAN.work_templates[0])),
                participant_decisions: [
                    {
                        decision_key: "child_not_enrolling",
                        action_ref: "update_child_enrollment_status",
                        label: "Not Enrolling",
                        subject_grain: "child",
                        targets: [
                            { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                        ],
                        required_inputs: [
                            {
                                key: "close_reason_key",
                                label: "Reason",
                                type: "select",
                                required: true,
                                binds_to_target_field: "close_reason_key",
                                options: [{ value: "cost", label: "Cost" }],
                            },
                        ],
                    },
                ],
            },
        ],
    })!;

    const runNoMovement = (world: World, values?: Record<string, unknown>) =>
        executeParticipantDecisionForChild({
            supabase: makeSupabase(world),
            orgId: ORG,
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "decision",
            plan: NO_MOVEMENT_PLAN,
            templateKey: "review_child_paths",
            decisionKey: "child_not_enrolling",
            opportunityId: LEAD,
            childIdentity: { customer_member_id: NOAH },
            participantLabel: "Noah",
            inputValues: values ?? { close_reason_key: "cost" },
        });

    it("parses and executes with no movement target at all", async () => {
        const world = makeWorld();
        expect(NO_MOVEMENT_PLAN.work_templates[0]!.participant_decisions![0]!.targets).toHaveLength(1);

        const result = await runNoMovement(world);

        expect(result.ok).toBe(true);
        expect(rowOf(world, NOAH).state).toBe("not_enrolling");
        expect(rowOf(world, NOAH).close_reason_key).toBe("cost");
        // The child never moved — the stage they were on is untouched.
        expect(rowOf(world, NOAH).stage_key).toBe("decision");
    });

    it("still requires the reason, and still leaves family and siblings alone", async () => {
        const world = makeWorld();
        const familyBefore = snapshot(world.opportunities[0]);
        const emmaBefore = snapshot(rowOf(world, EMMA));

        const refused = await runNoMovement(world, {});
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.code).toBe("inputs_invalid");

        const done = await runNoMovement(world);
        expect(done.ok).toBe(true);
        expect(world.opportunities[0]).toEqual(familyBefore);
        expect(world.opportunities[0].status_key).toBe("open");
        expect(rowOf(world, EMMA)).toEqual(emmaBefore);
    });
});

describe("per-child Decision — configuration is consumed, not hardcoded", () => {
    it("routes to whatever stage and disposition configuration names", async () => {
        const world = makeWorld();
        // Re-point "Waitlist" at a DIFFERENT configured child stage and disposition.
        const rewired = parseStageOperatingPlanV1({
            ...JSON.parse(JSON.stringify(PLAN)),
            work_templates: [
                {
                    ...JSON.parse(JSON.stringify(PLAN.work_templates[0])),
                    participant_decisions: [
                        {
                            decision_key: "child_waitlist",
                            action_ref: "waitlist_child",
                            label: "Waitlist",
                            subject_grain: "child",
                            targets: [
                                { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                                { kind: "move_to_stage", stage_key: "enrolling" },
                            ],
                        },
                    ],
                },
            ],
        })!;

        const result = await executeParticipantDecisionForChild({
            supabase: makeSupabase(world),
            orgId: ORG,
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "decision",
            plan: rewired,
            templateKey: "review_child_paths",
            decisionKey: "child_waitlist",
            opportunityId: LEAD,
            childIdentity: { customer_member_id: EMMA },
            participantLabel: "Emma",
        });

        expect(result.ok).toBe(true);
        // The decision is still keyed "child_waitlist" — but nothing in the runtime believes that
        // means the waitlist stage.
        expect(rowOf(world, EMMA).state).toBe("enrolling");
        expect(rowOf(world, EMMA).stage_key).toBe("enrolling");
    });

    it("refuses a decision key configuration does not define", async () => {
        const world = makeWorld();
        const result = await run(world, { decisionKey: "not_configured", customerMemberId: EMMA });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("decision_not_configured");
    });
});
