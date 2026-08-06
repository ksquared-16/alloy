/**
 * Process Stage operating-contract certification — grouped coverage of the
 * 35 product cases (primary action, outcome editor, transitions, statuses,
 * follow-up work, fixtures, runtime).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCurrentWorkExecutionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkExecutionVM";
import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan";
import {
    billingCollectPaymentProofPlan,
    decisionSupportEnrollmentProofPlan,
    leadContactFamilyProofPlan,
    tourConductTourProofPlan,
} from "@/lib/lifecycle/fixtures/processStageOperatingContractProofPlans";
import {
    resolveOutcomeStatusOptions,
    isConfiguredClosedStatus,
} from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import {
    resolveWorkTemplateExecutionMode,
    setWorkTemplateExecutionMode,
} from "@/lib/lifecycle/resolveWorkTemplateExecutionMode";
import {
    setWorkTemplateNoDirectAction,
    setWorkTemplatePrimaryActionRef,
    setWorkTemplateSelectDirectAction,
    workTemplatePrimaryActionRef,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";
import {
    stageOperatingPlanDraftFromSaved,
    stageOperatingPlanDraftToPersisted,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    buildOutcomeRuleFromAutomation,
    outcomeAutomationSummaryForOutcome,
    readComposableOutcomeBehaviorDraft,
    readOutcomeAutomationDraft,
    upsertComposableOutcomeBehavior,
    upsertOutcomeAutomationRule,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import {
    validateStageOperatingPlanOperatingContract,
    stageOperatingContractHasBlockingErrors,
} from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import { availableOutcomesConfigSource } from "@/lib/lifecycle/workTemplateConfigSource";
import { resolveOutgoingProcessTransitions } from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const FAMILY_CLOSED_STATUSES = [
    {
        status_key: "closed",
        status_label: "Closed",
        entity_type: "opportunities",
        is_closed: true,
        is_active: true,
    },
    {
        status_key: "open",
        status_label: "Open",
        entity_type: "opportunities",
        is_closed: false,
        is_active: true,
    },
] as const;

const TOUR_TRANSITIONS = [
    {
        transition_ref: "tour_to_decision",
        label: "Tour completed → Decision",
        target_stage_key: "decision",
        target_stage_label: "Decision",
    },
    {
        transition_ref: "tour_to_waitlist",
        label: "Tour → Waitlist",
        target_stage_key: "waitlist",
        target_stage_label: "Waitlist",
    },
];

describe("Process Stage operating contract — primary action (1–5)", () => {
    it("1. Work Template can explicitly have no Primary Action", () => {
        const work = setWorkTemplateNoDirectAction({
            template_key: "conduct_tour",
            label: "Conduct Tour",
            required: true,
            due_policy: { kind: "same_day" },
            owner_strategy: "record_owner",
            primary_action: { action_ref: "schedule_tour" },
        });
        expect(work.execution_mode).toBe("outcome_led");
        expect(workTemplatePrimaryActionRef(work)).toBeUndefined();
        expect(resolveWorkTemplateExecutionMode(work)).toBe("outcome_led");
    });

    it("2. Outcome-led work saves and reloads", () => {
        const plan = tourConductTourProofPlan();
        const draft = stageOperatingPlanDraftFromSaved(plan, "tour");
        const persisted = stageOperatingPlanDraftToPersisted(draft, "tour", "enrollment", {
            validate: false,
        });
        expect(persisted).not.toBeNull();
        const reloaded = parseStageOperatingPlanV1(persisted!);
        const work = reloaded!.work_templates.find((t) => t.template_key === "conduct_tour")!;
        expect(work.execution_mode).toBe("outcome_led");
        expect(work.primary_action).toBeUndefined();
    });

    it("3. Direct-action work requires a resolvable action", () => {
        const plan = leadContactFamilyProofPlan();
        plan.work_templates[0]!.primary_action = undefined;
        plan.work_templates[0]!.execution_mode = "direct_action";
        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            validPrimaryActionRefs: ["quick_message"],
        });
        expect(issues.some((i) => i.code === "primary_action_missing")).toBe(true);
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(true);
    });

    it("4–5. Runtime promotes Record Outcome for outcome-led and never fabricates Primary Action", () => {
        const execution = buildCurrentWorkExecutionVM({
            templateConfig: {
                work_key: "conduct_tour",
                execution_mode: "outcome_led",
            },
            primaryAction: null,
            recordOutcomeAction: {
                key: "record_outcome",
                label: "Record outcome",
                category: "primary",
                placement: "current_work_primary",
                handlerKey: "record_outcome",
                actionRef: "record_outcome",
            },
            showOutcomeCompletion: true,
        });
        expect(execution.executionMode).toBe("outcome_led");
        expect(execution.prominentCta).toBe("record_outcome");
        expect(execution.hasExecutablePrimaryAction).toBe(false);

        const fabricated = buildCurrentWorkExecutionVM({
            templateConfig: { work_key: "conduct_tour", title: "Conduct Tour", execution_mode: "outcome_led" },
            primaryAction: {
                key: "conduct_tour",
                label: "Conduct Tour",
                category: "primary",
                placement: "current_work_primary",
                handlerKey: "expand_work",
                actionRef: "conduct_tour",
            },
            showOutcomeCompletion: true,
        });
        expect(fabricated.primaryActionIsExecutable).toBe(false);
        expect(fabricated.prominentCta).toBe("record_outcome");
    });
});

describe("Process Stage operating contract — outcome editor (6–10)", () => {
    it("6–7. Stage owns outcome definitions; Work Template selects applicable refs", () => {
        const plan = tourConductTourProofPlan();
        const work = plan.work_templates[0]!;
        expect(plan.outcomes.map((o) => o.outcome_key)).toEqual(
            expect.arrayContaining(work.outcome_refs!.map((r) => r.outcome_ref)),
        );
        expect(availableOutcomesConfigSource(work)).toBe("explicit");
    });

    it("8–9. Outcome behavior fields are conditional and summary is readable", () => {
        const plan = tourConductTourProofPlan();
        const draft = readOutcomeAutomationDraft("tour_completed", plan.outcome_rules, {
            transitionOptions: [...TOUR_TRANSITIONS],
        });
        expect(draft.kind).toBe("move_to_stage");
        expect(draft.transition_ref).toBe("tour_to_decision");
        const summary = outcomeAutomationSummaryForOutcome(
            "tour_completed",
            "Tour Completed",
            plan.outcome_rules,
            {
                transitionLabelByRef: Object.fromEntries(TOUR_TRANSITIONS.map((t) => [t.transition_ref, t.label])),
                completesWork: true,
            },
        );
        expect(summary).toContain("Tour Completed");
        expect(summary.toLowerCase()).toMatch(/decision|move|complete/);
    });

    it("work completion is owned by the Outcome Definition — expressed, not enforced", () => {
        const plan = tourConductTourProofPlan();
        const rule = plan.outcome_rules.find((row) => row.when_outcome_key === "tour_completed");
        // The canonical model still puts completion on the Outcome Definition …
        expect(plan.outcomes.find((outcome) => outcome.outcome_key === "tour_completed")?.completes_work).toBe(true);
        expect(rule?.targets.some((target) => target.kind === "mark_stage_work_complete")).toBe(false);

        /*
         * … but `mark_stage_work_complete` remains SUPPORTED runtime behaviour, so an existing
         * outcome that uses it is not invalid. This previously asserted
         * `legacy_work_completion_invalid`, which was gated on `outgoing_transitions !== undefined`
         * — "this stage has a transition", read as "this plan was re-authored". Authoring one
         * unrelated exit path therefore condemned every outcome already on the stage; on Firefly it
         * produced seven blocking errors against outcomes nobody had touched.
         *
         * The schema has no authoring-version marker to gate it correctly, so the diagnostic was
         * withdrawn rather than re-gated on a second guess.
         */
        rule!.targets.push({ kind: "mark_stage_work_complete" });
        const issues = validateStageOperatingPlanOperatingContract({ plan });
        expect(issues.map((issue) => issue.code as string)).not.toContain("legacy_work_completion_invalid");
    });

    it("10. Editor copy uses Outcomes not Results and Outcome Led execution mode", () => {
        const editor = read(
            "components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor.tsx",
        );
        expect(editor).toContain("Available Outcomes");
        expect(editor).not.toContain("Available Results");
        expect(editor).toContain("Direct Action");
        expect(editor).toContain("Outcome Led");
        expect(editor).toContain("LifecycleStageOutcomeDefinitionsEditor");

        const planEditor = read(
            "components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx",
        );
        expect(planEditor).not.toContain("LifecycleStageOutcomeDefinitionsEditor");
    });

    it("blocking authoring validation is caught by the stage save flow", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const tryIndex = board.indexOf("try {", board.indexOf("setStageSaveState(\"saving\")"));
        const draftIndex = board.indexOf("handle.getStageOperatingPlanDraft()", tryIndex);
        const catchIndex = board.indexOf("catch", draftIndex);
        expect(tryIndex).toBeGreaterThan(-1);
        expect(draftIndex).toBeGreaterThan(tryIndex);
        expect(catchIndex).toBeGreaterThan(draftIndex);
    });

    it("the draft assembly no longer validates by throwing", () => {
        // D3, drafting half. Throwing here meant the request was never assembled, so a stage with
        // any pre-existing defect could not be edited and the operator saw nothing at all.
        const planEditor = read(
            "components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx",
        );
        expect(planEditor).toContain("validate: false");
        expect(planEditor).toContain("assessStageOperatingPlanEdit");
    });

    it("the save blocks only on what the edit introduced, and reports the rest", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("assessment.blocking.length");
        // Never a silent no-op: a blocked save names the defect and moves the operator to it.
        expect(board).toContain("focusStageOperatingPlanControl");
        // And a save that lands still says what the graph owes before publication.
        expect(board).toContain("remainingIssuesSummary");
    });

    it("the transition status picker reads the record-status catalog, not the queue picker", () => {
        // The queue picker excludes case-layer rows by design, so validating a transition's
        // status against it made every canonical status unreachable.
        for (const file of [
            "components/adminV2/settings/lifecycle/StageEditorV2.tsx",
            "components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx",
        ]) {
            const src = read(file);
            const at = src.indexOf("configuredStatuses={");
            expect(at, `${file} must pass configuredStatuses`).toBeGreaterThan(-1);
            expect(src.slice(at, at + 400)).toContain("record_status_vocabulary");
            expect(src.slice(at, at + 400)).not.toContain("queue_membership_status_options");
        }
    });
});

describe("Process Stage operating contract — transitions (11–15)", () => {
    it("11–14. Move through transition validates outgoing refs only", () => {
        const plan = tourConductTourProofPlan();
        const withBad = structuredClone(plan);
        const rule = withBad.outcome_rules.find((r) => r.when_outcome_key === "tour_completed")!;
        const move = rule.targets.find((t) => t.kind === "move_to_stage")!;
        move.transition_ref = "not_an_edge";
        const issues = validateStageOperatingPlanOperatingContract({
            plan: withBad,
            transitionOptions: TOUR_TRANSITIONS,
        });
        expect(issues.some((i) => i.code === "outcome_transition_invalid")).toBe(true);

        const missing = validateStageOperatingPlanOperatingContract({
            plan: tourConductTourProofPlan(),
            transitionOptions: [],
        });
        // "This stage has no outgoing transition" is one fact about the stage. It used to be
        // reported once per outcome that wanted to move, which rendered the identical sentence
        // five times on the Lead stage and read as five separate problems.
        const stageScoped = missing.filter((i) => i.code === "stage_transition_missing");
        expect(stageScoped).toHaveLength(1);
        expect(stageScoped[0]!.outcome_key).toBeUndefined();
        expect(missing.some((i) => i.code === "outcome_transition_missing")).toBe(false);
    });

    it("11–14b. The stage-level transition gap is reported once regardless of outcome count", () => {
        const plan = tourConductTourProofPlan();
        const movingOutcomes = plan.outcome_rules.filter((r) =>
            r.targets.some((t) => t.kind === "move_to_stage"),
        ).length;
        expect(movingOutcomes, "fixture must have outcomes that move").toBeGreaterThan(0);

        const issues = validateStageOperatingPlanOperatingContract({ plan, transitionOptions: [] });
        expect(issues.filter((i) => i.code === "stage_transition_missing")).toHaveLength(1);
    });

    it("11–14c. Outcome-scoped transition problems still report per outcome", () => {
        // Dedup must not swallow the problems that genuinely differ between outcomes.
        const plan = tourConductTourProofPlan();
        const rule = plan.outcome_rules.find((r) => r.when_outcome_key === "tour_completed")!;
        rule.targets.find((t) => t.kind === "move_to_stage")!.transition_ref = "not_an_edge";

        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            transitionOptions: TOUR_TRANSITIONS,
        });
        const invalid = issues.filter((i) => i.code === "outcome_transition_invalid");
        expect(invalid.length).toBeGreaterThan(0);
        expect(invalid.every((i) => Boolean(i.outcome_key))).toBe(true);
        expect(issues.some((i) => i.code === "stage_transition_missing")).toBe(false);
    });

    it("12. Destination stage alone is rejected when first-class transitions exist", () => {
        const plan = tourConductTourProofPlan();
        const stripped = structuredClone(plan);
        const rule = stripped.outcome_rules.find((r) => r.when_outcome_key === "tour_completed")!;
        const move = rule.targets.find((t) => t.kind === "move_to_stage")!;
        delete move.transition_ref;
        move.stage_key = "decision";
        const issues = validateStageOperatingPlanOperatingContract({
            plan: stripped,
            transitionOptions: TOUR_TRANSITIONS,
        });
        expect(issues.some((issue) => issue.code === "outcome_transition_invalid")).toBe(true);
    });

    it("15. Transition identity persists through automation upsert", () => {
        const built = buildOutcomeRuleFromAutomation(
            "tour_completed",
            {
                kind: "move_to_stage",
                transition_ref: "tour_to_decision",
                stage_key: "decision",
                completes_work: true,
            },
            0,
            { transitionOptions: [...TOUR_TRANSITIONS] },
        );
        expect(built?.targets.some((t) => t.transition_ref === "tour_to_decision")).toBe(true);
    });

    it("prefers explicit stage-owned transitions and suppresses legacy fallback", () => {
        const plan = tourConductTourProofPlan();
        plan.outcome_rules.push({
            rule_key: "legacy_extra",
            when_outcome_key: "tour_completed",
            targets: [{ kind: "move_to_stage", stage_key: "legacy_destination" }],
        });
        const resolved = resolveOutgoingProcessTransitions({
            currentStageKey: "tour",
            stageOperatingPlan: plan,
            processStages: [
                { key: "tour", label: "Tour" },
                { key: "decision", label: "Decision" },
                { key: "closed_lost", label: "Closed Lost" },
                { key: "waitlist", label: "Waitlist" },
            ],
        });
        expect(resolved.map((row) => row.transition_ref)).toEqual([
            "tour_to_decision",
            "tour_to_closed_lost",
            "tour_to_waitlist",
        ]);
        expect(resolved.every((row) => row.source === "process_transition")).toBe(true);
    });

    it("blocks invalid transition definitions and unavailable references without throwing", () => {
        const plan = tourConductTourProofPlan();
        plan.outgoing_transitions![0]!.available = false;
        plan.outgoing_transitions = [
            ...plan.outgoing_transitions!,
            {
                ...plan.outgoing_transitions![0]!,
                target_stage_key: "tour",
                available: false,
                status_key: "not_canonical",
            },
        ];
        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            processStageKeys: ["tour", "decision", "closed_lost", "waitlist"],
            configuredStatuses: [...FAMILY_CLOSED_STATUSES],
            entityType: "opportunities",
        });
        expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            "transition_identity_duplicate",
            "transition_destination_self",
            "outcome_transition_unavailable",
            "transition_status_noncanonical",
        ]));
    });
});

describe("Process Stage operating contract — statuses (16–21)", () => {
    it("16. Transition editor derives close semantics from configured status", () => {
        const editor = read(
            "components/adminV2/settings/lifecycle/LifecycleStageOutgoingTransitionsEditor.tsx",
        );
        expect(editor).toContain("resolveOutcomeStatusOptions");
        expect(editor).toContain("isConfiguredClosedStatus");
        // The exit path now reads as a sentence, so the badge says "Closes the record" — the same
        // words the Stage Overview already uses for the same fact. The guard that matters is
        // unchanged: the flag is DERIVED from the configured status, never typed.
        expect(editor).toContain("Closes the record");
        expect(editor).not.toContain("Close Record");
    });

    it("17–18. Only configured closed statuses appear, scoped by entity", () => {
        const result = resolveOutcomeStatusOptions({
            configuredStatuses: [
                ...FAMILY_CLOSED_STATUSES,
                {
                    status_key: "withdrawn",
                    status_label: "Withdrawn",
                    entity_type: "opportunity_customer_members",
                    is_closed: true,
                },
            ],
            purpose: "close_record",
            entityType: "opportunities",
        });
        expect(result.options.map((o) => o.status_key)).toEqual(["closed"]);
        expect(result.available).toBe(true);
    });

    it("19–20. Unknown / legacy raw text cannot validate as selected; non-closed keys are not close_record", () => {
        const result = resolveOutcomeStatusOptions({
            configuredStatuses: [...FAMILY_CLOSED_STATUSES],
            purpose: "close_record",
            entityType: "opportunities",
            selectedStatusKey: "totally_made_up",
        });
        expect(result.selectedValid).toBe(false);
        expect(result.invalidSelectedStatusKey).toBe("totally_made_up");

        const plan = leadContactFamilyProofPlan();
        // Non-closed free text is no longer classified as close_record.
        const nonClose = {
            ...plan,
            outcome_rules: upsertOutcomeAutomationRule(plan.outcome_rules, "not_interested", {
                kind: "close_record",
                status_key: "typed_garbage",
                completes_work: true,
            }),
        };
        const nonCloseIssues = validateStageOperatingPlanOperatingContract({
            plan: nonClose,
            configuredStatuses: [...FAMILY_CLOSED_STATUSES],
            entityType: "opportunities",
        });
        expect(nonCloseIssues.some((i) => i.code === "outcome_close_status_invalid")).toBe(false);

        // True close with a closed-semantic key that is not in the closed option set → invalid.
        const catalogOnlyLost = [
            {
                status_key: "lost",
                status_label: "Lost",
                entity_type: "opportunities",
                is_closed: true,
                is_active: true,
            },
            {
                status_key: "open",
                status_label: "Open",
                entity_type: "opportunities",
                is_closed: false,
                is_active: true,
            },
        ];
        const badClose = {
            ...plan,
            outcome_rules: upsertOutcomeAutomationRule(plan.outcome_rules, "not_interested", {
                kind: "close_record",
                status_key: "closed",
                completes_work: true,
            }),
        };
        const badIssues = validateStageOperatingPlanOperatingContract({
            plan: badClose,
            configuredStatuses: catalogOnlyLost,
            entityType: "opportunities",
        });
        expect(badIssues.some((i) => i.code === "outcome_close_status_invalid")).toBe(true);
    });

    it("21. Close without status fails to build a rule (no invented closed)", () => {
        const rule = buildOutcomeRuleFromAutomation(
            "family_declined",
            { kind: "close_record", status_key: undefined, completes_work: true },
            0,
        );
        expect(rule).toBeNull();
        expect(isConfiguredClosedStatus(FAMILY_CLOSED_STATUSES[0]!)).toBe(true);
    });
});

describe("Process Stage operating contract — follow-up work (22–25)", () => {
    it("22–24. Real Work Template refs + due policy; missing template validates", () => {
        const plan = tourConductTourProofPlan();
        const draft = readOutcomeAutomationDraft("no_show", plan.outcome_rules);
        expect(draft.kind).toBe("repeat_work");
        expect(draft.repeat_template_key).toBe("reschedule_tour");
        expect(draft.follow_up_due_policy?.anchor).toBeTruthy();

        const missing = validateStageOperatingPlanOperatingContract({
            plan: {
                ...plan,
                outcome_rules: [
                    ...plan.outcome_rules.filter((r) => r.when_outcome_key !== "needs_follow_up"),
                    {
                        rule_key: "needs_follow_up_incomplete",
                        when_outcome_key: "needs_follow_up",
                        targets: [{ kind: "create_next_work", template_key: "" }],
                    },
                ],
            },
        });
        expect(missing.some((i) => i.code === "outcome_follow_up_template_missing")).toBe(true);
    });

    it("25. No Work Item 1 copy in follow-up selector templates for proof plans", () => {
        const plan = tourConductTourProofPlan();
        for (const t of plan.work_templates) {
            expect(t.label.toLowerCase()).not.toMatch(/^work item \d+$/);
        }
    });

    it("supports zero or multiple follow-up Work Templates on one outcome", () => {
        const plan = tourConductTourProofPlan();
        // Start from the CURRENT draft so the required round-trip fields (`preserved_targets`,
        // `preserved_rules`, `completes_stage_work`, `had_behavior_rule`) carry through — writing a
        // bare literal would drop exactly what the draft exists to preserve.
        const current = readComposableOutcomeBehaviorDraft("needs_follow_up", plan.outcome_rules);
        const rules = upsertComposableOutcomeBehavior(plan.outcome_rules, "needs_follow_up", {
            ...current,
            movement: "stay_in_stage",
            follow_up_work: [
                {
                    template_key: "follow_up_after_tour",
                    due_policy: { anchor: "outcome_recorded_at", offset_value: 1, offset_unit: "days", direction: "after" },
                },
                {
                    template_key: "availability_follow_up",
                    due_policy: { anchor: "stage_entered_at", offset_value: 2, offset_unit: "days", direction: "after" },
                },
            ],
            attention_items: [
                {
                    reason: "Follow-up needed",
                    due_policy: { anchor: "outcome_recorded_at", offset_value: 0, offset_unit: "days", direction: "after" },
                },
            ],
        });
        const draft = readComposableOutcomeBehaviorDraft("needs_follow_up", rules);
        expect(draft.follow_up_work.map((row) => row.template_key)).toEqual([
            "follow_up_after_tour",
            "availability_follow_up",
        ]);
        expect(draft.attention_items.map((row) => row.reason)).toEqual(["Follow-up needed"]);
    });
});

describe("Process Stage operating contract — fixtures (26–30)", () => {
    it("26. Tour supports outcome-led Conduct Tour", () => {
        const work = tourConductTourProofPlan().work_templates[0]!;
        expect(work.label).toBe("Conduct Tour");
        expect(work.execution_mode).toBe("outcome_led");
        expect(work.primary_action).toBeUndefined();
    });

    it("27. Lead supports direct-action Contact Family", () => {
        const work = leadContactFamilyProofPlan().work_templates[0]!;
        expect(work.execution_mode).toBe("direct_action");
        expect(work.primary_action?.action_ref).toBe("quick_message");
    });

    it("28. Decision supports outcome-led work", () => {
        const work = decisionSupportEnrollmentProofPlan().work_templates[0]!;
        expect(work.execution_mode).toBe("outcome_led");
        expect(work.primary_action).toBeUndefined();
    });

    it("29. Billing supports direct-action Collect Payment", () => {
        const work = billingCollectPaymentProofPlan().work_templates[0]!;
        expect(work.execution_mode).toBe("direct_action");
        expect(work.primary_action?.action_ref).toBe("record_payment");
        expect(work.outcome_refs?.map((r) => r.outcome_ref)).toEqual([
            "paid",
            "promise_to_pay",
            "unable_to_collect",
        ]);
    });

    it("30. Generic resolvers have no childcare hardcoding", () => {
        const resolver = read("lib/lifecycle/resolveOutcomeStatusOptions.ts");
        const mode = read("lib/lifecycle/resolveWorkTemplateExecutionMode.ts");
        const contract = read("lib/lifecycle/validateStageOperatingPlanOperatingContract.ts");
        for (const src of [resolver, mode, contract]) {
            expect(src.toLowerCase()).not.toContain("childcare");
            expect(src.toLowerCase()).not.toContain("enrollment_lead");
            expect(src).not.toContain("conduct_tour");
        }
    });
});

describe("Process Stage operating contract — runtime (31–35)", () => {
    const NULL_SIGNALS = {
        work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
        tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
        communications: {
            scheduledSendCount: 0,
            nextFollowUpAt: null,
            hasOutreach: false,
            nextScheduledSendId: null,
        },
        billing: {
            billingConfigured: false,
            billingContactName: null,
            billingContactEmail: null,
            tuitionRateLabel: null,
            feeBalanceCents: null,
        },
    };

    function baseContext(partial: Partial<OperationalContext> = {}): OperationalContext {
        return {
            grain: "case",
            subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "tour" },
            perspective: null,
            truth: {},
            signals: NULL_SIGNALS,
            capabilities: { canMutate: true, maskedChannels: false },
            status: "ready",
            ...partial,
        } as OperationalContext;
    }

    it("31. Outcome-led Current Work shows Record Outcome as main action", () => {
        const plan = tourConductTourProofPlan();
        const resolved = resolveCurrentWorkTemplateFromPublishedPlan({
            operatingPlan: plan,
            actionCatalog: null,
            fieldRules: null,
            processKey: "enrollment",
            stageKey: "tour",
            departmentMetadata: {},
            processStages: [
                { key: "tour", label: "Tour" },
                { key: "decision", label: "Decision" },
            ],
            stageWorkRuntime: {
                stage_key: "tour",
                stage_label: "Tour",
                purpose: plan.purpose ?? "",
                journey_segment: "family",
                template_keys: ["conduct_tour"],
                primary: {
                    template_key: "conduct_tour",
                    label: "Conduct Tour",
                    role: "primary",
                    state: "open",
                    requires_outcome_picker: true,
                    work_id: "work-tour",
                    due_at: null,
                    due_urgency: "none",
                    attempt_count: 0,
                    last_outcome: null,
                    completed_at: null,
                    outcomes: plan.outcomes.filter((o) =>
                        plan.work_templates[0]!.outcome_refs?.some((ref) => ref.outcome_ref === o.outcome_key),
                    ),
                    completion_policy_summary: null,
                    completion_policy_min_attempts: null,
                    completion_policy_max_attempts: null,
                    outcome_automation_preview: [],
                },
                additional: [],
                execution: {
                    department_id: "dept-1",
                    subject: { journey_segment: "family", opportunity_id: "opp-1" },
                },
            } as never,
            recordHeaderActions: null,
        });
        expect(resolved?.templateConfig.execution_mode).toBe("outcome_led");
        expect(resolved?.templateConfig.primary_action).toBeUndefined();

        const surface = buildCurrentWorkSurfaceVM({
            context: baseContext({
                stageWorkRuntime: {
                    stage_key: "tour",
                    stage_label: "Tour",
                    purpose: plan.purpose ?? "",
                    journey_segment: "family",
                    template_keys: ["conduct_tour"],
                    primary: {
                        template_key: "conduct_tour",
                        label: "Conduct Tour",
                        role: "primary",
                        state: "open",
                        requires_outcome_picker: true,
                        work_id: "work-tour",
                        due_at: null,
                        due_urgency: "none",
                        attempt_count: 0,
                        last_outcome: null,
                        completed_at: null,
                        outcomes: plan.outcomes.filter((o) =>
                            plan.work_templates[0]!.outcome_refs?.some((ref) => ref.outcome_ref === o.outcome_key),
                        ),
                        completion_policy_summary: null,
                        completion_policy_min_attempts: null,
                        completion_policy_max_attempts: null,
                        outcome_automation_preview: [],
                    },
                    additional: [],
                    execution: {
                        department_id: "dept-1",
                        subject: { journey_segment: "family", opportunity_id: "opp-1" },
                    },
                } as never,
            }),
            templateConfig: resolved!.templateConfig,
            actionRegistry: resolved!.actionRegistry,
        });
        expect(surface.execution?.executionMode).toBe("outcome_led");
        expect(surface.execution?.prominentCta).toBe("record_outcome");
        expect(surface.primaryAction).toBeFalsy();
        expect(surface.execution).toBeTruthy();
    });

    it("32. Direct-action Current Work prefers configured Primary Action", () => {
        const plan = leadContactFamilyProofPlan();
        const resolved = resolveCurrentWorkTemplateFromPublishedPlan({
            operatingPlan: plan,
            actionCatalog: {
                version: 1,
                candidate_actions: [{ action_key: "quick_message", recommendation: "recommended" }],
            },
            fieldRules: null,
            processKey: "enrollment",
            stageKey: "lead",
            departmentMetadata: {},
            processStages: [{ key: "lead", label: "Lead" }],
            stageWorkRuntime: null,
            recordHeaderActions: {
                ...emptyResolvedActionsBySlot(),
                primary: [
                    {
                        key: "quick_message",
                        label: "Contact Family",
                        description: null,
                        action_type: "registry",
                        icon: null,
                        style: null,
                        display_style: "primary",
                        payload: {},
                        workflow_id: null,
                    },
                ],
                secondary: [],
            },
        });
        expect(resolved?.templateConfig.execution_mode).toBe("direct_action");
        expect(resolved?.templateConfig.primary_action?.action_ref).toBe("quick_message");

        const surface = buildCurrentWorkSurfaceVM({
            context: baseContext({
                businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
            }),
            templateConfig: resolved!.templateConfig,
            actionRegistry: resolved!.actionRegistry,
        });
        expect(surface.execution?.executionMode).toBe("direct_action");
        expect(surface.primaryAction?.actionRef).toBe("quick_message");
        expect(surface.execution?.prominentCta).toBe("primary_action");
    });

    it("33–34. Outcome transition / close use canonical configured paths", () => {
        const move = buildOutcomeRuleFromAutomation(
            "tour_completed",
            {
                kind: "move_to_stage",
                transition_ref: "tour_to_decision",
                stage_key: "decision",
                completes_work: true,
            },
            0,
            { transitionOptions: [...TOUR_TRANSITIONS] },
        );
        expect(move?.targets.some((t) => t.kind === "move_to_stage" && t.transition_ref === "tour_to_decision")).toBe(
            true,
        );

        const close = buildOutcomeRuleFromAutomation(
            "family_declined",
            { kind: "close_record", status_key: "closed", completes_work: true },
            0,
        );
        expect(close?.targets.some((t) => t.kind === "update_family_case_status" && t.status_key === "closed")).toBe(
            true,
        );
    });

    it("35. Invalid primary residue is not treated as executable", () => {
        const mode = setWorkTemplateExecutionMode(
            {
                template_key: "x",
                label: "X",
                required: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
            },
            "outcome_led",
        );
        expect(setWorkTemplateSelectDirectAction(mode, "missing_ref").execution_mode).toBe("direct_action");
        expect(setWorkTemplatePrimaryActionRef(mode, null).primary_action).toBeUndefined();
        const vm = buildCurrentWorkExecutionVM({
            templateConfig: {
                work_key: "x",
                execution_mode: "outcome_led",
                primary_action: { action_ref: "ghost" },
            },
            primaryAction: null,
            showOutcomeCompletion: true,
            recordOutcomeAction: {
                key: "record_outcome",
                label: "Record outcome",
                category: "primary",
                placement: "current_work_primary",
                handlerKey: "record_outcome",
                actionRef: "record_outcome",
            },
        });
        expect(vm.hasExecutablePrimaryAction).toBe(false);
    });
});
