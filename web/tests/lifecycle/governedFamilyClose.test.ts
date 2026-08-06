/**
 * Governed family close — execution invariants.
 *
 * Fixture-based end to end against the real seam: a real family case row, real child
 * `process_instances` rows, the real planner, the real target executor and the real saga. No live
 * tenant, no operational data.
 *
 * The family row and unaffected child rows are compared BYTE-IDENTICAL against snapshots taken
 * before the call, because a field-by-field check only proves the fields someone remembered.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
    executeGovernedFamilyClose,
    previewGovernedFamilyClose,
} from "@/lib/lifecycle/executeGovernedFamilyClose";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * Only the downstream EVENT is stubbed, not the status write.
 *
 * `updateOpportunityStatusWithEvent` writes the opportunity row through the injected client — which
 * is what these tests need to observe — and then emits a workflow event that reaches for a real
 * Supabase connection. Mocking the whole status helper (as some neighbouring suites do) would make
 * "the family closed" unobservable and the assertions vacuous. Mocking the emission alone keeps the
 * durable write real and removes only the side effect this fixture cannot host.
 */
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn(async () => ({ eventEmitted: false })),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const EMMA = "aaaaaaaa-0000-4000-8000-00000000000a";
const LIAM = "aaaaaaaa-0000-4000-8000-00000000000b";
const SOPHIA = "aaaaaaaa-0000-4000-8000-00000000000c";

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
                    { key: "decision", grain: "family" },
                    { key: "waitlist", grain: "child" },
                    { key: "enrolling", grain: "child" },
                    { key: "enrolled", grain: "child" },
                    { key: "closed", grain: "family" },
                    { key: "closed_withdrawn", grain: "child" },
                ].map((s, i) => ({
                    id: `stage-${s.key}`,
                    key: s.key,
                    label: s.key,
                    grain: s.grain,
                    sort_order: i,
                    is_active: true,
                })),
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
            family_close: {
                action_ref: "close_lead",
                label: "Close Family",
                child_outcome_label: "Not Enrolling",
                child_targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                    { kind: "move_to_stage", stage_key: "closed_withdrawn" },
                ],
                family_targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "move_to_stage", stage_key: "closed" },
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
        },
    ],
    outcomes: [{ outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true }],
    outcome_rules: [],
    attention_rules: [],
})!;

function piRow(id: string, subjectId: string, state: string | null, stage = "decision"): PiRow {
    return {
        id,
        org_id: ORG,
        process_key: "enrollment",
        subject_id: subjectId,
        context_id: LEAD,
        stage_key: stage,
        stage_entered_at: "2026-08-01T00:00:00.000Z",
        state,
        close_reason_key: null,
        updated_at: "2026-08-01T00:00:00.000Z",
    };
}

type World = {
    process_instances: PiRow[];
    opportunities: OppRow[];
    customer_members: Array<{ id: string; org_id: string; first_name: string; last_name: string }>;
};

function makeWorld(instances: PiRow[]): World {
    return {
        process_instances: instances,
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
            { id: SOPHIA, org_id: ORG, first_name: "Sophia", last_name: "Rivera" },
        ],
    };
}

type FailMode = { failChildStageMove?: boolean; failFamilyStatus?: boolean; blockUndo?: boolean };

function makeSupabase(world: World, fail: FailMode = {}) {
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
                if (
                    fail.failChildStageMove
                    && table === "process_instances"
                    && patch
                    && "stage_key" in patch
                    && patch.stage_key === "closed_withdrawn"
                ) {
                    return { rows: [], error: { message: "simulated child stage move failure" } };
                }
                if (
                    fail.failFamilyStatus
                    && table === "opportunities"
                    && patch
                    && "status_key" in patch
                    && patch.status_key === "closed"
                ) {
                    return { rows: [], error: { message: "simulated family status failure" } };
                }
                // A compensation that cannot be applied — the integrity-breach path.
                //
                // The child's inverse restores its ORIGINAL stage (`waitlist`), which the forward
                // path never writes, so this condition can only ever match a compensation. An
                // earlier version blocked `state === null` and matched nothing: Emma's prior state
                // was `waitlisted`, so her undo restored that, not null.
                if (
                    fail.blockUndo
                    && table === "process_instances"
                    && patch
                    && "stage_key" in patch
                    && patch.stage_key === "waitlist"
                ) {
                    return { rows: [], error: { message: "simulated compensation failure" } };
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

function close(world: World, opts: { reason?: string; fail?: FailMode } = {}) {
    return executeGovernedFamilyClose({
        supabase: makeSupabase(world, opts.fail ?? {}),
        orgId: ORG,
        userId: "user-1",
        departmentId: "dept-1",
        stageKey: "decision",
        plan: PLAN,
        templateKey: "review_child_paths",
        opportunityId: LEAD,
        inputValues:
            opts.reason === undefined ? { close_reason_key: "chose_another_provider" }
            : opts.reason === "" ? {}
            : { close_reason_key: opts.reason },
    });
}

const snap = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const child = (w: World, id: string) => w.process_instances.find((r) => r.subject_id === id)!;
const family = (w: World) => w.opportunities[0]!;

describe("governed family close", () => {
    const prev = process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED;
    beforeAll(() => {
        process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = "1";
    });
    afterAll(() => {
        process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = prev;
    });

    it("closes one active child, and the family", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted", "waitlist")]);

        const result = await close(world);

        expect(result.ok).toBe(true);
        expect(child(world, EMMA).state).toBe("not_enrolling");
        expect(child(world, EMMA).stage_key).toBe("closed_withdrawn");
        expect(child(world, EMMA).close_reason_key).toBe("chose_another_provider");
        expect(family(world).status_key).toBe("closed");
        expect(family(world).stage_key).toBe("closed");
    });

    it("closes multiple active children in one operation", async () => {
        const world = makeWorld([
            piRow("pi-emma", EMMA, "waitlisted", "waitlist"),
            piRow("pi-liam", LIAM, "enrolling", "enrolling"),
            piRow("pi-sophia", SOPHIA, null),
        ]);

        const result = await close(world);

        expect(result.ok).toBe(true);
        for (const id of [EMMA, LIAM, SOPHIA]) {
            expect(child(world, id).state).toBe("not_enrolling");
            expect(child(world, id).stage_key).toBe("closed_withdrawn");
            expect(child(world, id).close_reason_key).toBe("chose_another_provider");
        }
        expect(family(world).status_key).toBe("closed");
    });

    it("succeeds with zero children", async () => {
        const world = makeWorld([]);

        const result = await close(world);

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.affected.children).toEqual([]);
        expect(family(world).status_key).toBe("closed");
        expect(family(world).stage_key).toBe("closed");
    });

    it("skips children that are already terminal, without rewriting them", async () => {
        const world = makeWorld([
            piRow("pi-emma", EMMA, "waitlisted", "waitlist"),
            piRow("pi-sophia", SOPHIA, "withdrawn", "closed_withdrawn"),
        ]);
        const sophiaBefore = snap(child(world, SOPHIA));

        const result = await close(world);

        expect(result.ok).toBe(true);
        expect(child(world, EMMA).state).toBe("not_enrolling");
        // Byte-identical: not re-stamped, not given the new close reason, not re-moved.
        expect(child(world, SOPHIA)).toEqual(sophiaBefore);
        expect(result.ok === true && result.plan.skipped.map((c) => c.label)).toEqual(["Sophia Rivera"]);
        expect(result.ok === true && result.affected.children.map((c) => c.customer_member_id)).toEqual([EMMA]);
    });

    it("hard-blocks on an enrolled child, with no override and nothing written", async () => {
        const world = makeWorld([
            piRow("pi-emma", EMMA, "enrolled", "enrolled"),
            piRow("pi-liam", LIAM, "waitlisted", "waitlist"),
        ]);
        const before = snap(world);

        const result = await close(world);

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("blocked");
        expect(result.ok === false && result.blocks?.[0]?.code).toBe("child_enrolled");
        expect(result.ok === false && result.message).toContain("Emma Rivera is already enrolled");
        expect(result.ok === false && result.message).toContain("This family cannot be closed");
        expect(result.ok === false && result.message).toContain("enrolled-child process");
        // The live sibling was NOT closed on the way to discovering the block.
        expect(world).toEqual(before);
    });

    it("fails closed on an unrecognized child state", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "some_state_never_taught")]);
        const before = snap(world);

        const result = await close(world);

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.blocks?.[0]?.code).toBe("child_state_unknown");
        expect(world).toEqual(before);
    });

    it("fails closed when the children cannot be enumerated", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted")]);
        const supabase = {
            from(table: string) {
                if (table === "process_instances") {
                    const chain: Record<string, unknown> = {};
                    chain.select = () => chain;
                    chain.eq = () => chain;
                    chain.then = (r: (v: { data: unknown; error: unknown }) => void) =>
                        r({ data: null, error: { message: "boom" } });
                    return chain;
                }
                return (makeSupabase(world) as unknown as { from: (t: string) => unknown }).from(table);
            },
        } as never;

        const plan = await previewGovernedFamilyClose({ supabase, orgId: ORG, opportunityId: LEAD });

        expect(plan.allowed).toBe(false);
        expect(plan.blocks[0]?.code).toBe("children_unreadable");
        expect(family(world).status_key).toBe("open");
    });

    it("requires the configured close reason", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted")]);
        const before = snap(world);

        const result = await close(world, { reason: "" });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("inputs_invalid");
        expect(result.ok === false && result.input_issues?.[0]?.code).toBe("required_missing");
        expect(world).toEqual(before);
    });

    it("refuses a reason outside the configured options", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted")]);
        const result = await close(world, { reason: "made_up" });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.input_issues?.[0]?.code).toBe("not_a_configured_option");
    });

    it("keeps the family open when a child write fails, and reverts the children", async () => {
        const world = makeWorld([
            piRow("pi-emma", EMMA, "waitlisted", "waitlist"),
            piRow("pi-liam", LIAM, "enrolling", "enrolling"),
        ]);
        const familyBefore = snap(family(world));

        const result = await close(world, { fail: { failChildStageMove: true } });

        expect(result.ok).toBe(false);
        expect(family(world)).toEqual(familyBefore);
        expect(family(world).status_key).toBe("open");
        expect(family(world).stage_key).toBe("decision");
        // The disposition write that landed before the stage move failed was compensated.
        expect(child(world, EMMA).state).toBe("waitlisted");
        expect(child(world, LIAM).state).toBe("enrolling");
    });

    it("reverts the children when the family write fails", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted", "waitlist")]);
        const familyBefore = snap(family(world));

        const result = await close(world, { fail: { failFamilyStatus: true } });

        expect(result.ok).toBe(false);
        expect(family(world)).toEqual(familyBefore);
        expect(child(world, EMMA).state).toBe("waitlisted");
        expect(child(world, EMMA).stage_key).toBe("waitlist");
    });

    it("reports integrity_breach when compensation cannot be applied, and never reports success", async () => {
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted", "waitlist")]);

        const result = await close(world, {
            fail: { failFamilyStatus: true, blockUndo: true },
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.integrity_breach).toBeTruthy();
        expect(result.ok === false && result.changed).toBe(true);
        expect(result.ok === false && result.transaction?.outcome).toBe("partially_committed");
    });

    it("names the family and every affected child for refresh", async () => {
        const world = makeWorld([
            piRow("pi-emma", EMMA, "waitlisted", "waitlist"),
            piRow("pi-liam", LIAM, "enrolling", "enrolling"),
        ]);

        const result = await close(world);

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.affected).toEqual({
            opportunity_id: LEAD,
            children: [
                { customer_member_id: EMMA, process_instance_id: "pi-emma" },
                { customer_member_id: LIAM, process_instance_id: "pi-liam" },
            ],
        });
    });

    it("previews exactly who is affected, with no hidden cascade", async () => {
        const world = makeWorld([
            piRow("pi-emma", EMMA, "waitlisted", "waitlist"),
            piRow("pi-liam", LIAM, null),
            piRow("pi-sophia", SOPHIA, "not_enrolling", "closed_withdrawn"),
        ]);

        const plan = await previewGovernedFamilyClose({
            supabase: makeSupabase(world),
            orgId: ORG,
            opportunityId: LEAD,
        });

        expect(plan.allowed).toBe(true);
        expect(plan.closing.map((c) => c.label)).toEqual(["Emma Rivera", "Liam Rivera"]);
        expect(plan.skipped.map((c) => c.label)).toEqual(["Sophia Rivera"]);
        // Preview writes nothing.
        expect(family(world).status_key).toBe("open");
        expect(child(world, EMMA).state).toBe("waitlisted");
    });
});

describe("governed family close — configuration is consumed, not hardcoded", () => {
    const prev = process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED;
    beforeAll(() => {
        process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = "1";
    });
    afterAll(() => {
        process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = prev;
    });

    it("routes children and the family to whatever stages and states configuration names", async () => {
        const rewired = parseStageOperatingPlanV1({
            ...JSON.parse(JSON.stringify(PLAN)),
            work_templates: [
                {
                    ...JSON.parse(JSON.stringify(PLAN.work_templates[0])),
                    family_close: {
                        action_ref: "close_lead",
                        label: "End this lead",
                        child_outcome_label: "Withdrawn",
                        child_targets: [
                            { kind: "update_child_enrollment_status", disposition_key: "withdrawn" },
                            { kind: "move_to_stage", stage_key: "closed_withdrawn" },
                        ],
                        family_targets: [{ kind: "update_family_case_status", status_key: "closed" }],
                    },
                },
            ],
        })!;
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted", "waitlist")]);

        const result = await executeGovernedFamilyClose({
            supabase: makeSupabase(world),
            orgId: ORG,
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "decision",
            plan: rewired,
            templateKey: "review_child_paths",
            opportunityId: LEAD,
            inputValues: {},
        });

        expect(result.ok).toBe(true);
        // A different disposition, and no family stage move — because configuration said so.
        expect(child(world, EMMA).state).toBe("withdrawn");
        expect(family(world).status_key).toBe("closed");
        expect(family(world).stage_key).toBe("decision");
    });

    it("refuses when the work item does not configure a family close", async () => {
        const bare = parseStageOperatingPlanV1({
            ...JSON.parse(JSON.stringify(PLAN)),
            work_templates: [
                {
                    template_key: "review_child_paths",
                    label: "Review each child's path",
                    required: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                },
            ],
        })!;
        const world = makeWorld([piRow("pi-emma", EMMA, "waitlisted")]);

        const result = await executeGovernedFamilyClose({
            supabase: makeSupabase(world),
            orgId: ORG,
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "decision",
            plan: bare,
            templateKey: "review_child_paths",
            opportunityId: LEAD,
            inputValues: {},
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("not_configured");
        expect(family(world).status_key).toBe("open");
    });
});
