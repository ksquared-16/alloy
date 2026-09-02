import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeStageOperatingOutcome, rollbackStageOperatingOutcome, STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

/**
 * The canonical stage-move guard reads the department's configured stage inventory before any
 * move. These executor tests exercise moves to enrollment stages, so the department double must
 * configure a process that CONTAINS those stages — otherwise the move is (correctly) blocked.
 */
const MOVE_TARGET_STAGES = [
    "lead",
    "qualification",
    "tour",
    "decision",
    "waitlist",
    "enrollment",
    "enrolling",
    "enrolled",
    "closed",
    "closed_lost",
    "closed_withdrawn",
];

function configuredDeptMetadata(stageKeys: string[] = MOVE_TARGET_STAGES): Record<string, unknown> {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
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
                    stages: stageKeys.map((key, index) => ({
                        id: `stage-${key}`,
                        key,
                        label: key,
                        sort_order: index,
                        is_active: true,
                        // Real department metadata declares a grain on every stage; these
                        // fixtures did not, so the grain guard correctly refused to validate a
                        // move onto a stage that says nothing about which journey it belongs to.
                        // Child-track keys are named explicitly, everything else is family.
                        grain:
                            ["waitlist", "enrolling", "enrolled", "closed_withdrawn"].includes(key)
                                ? "child"
                                : "family",
                    })),
                },
            ],
        },
    };
}

/** A `from(table)` double that answers the guard's department-metadata read, delegating the
 *  rest to the caller's original chain factory. */
function withConfiguredDept(
    originalFrom: (table: string) => unknown,
    metadata: Record<string, unknown> = configuredDeptMetadata(),
) {
    return (table: string) => {
        if (table === "departments") {
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.maybeSingle = async () => ({ data: { metadata }, error: null });
            return chain;
        }
        if (table === "process_instances") {
            // One chain that answers BOTH shapes this table is read through: the single-row child
            // reads these tests already relied on, and the awaitable LIST read the family close
            // guard performs when enumerating child enrollment tracks.
            //
            // Resolving the list to `[]` says "this lead has no child tracks" — true for these
            // family-level cases. Left unstubbed the read fails, and the guard correctly refuses to
            // close a family whose children it cannot enumerate: a fixture gap, not a product
            // failure. Tests that need children stub this table themselves.
            const original = originalFrom(table) as Record<string, unknown> | null;
            const chain: Record<string, unknown> = {};
            // An UPDATE and a LIST READ both resolve through `then`, and they must not resolve to
            // the same value. This stub answered both with `[]`, which reads as "no rows matched" —
            // correct for the family-close guard's enumeration, wrong for a child write, and
            // invisible for as long as callers discarded the row count. Now that a scope-targeted
            // write asserts it touched exactly one row, the stub has to say which operation it is
            // standing in for.
            let isUpdate = false;
            const eqCols: string[] = [];
            chain.select = () => chain;
            chain.eq = (col: string) => {
                eqCols.push(col);
                return chain;
            };
            chain.update = () => {
                isUpdate = true;
                return chain;
            };
            chain.maybeSingle = async () => {
                const inner = original?.select as undefined | (() => Record<string, unknown>);
                const readChain = typeof inner === "function" ? inner() : null;
                const maybeSingle = readChain?.maybeSingle as undefined | (() => Promise<unknown>);
                return typeof maybeSingle === "function"
                    ? await maybeSingle()
                    : { data: null, error: null };
            };
            chain.single = async () => ({ data: {}, error: null });
            /*
             * Three shapes now resolve through `then`, and they must not answer alike:
             *
             *   UPDATE                     → one row, so a scope-targeted write asserts it moved 1
             *   READ filtered by subject   → the child's own journey (the anchor scope resolver)
             *   READ filtered by context   → [], the lead enumeration the family-close guard makes
             *
             * The last one stays empty on purpose: "this lead has no child tracks" is true for the
             * family-level cases here. The middle one used to fall into that same empty answer,
             * which said the CHILD had no journey — so every child write reported "no enrollment
             * track was found" for a child these tests had given one.
             */
            chain.then = (resolve: (value: unknown) => unknown) => {
                if (isUpdate) return resolve({ data: [{ id: "pi-1" }], error: null });
                if (eqCols.includes("subject_id")) {
                    return resolve({
                        data: [
                            {
                                id: "pi-1",
                                context_type: "enrollment_participation",
                                context_id: "ocm-1",
                                state: "enrolling",
                            },
                        ],
                        error: null,
                    });
                }
                return resolve({ data: [], error: null });
            };
            return chain;
        }
        return originalFrom(table);
    };
}

const mockInstantiate = vi.fn();

vi.mock("@/lib/admin/operationalWork/instantiateWorkFromDefinition", () => ({
    instantiateWorkFromDefinition: (...args: unknown[]) => mockInstantiate(...args),
}));

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...args: unknown[]) => mockInstantiate(...args),
}));

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: vi.fn(async () => ({
        error: null,
        before: { outcome_status_key: "waitlisted" },
        after: { id: "ocm-1", outcome_status_key: "offer_pending" },
        eventEmitted: true,
    })),
}));

/**
 * Targets read their prior value before writing so the transaction has an inverse to
 * compensate with; the doubles below must answer that read.
 */
function priorValueRead(row: Record<string, unknown>) {
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: row, error: null });
    return () => chain;
}

describe("executeStageOperatingOutcome", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("REJECTS an outcome that moves to a non-configured stage — failed target, no applied target", async () => {
        const plan = {
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [],
            outcomes: [{ outcome_key: "reached", label: "Reached" }],
            outcome_rules: [
                { rule_key: "reached_move", when_outcome_key: "reached", targets: [{ kind: "move_to_stage", stage_key: "qualification" }] },
            ],
            attention_rules: [],
        } as unknown as Parameters<typeof executeStageOperatingOutcome>[0]["plan"];
        // Department configures lead + tour only — qualification is NOT a stage.
        const supabase = {
            from: withConfiguredDept(() => ({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn(async () => ({ data: { stage_key: "lead" }, error: null })),
                update: vi.fn().mockReturnThis(),
            }), configuredDeptMetadata(["lead", "tour"])),
        };
        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "reached",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
        });
        expect(result.errors.some((e) => e.includes("not part of the configured Business Process"))).toBe(true);
        expect(result.applied_targets).toEqual([]); // the move never applied
        expect(result.undo).toEqual([]); // nothing written → nothing to compensate
        expect(result.status_updated).toBe(false);
    });

    it("updates child enrollment disposition for child journey stage", async () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("waitlist")!;
        const genericChain = () => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            update: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({ data: {}, error: null })),
        });
        const supabase = {
            from: vi.fn(withConfiguredDept(() => genericChain())),
        };

        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "spot_offered",
            subject: {
                journey_segment: "child",
                opportunity_id: "opp-1",
                customer_member_id: "child-1",
                opportunity_customer_member_id: "ocm-1",
            },
        });

        expect(result.errors).toEqual([]);
        expect(result.status_updated).toBe(true);
    });

    it("create_next_work uses shared stage work instantiation with idempotency", async () => {
        mockInstantiate.mockResolvedValue({ status: "created", work_id: "work-1" });
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;
        plan.outcome_rules = [
            {
                rule_key: "spawn_outcome_work",
                when_outcome_key: "tour_completed",
                targets: [{ kind: "create_next_work", template_key: "record_tour_outcome_work" }],
            },
        ];

        const result = await executeStageOperatingOutcome({
            supabase: { from: vi.fn() } as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "tour_completed",
            subject: {
                journey_segment: "family",
                opportunity_id: "opp-1",
            },
        });

        expect(result.errors).toEqual([]);
        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: "org-1",
                opportunityId: "opp-1",
                stageKey: "tour_completed",
                departmentId: "dept-1",
                template: expect.objectContaining({
                    template_key: "record_tour_outcome_work",
                    work_definition_key: "record_tour_outcome",
                }),
            }),
        );
    });

    it("create_next_work dedupes repeated outcome execution", async () => {
        mockInstantiate.mockResolvedValue({ status: "deduped", work_id: "work-existing" });
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;
        plan.outcome_rules = [
            {
                rule_key: "spawn_outcome_work",
                when_outcome_key: "tour_completed",
                targets: [{ kind: "create_next_work", template_key: "record_tour_outcome_work" }],
            },
        ];

        const result = await executeStageOperatingOutcome({
            supabase: { from: vi.fn() } as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "tour_completed",
            subject: {
                journey_segment: "family",
                opportunity_id: "opp-1",
            },
        });

        expect(result.errors).toEqual([]);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
    });

    it("create_next_work dedupes repeated outcome execution with manual skip flags", async () => {
        mockInstantiate.mockResolvedValue({ status: "deduped", work_id: "work-existing" });
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;
        plan.outcome_rules = [
            {
                rule_key: "spawn_outcome_work",
                when_outcome_key: "tour_completed",
                targets: [
                    { kind: "update_family_case_status", status_key: "decision_pending" },
                    { kind: "create_next_work", template_key: "record_tour_outcome_work" },
                ],
            },
        ];

        const result = await executeStageOperatingOutcome({
            supabase: { from: vi.fn() } as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "tour_completed",
            subject: {
                journey_segment: "family",
                opportunity_id: "opp-1",
            },
            skipTargetKinds: STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS,
        });

        expect(result.errors).toEqual([]);
        expect(result.status_updated).toBe(false);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
    });

    it("move_to_stage persists the family case stage_key (S4) alongside status update", async () => {
        const { updateOpportunityStatusWithEvent } = await import(
            "@/lib/opportunities/updateOpportunityStatusWithEvent"
        );
        const updateSpy = vi.fn().mockReturnThis();
        const eqSpy = vi.fn().mockReturnThis();
        const supabase = {
            from: vi.fn(withConfiguredDept(() => ({
                select: priorValueRead({ status_key: "open", close_reason_key: null, stage_key: "lead" }),
                update: (...args: unknown[]) => {
                    updateSpy(...args);
                    return { eq: (...a: unknown[]) => { eqSpy(...a); return { eq: eqSpy }; } };
                },
            }))),
        };
        const plan = {
            version: 1 as const,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            journey_segment: "family" as const,
            work_templates: [],
            outcomes: [],
            attention_rules: [],
            outcome_rules: [
                {
                    rule_key: "qualified_move",
                    when_outcome_key: "qualified",
                    targets: [
                        { kind: "update_family_case_status" as const, status_key: "open" },
                        { kind: "move_to_stage" as const, stage_key: "tour" },
                        { kind: "mark_stage_work_complete" as const },
                    ],
                },
            ],
        };

        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "qualified",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
        });

        expect(result.errors).toEqual([]);
        expect(result.status_updated).toBe(true);
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalled();
        // move_to_stage writes the persisted stage_key column on the family case.
        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ stage_key: "tour" }),
        );
    });

    it("resolves transition_ref through the stage-owned transition object", async () => {
        const { updateOpportunityStatusWithEvent } = await import(
            "@/lib/opportunities/updateOpportunityStatusWithEvent"
        );
        const updateSpy = vi.fn().mockReturnThis();
        const eqSpy = vi.fn().mockReturnThis();
        const supabase = {
            from: vi.fn(withConfiguredDept(() => ({
                select: priorValueRead({ status_key: "open", close_reason_key: null, stage_key: "tour" }),
                update: (...args: unknown[]) => {
                    updateSpy(...args);
                    return { eq: (...args: unknown[]) => { eqSpy(...args); return { eq: eqSpy }; } };
                },
            }))),
        };
        const plan = {
            version: 1 as const,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            journey_segment: "family" as const,
            outgoing_transitions: [{
                transition_ref: "tour_to_closed_lost",
                source_stage_key: "tour",
                target_stage_key: "closed_lost",
                label: "Close as Lost",
                available: true,
                status_key: "closed",
                closes_record: true as const,
            }],
            work_templates: [],
            outcomes: [{ outcome_key: "declined", label: "Declined" }],
            attention_rules: [],
            outcome_rules: [{
                rule_key: "declined",
                when_outcome_key: "declined",
                targets: [{ kind: "move_to_stage" as const, transition_ref: "tour_to_closed_lost" }],
            }],
        };

        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "declined",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
        });

        expect(result.errors).toEqual([]);
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalledWith(
            expect.objectContaining({ newStatusKey: "closed" }),
        );
        expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage_key: "closed_lost" }));
    });
});

/**
 * Compensation ordering.
 *
 * The inverses were captured in application order and replayed in reverse, but nothing asserted
 * the reversal. Order is not cosmetic here: a later target's inverse can depend on state an
 * earlier target's inverse restores. Replaying oldest-first would undo the foundation before the
 * thing standing on it, and the failure would surface as corrupted state rather than as an error.
 */
describe("rollbackStageOperatingOutcome — inverses replay newest-first", () => {
    it("runs the LAST applied inverse first and the first applied inverse last", async () => {
        const order: string[] = [];
        const undo = ["first", "second", "third"].map((name) => ({
            target: { kind: "move_to_stage" as const },
            run: vi.fn(async () => {
                order.push(name);
            }),
        }));

        const failures = await rollbackStageOperatingOutcome({ undo } as never);

        expect(order).toEqual(["third", "second", "first"]);
        expect(failures).toEqual([]);
    });

    it("keeps going after one inverse throws, and names every inverse that failed", async () => {
        // A single un-revertible target must not strand the inverses behind it — and the caller
        // needs the full list, because that is what turns "rolled back" into "partially committed".
        const order: string[] = [];
        const undo = [
            { target: { kind: "update_family_case_status" as const }, run: vi.fn(async () => { order.push("a"); }) },
            { target: { kind: "move_to_stage" as const }, run: vi.fn(async () => { throw new Error("restore denied"); }) },
            { target: { kind: "mark_stage_work_complete" as const }, run: vi.fn(async () => { order.push("c"); }) },
        ];

        const failures = await rollbackStageOperatingOutcome({ undo } as never);

        expect(order).toEqual(["c", "a"]);
        expect(failures).toEqual(["move_to_stage: restore denied"]);
    });

    it("reports no failures when there is nothing to undo", async () => {
        expect(await rollbackStageOperatingOutcome({ undo: [] } as never)).toEqual([]);
    });
});
