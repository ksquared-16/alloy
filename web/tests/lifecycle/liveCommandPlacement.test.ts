/**
 * D-96 boundary: what stays pinned, and what goes live.
 *
 * The policy is a split, so the tests have to prove BOTH halves. Proving only that a command edit
 * now reaches a running instance would leave the far more expensive regression — a journey quietly
 * re-judged against outcomes or a completion policy it never agreed to — completely unguarded.
 */

import { describe, expect, it } from "vitest";

import { overlayLiveCommandPlacementOntoPinnedRevision } from "@/lib/lifecycle/liveCommandPlacement";

const PROCESS_KEY = "enrollment";
const STAGE_KEY = "waitlist";
const TEMPLATE_KEY = "review_waitlist_position";

function builder(helpful: string[], extras?: Record<string, unknown>) {
    return {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: PROCESS_KEY,
                name: "Enrollment",
                label: "Enrollment",
                is_active: true,
                sort_order: 0,
                stages: [
                    {
                        id: "stage-waitlist",
                        key: STAGE_KEY,
                        label: "Waitlist",
                        is_active: true,
                        sort_order: 0,
                        grain: "child",
                        stage_operating_plan_v1: {
                            version: 1,
                            lifecycle_key: PROCESS_KEY,
                            stage_key: STAGE_KEY,
                            journey_segment: "child",
                            outcomes: [{ outcome_key: "spot_offered", label: "Spot offered" }],
                            work_templates: [
                                {
                                    template_key: TEMPLATE_KEY,
                                    label: "Review waitlist position",
                                    required: true,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    execution_mode: "outcome_led",
                                    completion_policy: "all_required",
                                    outcome_refs: [{ outcome_ref: "spot_offered" }],
                                    helpful_actions: helpful.map((action_ref) => ({ action_ref })),
                                    ...(extras ?? {}),
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
}

function liveMetadata(payload: unknown) {
    return { lifecycle_builder_v1: payload } as Record<string, unknown>;
}

function refsFor(payload: Record<string, unknown>): string[] {
    const process = (payload.processes as Array<Record<string, unknown>>)[0];
    const stage = (process.stages as Array<Record<string, unknown>>)[0];
    const plan = stage.stage_operating_plan_v1 as Record<string, unknown>;
    const template = (plan.work_templates as Array<Record<string, unknown>>)[0];
    return ((template.helpful_actions as Array<{ action_ref: string }>) ?? []).map((r) => r.action_ref);
}

describe("command placement resolves live over a pinned revision", () => {
    it("A — a command changed after the instance was created takes effect", () => {
        const pinned = builder(["quick_message"]);
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: pinned,
            liveDepartmentMetadata: liveMetadata(builder(["add_family_member"])),
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual(["add_family_member"]);
        expect(out.placement.source).toBe("live_published");
        // The configured identity is carried through untouched — never mapped to another key.
        expect(refsFor(out.payload)).not.toContain("quick_message");
    });

    it("B — a command removed live stays removed, and the pinned one is not revived", () => {
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: builder(["quick_message"]),
            liveDepartmentMetadata: liveMetadata(builder([])),
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual([]);
        expect(out.placement.source).toBe("live_published");
    });

    it("C — a command added live appears on the running instance", () => {
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: builder([]),
            liveDepartmentMetadata: liveMetadata(builder(["add_family_member"])),
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual(["add_family_member"]);
    });

    it("preserves configured order rather than re-deriving it", () => {
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: builder(["quick_message"]),
            liveDepartmentMetadata: liveMetadata(
                builder(["send_tour_invitation", "schedule_tour", "add_family_member", "send_form"]),
            ),
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual([
            "send_tour_invitation",
            "schedule_tour",
            "add_family_member",
            "send_form",
        ]);
    });
});

describe("the transaction model stays pinned", () => {
    const pinned = builder(["quick_message"]);
    const live = liveMetadata(
        (() => {
            const b = builder(["add_family_member"]);
            const stage = b.processes[0].stages[0] as Record<string, unknown>;
            stage.grain = "family";
            const plan = stage.stage_operating_plan_v1 as Record<string, unknown>;
            plan.outcomes = [{ outcome_key: "totally_different", label: "Different" }];
            const template = (plan.work_templates as Array<Record<string, unknown>>)[0];
            template.completion_policy = "any_one";
            template.outcome_refs = [{ outcome_ref: "totally_different" }];
            template.execution_mode = "direct_action";
            return b;
        })(),
    );

    const out = overlayLiveCommandPlacementOntoPinnedRevision({
        pinnedBuilderPayload: pinned,
        liveDepartmentMetadata: live,
        stageKey: STAGE_KEY,
    });
    const stage = (out.payload.processes as Array<Record<string, unknown>>)[0].stages as Array<
        Record<string, unknown>
    >;
    const plan = stage[0].stage_operating_plan_v1 as Record<string, unknown>;
    const template = (plan.work_templates as Array<Record<string, unknown>>)[0];

    it("D — outcomes remain the revision's, not the live edit's", () => {
        expect(plan.outcomes).toEqual([{ outcome_key: "spot_offered", label: "Spot offered" }]);
        expect(template.outcome_refs).toEqual([{ outcome_ref: "spot_offered" }]);
    });

    it("E — completion policy remains pinned", () => {
        expect(template.completion_policy).toBe("all_required");
        expect(template.execution_mode).toBe("outcome_led");
    });

    it("F — subject grain remains pinned", () => {
        expect(stage[0].grain).toBe("child");
        expect(plan.journey_segment).toBe("child");
    });

    it("and the work identity is unchanged", () => {
        expect(template.template_key).toBe(TEMPLATE_KEY);
        expect(template.required).toBe(true);
    });
});

describe("compatibility fallback, and only there", () => {
    it("G — no live process counterpart keeps the pinned commands", () => {
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: builder(["quick_message"]),
            liveDepartmentMetadata: {},
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual(["quick_message"]);
        expect(out.placement.source).toBe("pinned_fallback");
    });

    it("a live process without this stage keeps the pinned commands", () => {
        const liveWithoutStage = builder(["add_family_member"]);
        (liveWithoutStage.processes[0].stages as Array<Record<string, unknown>>)[0].key = "some_other_stage";
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: builder(["quick_message"]),
            liveDepartmentMetadata: liveMetadata(liveWithoutStage),
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual(["quick_message"]);
        expect(out.placement.source).toBe("pinned_fallback");
    });

    it("a live stage that no longer configures the template borrows nobody else's commands", () => {
        // Matching is by template key. A template removed from the live stage resolves to no
        // commands — never to the commands of whichever template now sits in its position.
        const liveOtherTemplate = builder(["add_family_member"]);
        const plan = (liveOtherTemplate.processes[0].stages as Array<Record<string, unknown>>)[0]
            .stage_operating_plan_v1 as Record<string, unknown>;
        (plan.work_templates as Array<Record<string, unknown>>)[0].template_key = "a_different_template";
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: builder(["quick_message"]),
            liveDepartmentMetadata: liveMetadata(liveOtherTemplate),
            stageKey: STAGE_KEY,
        });
        expect(refsFor(out.payload)).toEqual([]);
        expect(out.placement.source).toBe("live_published");
    });
});

describe("the pinned revision is evidence, and is never edited", () => {
    it("does not mutate the pinned payload or the live metadata", () => {
        const pinned = builder(["quick_message"]);
        const live = liveMetadata(builder(["add_family_member"]));
        const pinnedBefore = JSON.parse(JSON.stringify(pinned));
        const liveBefore = JSON.parse(JSON.stringify(live));

        overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: pinned,
            liveDepartmentMetadata: live,
            stageKey: STAGE_KEY,
        });

        expect(pinned).toEqual(pinnedBefore);
        expect(live).toEqual(liveBefore);
    });

    it("is stable when applied twice — resolution, not accumulation", () => {
        const pinned = builder(["quick_message"]);
        const live = liveMetadata(builder(["add_family_member"]));
        const once = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: pinned,
            liveDepartmentMetadata: live,
            stageKey: STAGE_KEY,
        });
        const twice = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: once.payload,
            liveDepartmentMetadata: live,
            stageKey: STAGE_KEY,
        });
        expect(refsFor(twice.payload)).toEqual(refsFor(once.payload));
    });
});
