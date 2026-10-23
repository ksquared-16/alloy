/**
 * BP V2 Slice 8B-1 — the Enrollment template applies, validates and is publishable on a CLEAN process.
 *
 * Runs the same sequence the configuration routes run, with the same functions:
 *   create_process (createLifecycleProcess) → apply_enrollment_v2_template (applyEnrollmentTemplateInConfig)
 *   → set_process_entry_point ×2 (setProcessEntryPoint) → ensureBuilderCommandSetsOnSave
 *   → the save gate every builder PATCH applies (validateConfiguredStageReferences)
 *   → the publish gate (validateBusinessProcessForPublish), with the stage-based Work Views attached
 *   → the runtime's plan resolution over the published projection (resolveEffectiveStageOperatingPlan).
 *
 * The two defects it locks (both template-only corrections; the shared defaults and the runtime are unchanged):
 *   1. "Close as Lost" exits on lead / tour / decision targeted `closed_lost`, a stage the template never creates,
 *      so `apply_enrollment_v2_template` was refused (422 dangling_stage_reference) for every new tenant. They now
 *      land on the family terminal stage `closed` and record close reason `lost`.
 *   2. Family outcomes moved the FAMILY onto the child-grain `waitlist` stage, and `waitlist` declared no exit, so
 *      publication was refused. Director decision (S8B-1, Option 1): the family stays at Decision / moves Tour →
 *      Decision; children are waitlisted one at a time by the existing per-child Decision; Spot Offered moves the
 *      child through a declared `waitlist_to_enrolling` exit.
 * Acceptance: ZERO publication errors on a clean process.
 */
import { describe, expect, it } from "vitest";

import {
    applyEnrollmentTemplateInConfig,
    applyEnrollmentTemplateToProcess,
    ENROLLMENT_STAGE_SPECS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import {
    createLifecycleProcess,
    emptyLifecycleBuilderV1,
    setProcessEntryPoint,
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ensureBuilderCommandSetsOnSave } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { validateConfiguredStageReferences } from "@/lib/lifecycle/validateConfiguredStageReferences";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { parseWorkViewsV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { correctInvalidClosedLostTargets } from "@/lib/businessProcesses/configuration/correctInvalidClosedLostTargets";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { mapOpportunityRecordActionToPatch } from "@/lib/recordChrome/opportunityRecordActionMap";

const EXPECTED_STAGES = ["lead", "tour", "decision", "closed", "waitlist", "enrolling", "enrolled", "closed_withdrawn"];
/** The three "Close as Lost" exits and the outcome that takes each. */
const LOST_EXITS = [
    { stage: "lead", ref: "lead_to_closed_lost", outcome: "not_interested" },
    { stage: "tour", ref: "tour_to_closed_lost", outcome: "family_declined" },
    { stage: "decision", ref: "decision_to_closed_lost", outcome: "declined" },
] as const;

/** The stage-based Work Views the hosted QA run publishes (counts must match deployed data). */
const STAGE_VIEWS = parseWorkViewsV1(
    [
        // Row grain matches the grain of the stage the view filters on: the runtime refuses a family lens
        // over child stages (measured on hosted staging, S8B-1 readiness run qar_e59e093c2b05).
        ["new_leads", "New Leads", "lead", "family"],
        ["tours", "Tours", "tour", "family"],
        ["decision", "Decision", "decision", "family"],
        ["registration", "Registration", "enrolling", "child"],
        ["waitlist", "Waitlist", "waitlist", "child"],
    ]
        .map(([id, label, stage, grain], i) => ({
            id, label, row_grain_v1: grain, display_order: i + 1, visible_in_runtime: true,
            filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: stage }],
        }))
        .concat([{ id: "all", label: "All", row_grain_v1: "family", display_order: 6, visible_in_runtime: true, filters_v1: [] } as never]),
)!;

/** A clean tenant: an empty builder with one fresh Enrollment process — exactly what create_process yields. */
function cleanTenant(): { config: LifecycleBuilderV1; processId: string } {
    const config = createLifecycleProcess("Enrollment", emptyLifecycleBuilderV1(), { primary_entity: "opportunity" });
    const process = config.processes.find((p) => p.key === "enrollment")!;
    return { config, processId: process.id };
}

/** The route sequence, step for step. */
function applyThroughRoutes(config: LifecycleBuilderV1, processId: string): LifecycleBuilderV1 {
    let next = applyEnrollmentTemplateInConfig(config, processId);
    next = setProcessEntryPoint(next, processId, "create_lead", "lead");
    next = setProcessEntryPoint(next, processId, "enrollment_start", "enrolling");
    return ensureBuilderCommandSetsOnSave(next);
}

const enrollment = (config: LifecycleBuilderV1): LifecycleBuilderProcessRecord => config.processes.find((p) => p.key === "enrollment")!;
const stage = (p: LifecycleBuilderProcessRecord, key: string) => p.stages.find((s) => s.key === key)!;

describe("Enrollment template on a clean process (BP V2 S8B-1)", () => {
    it("applies, passes the save-time stage-reference gate, and creates every stage exactly once", () => {
        const { config, processId } = cleanTenant();
        const applied = applyThroughRoutes(config, processId);
        expect(validateConfiguredStageReferences(applied)).toEqual({ ok: true });
        const keys = enrollment(applied).stages.map((s) => s.key);
        expect([...keys].sort()).toEqual([...EXPECTED_STAGES].sort());
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual(ENROLLMENT_STAGE_SPECS.map((s) => s.key));
    });

    it("every stage reference resolves inside the process's own inventory", () => {
        const { config, processId } = cleanTenant();
        const p = enrollment(applyThroughRoutes(config, processId));
        const inventory = new Set(p.stages.map((s) => s.key));
        for (const s of p.stages) {
            for (const exit of s.stage_operating_plan_v1?.outgoing_transitions ?? []) {
                expect({ stage: s.key, ref: exit.transition_ref, to: inventory.has(exit.target_stage_key) }).toEqual({ stage: s.key, ref: exit.transition_ref, to: true });
            }
        }
    });

    it("'Close as Lost' lands on the family terminal stage AND records the case as lost (meaning preserved)", () => {
        const { config, processId } = cleanTenant();
        const p = enrollment(applyThroughRoutes(config, processId));
        const lost = mapOpportunityRecordActionToPatch("mark_lost");
        expect(lost).toMatchObject({ status_key: "closed", close_reason_key: "lost" });
        for (const x of LOST_EXITS) {
            const plan = stage(p, x.stage).stage_operating_plan_v1!;
            const exit = plan.outgoing_transitions!.find((e) => e.transition_ref === x.ref)!;
            expect(exit.target_stage_key).toBe("closed");
            expect(exit.closes_record).toBe(true);
            expect(exit.status_key).toBe("closed");
            const rule = plan.outcome_rules!.find((r) => r.when_outcome_key === x.outcome)!;
            // The reason is recorded first, then the case moves — a lost family is never an ordinary closure.
            expect(rule.targets[0]).toMatchObject({ kind: "update_family_case_status", status_key: lost!.status_key, close_reason_key: lost!.close_reason_key });
            expect(rule.targets.some((t) => t.kind === "move_to_stage" && (t as { transition_ref?: string }).transition_ref === x.ref)).toBe(true);
        }
        // Already in the canonical corrected form: the Configuration lane's own repair finds nothing to do.
        expect(correctInvalidClosedLostTargets({ version: 1, active_process_id: p.id, processes: [p] }).alreadyCorrect).toBe(true);
    });

    /** Every correction the template makes, by (stage, outcome) and by exit — and nothing else. */
    const CORRECTED_OUTCOMES = new Set<string>([
        ...LOST_EXITS.map((x) => `${x.stage}:${x.outcome}`),
        "tour:no_availability", "decision:wants_waitlist", "waitlist:spot_offered",
    ]);
    const CORRECTED_EXITS = new Set<string>([...LOST_EXITS.map((x) => x.ref), "tour_to_waitlist", "decision_to_waitlist", "waitlist_to_enrolling"]);

    it("every OTHER exit, outcome, work template and outcome definition is exactly the default plan's", () => {
        const { config, processId } = cleanTenant();
        const p = enrollment(applyThroughRoutes(config, processId));
        for (const s of p.stages) {
            const plan = s.stage_operating_plan_v1;
            const defaults = defaultStageOperatingPlanForEnrollmentStage(s.key);
            if (!plan || !defaults) { expect(plan ?? null).toEqual(defaults ?? null); continue; }
            expect((plan.outgoing_transitions ?? []).filter((e) => !CORRECTED_EXITS.has(e.transition_ref)))
                .toEqual((defaults.outgoing_transitions ?? []).filter((e) => !CORRECTED_EXITS.has(e.transition_ref)));
            expect((plan.outcome_rules ?? []).filter((r) => !CORRECTED_OUTCOMES.has(`${s.key}:${r.when_outcome_key}`)))
                .toEqual((defaults.outcome_rules ?? []).filter((r) => !CORRECTED_OUTCOMES.has(`${s.key}:${r.when_outcome_key}`)));
            expect(plan.work_templates).toEqual(defaults.work_templates);
            expect(plan.outcomes).toEqual(defaults.outcomes);
        }
    });

    it("Waitlist decision (Director, S8B-1): the family never enters Waitlist; children do, one at a time", () => {
        const { config, processId } = cleanTenant();
        const p = enrollment(applyThroughRoutes(config, processId));
        const rule = (stageKey: string, outcome: string) => stage(p, stageKey).stage_operating_plan_v1!.outcome_rules!.find((r) => r.when_outcome_key === outcome)!;
        const exits = (stageKey: string) => (stage(p, stageKey).stage_operating_plan_v1!.outgoing_transitions ?? []).map((e) => e.transition_ref);

        // A. Wants Waitlist: the family stays at Decision; the family→Waitlist exit is gone; nothing waitlists
        //    the family's children automatically (no child effect on the family outcome).
        expect(exits("decision")).not.toContain("decision_to_waitlist");
        expect(rule("decision", "wants_waitlist").targets).toEqual([{ kind: "no_movement" }]);
        // B. No Availability: Tour → Decision on the existing exit; no automatic waitlisting.
        expect(exits("tour")).not.toContain("tour_to_waitlist");
        const noAvailability = rule("tour", "no_availability").targets;
        expect(noAvailability).toEqual([{ kind: "move_to_stage", transition_ref: "tour_to_decision" }]);
        expect(stage(p, "tour").stage_operating_plan_v1!.outgoing_transitions!.find((e) => e.transition_ref === "tour_to_decision")!.target_stage_key).toBe("decision");
        for (const t of [...rule("decision", "wants_waitlist").targets, ...noAvailability]) {
            expect(["enter_child_enrollment", "update_child_enrollment_status"]).not.toContain(t.kind);
        }
        // The child path that DOES waitlist: the existing per-child Decision split, one subject at a time.
        const split = (p.tracks_v1 as { split_rules?: Array<{ from_stage_key: string; per_subject_outcomes: Array<{ outcome_key: string; target_stage_key: string | null }> }> }).split_rules!
            .find((r) => r.from_stage_key === "decision")!;
        expect(split.per_subject_outcomes.find((o) => o.outcome_key === "waitlist")!.target_stage_key).toBe("waitlist");
        expect(split.per_subject_outcomes.find((o) => o.outcome_key === "enrolling")!.target_stage_key).toBe("enrolling");
        // C. Spot Offered: a declared child→child exit, same destination and same child status update.
        const wl = stage(p, "waitlist").stage_operating_plan_v1!;
        expect(wl.outgoing_transitions).toEqual([
            { transition_ref: "waitlist_to_enrolling", source_stage_key: "waitlist", target_stage_key: "enrolling", label: "Offer Spot", available: true },
        ]);
        const spot = rule("waitlist", "spot_offered").targets;
        const before = defaultStageOperatingPlanForEnrollmentStage("waitlist")!.outcome_rules!.find((r) => r.when_outcome_key === "spot_offered")!.targets;
        expect(spot).toEqual(before.map((t) => (t.kind === "move_to_stage" ? { kind: "move_to_stage", transition_ref: "waitlist_to_enrolling" } : t)));
        expect(before.some((t) => t.kind === "move_to_stage" && t.stage_key === "enrolling")).toBe(true);
    });

    it("grain consistency: no exit or outcome moves the family onto a child stage, or a child onto a family stage", () => {
        const { config, processId } = cleanTenant();
        const p = enrollment(applyThroughRoutes(config, processId));
        const grainOf = new Map(p.stages.map((s) => [s.key, s.grain]));
        for (const s of p.stages) {
            const plan = s.stage_operating_plan_v1;
            if (!plan) continue;
            const exitTarget = new Map((plan.outgoing_transitions ?? []).map((e) => [e.transition_ref, e.target_stage_key]));
            for (const [ref, to] of exitTarget) expect({ from: s.key, ref, grain: grainOf.get(to) }).toEqual({ from: s.key, ref, grain: s.grain });
            for (const r of plan.outcome_rules ?? []) {
                for (const t of r.targets ?? []) {
                    if (t.kind !== "move_to_stage") continue;
                    // Movement is declared: every move names an exit of its own stage (no raw stage_key).
                    expect({ stage: s.key, outcome: r.when_outcome_key, ref: t.transition_ref ?? null, raw: t.stage_key ?? null })
                        .toEqual({ stage: s.key, outcome: r.when_outcome_key, ref: t.transition_ref, raw: null });
                    expect(exitTarget.has(t.transition_ref!)).toBe(true);
                }
            }
        }
    });

    it("validates and publishes with ZERO errors, with the stage-based Work Views", () => {
        const { config, processId } = cleanTenant();
        const applied = applyThroughRoutes(config, processId);
        const withViews: LifecycleBuilderV1 = {
            ...applied,
            processes: applied.processes.map((p) => (p.id === processId ? { ...p, work_views_v1: STAGE_VIEWS } as LifecycleBuilderProcessRecord : p)),
        };
        expect(STAGE_VIEWS.map((v) => v.id)).toEqual(["new_leads", "tours", "decision", "registration", "waitlist", "all"]);
        const grainOf = new Map(enrollment(applied).stages.map((s) => [s.key, s.grain]));
        for (const v of STAGE_VIEWS) {
            const stageFilter = (v.filters_v1 ?? []).find((f) => f.field_key === "opportunity_stage");
            if (stageFilter) expect({ view: v.id, grain: v.row_grain_v1 }).toEqual({ view: v.id, grain: grainOf.get(String(stageFilter.value)) });
        }
        expect(validateConfiguredStageReferences(withViews)).toEqual({ ok: true });
        const result = validateBusinessProcessForPublish(withViews);
        expect(result.errors).toEqual([]);
        for (const s of enrollment(withViews).stages) {
            for (const t of s.stage_operating_plan_v1?.work_templates ?? []) expect(t.template_key).toBeTruthy();
        }
    });

    it("the published projection is what the runtime resolves: each stage's stored plan, with the lost exit to `closed`", () => {
        const { config, processId } = cleanTenant();
        const published = applyThroughRoutes(config, processId);
        const departmentMetadata = { lifecycle_builder_v1: published };
        for (const key of EXPECTED_STAGES) {
            const r = resolveEffectiveStageOperatingPlan({ departmentMetadata, builderStageKey: key });
            expect({ key, source: r.source }).not.toEqual({ key, source: "enrollment_default" });
            expect(r.plan?.stage_key ?? key).toBe(key);
        }
        const lead = resolveEffectiveStageOperatingPlan({ departmentMetadata, builderStageKey: "lead" });
        expect(lead.plan?.outgoing_transitions?.find((e) => e.transition_ref === "lead_to_closed_lost")?.target_stage_key).toBe("closed");
        const waitlist = resolveEffectiveStageOperatingPlan({ departmentMetadata, builderStageKey: "waitlist" });
        expect(waitlist.plan?.outgoing_transitions?.map((e) => e.transition_ref)).toEqual(["waitlist_to_enrolling"]);
        const decision = resolveEffectiveStageOperatingPlan({ departmentMetadata, builderStageKey: "decision" });
        expect(decision.plan?.outgoing_transitions?.map((e) => e.target_stage_key)).not.toContain("waitlist");
    });

    it("the runtime fallback for stages WITHOUT a stored plan is unchanged (shared defaults untouched)", () => {
        // The repair lives in template application. The defaults stay as they were, so the runtime fallback
        // (which strips movement) does not start closing cases it never closed before.
        for (const x of LOST_EXITS) {
            const defaults = defaultStageOperatingPlanForEnrollmentStage(x.stage)!;
            const rule = defaults.outcome_rules!.find((r) => r.when_outcome_key === x.outcome)!;
            expect(rule.targets.some((t) => t.kind === "update_family_case_status")).toBe(false);
        }
        expect(defaultStageOperatingPlanForEnrollmentStage("decision")!.outgoing_transitions!.map((e) => e.transition_ref)).toContain("decision_to_waitlist");
        expect(defaultStageOperatingPlanForEnrollmentStage("waitlist")!.outgoing_transitions ?? []).toEqual([]);
    });

    it("existing Enrollment configuration is not touched: a process with stages is still refused", () => {
        const { config, processId } = cleanTenant();
        const applied = applyThroughRoutes(config, processId);
        expect(() => applyEnrollmentTemplateInConfig(applied, processId)).toThrow(/already has stages/);
    });

    it("invalid configuration still fails: a dangling destination is refused by the same save gate", () => {
        const { config, processId } = cleanTenant();
        const applied = applyThroughRoutes(config, processId);
        const p = enrollment(applied);
        const broken: LifecycleBuilderV1 = {
            ...applied,
            processes: [{
                ...p,
                stages: p.stages.map((s) => s.key !== "tour" ? s : {
                    ...s,
                    stage_operating_plan_v1: {
                        ...s.stage_operating_plan_v1!,
                        outgoing_transitions: s.stage_operating_plan_v1!.outgoing_transitions!.map((e) =>
                            e.transition_ref === "tour_to_closed_lost" ? { ...e, target_stage_key: "closed_lost" } : e),
                    },
                }),
            }],
        };
        const r = validateConfiguredStageReferences(broken);
        expect(r.ok).toBe(false);
        expect(JSON.stringify(r)).toContain("closed_lost");
    });

    it("the template only ever closes onto its own family terminal stage; a process without one is refused, not guessed", () => {
        const { config } = cleanTenant();
        const base = enrollment(config);
        // The template's own output: every closing exit lands on `closed`, a family stage it creates.
        const applied = applyEnrollmentTemplateToProcess(base);
        const closing = applied.stages.flatMap((s) => (s.stage_operating_plan_v1?.outgoing_transitions ?? []).filter((e) => e.closes_record === true));
        expect(closing.length).toBeGreaterThan(0);
        expect(new Set(closing.map((e) => e.target_stage_key))).toEqual(new Set(["closed"]));
        expect(stage(applied, "closed").grain).toBe("family");
        // A configuration with no family terminal stage is refused by the canonical correction rather than guessed:
        const noTerminal = correctInvalidClosedLostTargets({
            version: 1, active_process_id: base.id,
            processes: [{ ...base, stages: [{ id: "x", key: "lead", label: "Lead", is_active: true, sort_order: 0, grain: "family",
                stage_operating_plan_v1: { ...defaultStageOperatingPlanForEnrollmentStage("lead")! } } as never] }],
        });
        expect(noTerminal.refusals.length).toBe(1);
    });

    it("Assignments and Billing processes in the same configuration are left exactly as they were", () => {
        let config = createLifecycleProcess("Enrollment", emptyLifecycleBuilderV1(), { primary_entity: "opportunity" });
        config = createLifecycleProcess("Assignments", config, { process_model: { kind: "domain_projection", domain: "assignments" } as never });
        config = createLifecycleProcess("Billing", config, { process_model: { kind: "domain_projection", domain: "billing" } as never });
        const others = (c: LifecycleBuilderV1) => c.processes.filter((p) => p.key !== "enrollment");
        const before = structuredClone(others(config));
        expect(before.map((p) => p.key).sort()).toEqual(["assignments", "billing"]);
        const applied = applyEnrollmentTemplateInConfig(config, enrollment(config).id);
        expect(others(applied)).toEqual(before);
    });
});
