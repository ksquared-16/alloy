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
 * The defect it locks: the template's family terminal stage is `closed`, but the default operating plans'
 * "Close as Lost" exits on lead / tour / decision target `closed_lost`, which the template never creates —
 * so `apply_enrollment_v2_template` was refused (422 dangling_stage_reference) for every new tenant.
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
        ["new_leads", "New Leads", "lead"],
        ["tours", "Tours", "tour"],
        ["decision", "Decision", "decision"],
        ["registration", "Registration", "enrolling"],
        ["waitlist", "Waitlist", "waitlist"],
    ]
        .map(([id, label, stage], i) => ({
            id, label, row_grain_v1: "family", display_order: i + 1, visible_in_runtime: true,
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

    it("every OTHER exit and outcome keeps exactly the default operating plan's destination", () => {
        const { config, processId } = cleanTenant();
        const p = enrollment(applyThroughRoutes(config, processId));
        const lostRefs = new Set<string>(LOST_EXITS.map((x) => x.ref));
        const lostOutcomes = new Set<string>(LOST_EXITS.map((x) => `${x.stage}:${x.outcome}`));
        for (const s of p.stages) {
            const plan = s.stage_operating_plan_v1;
            const defaults = defaultStageOperatingPlanForEnrollmentStage(s.key);
            if (!plan || !defaults) { expect(plan ?? null).toEqual(defaults ?? null); continue; }
            const exits = (plan.outgoing_transitions ?? []).filter((e) => !lostRefs.has(e.transition_ref));
            const defaultExits = (defaults.outgoing_transitions ?? []).filter((e) => !lostRefs.has(e.transition_ref));
            expect(exits).toEqual(defaultExits);
            expect((plan.outcome_rules ?? []).filter((r) => !lostOutcomes.has(`${s.key}:${r.when_outcome_key}`)))
                .toEqual((defaults.outcome_rules ?? []).filter((r) => !lostOutcomes.has(`${s.key}:${r.when_outcome_key}`)));
            expect(plan.work_templates).toEqual(defaults.work_templates);
            expect(plan.outcomes).toEqual(defaults.outcomes);
        }
    });

    /*
     * PUBLISH: the closed_lost defect is gone; what remains is the template's SECOND, separate defect —
     * family outcomes (`tour.no_availability`, `decision.wants_waitlist`) move the FAMILY onto the
     * child-grain `waitlist` stage, and `waitlist` declares no outgoing transition. What those family
     * outcomes should do instead is an Enrollment product decision (BP V2 S8B-1 closeout, §G), so this
     * locks the exact remaining set: when that decision lands, this list becomes [] and the test says so.
     */
    it("publish validation: no closed_lost-class error remains; only the known Waitlist-grain set is left", () => {
        const { config, processId } = cleanTenant();
        const applied = applyThroughRoutes(config, processId);
        const withViews: LifecycleBuilderV1 = {
            ...applied,
            processes: applied.processes.map((p) => (p.id === processId ? { ...p, work_views_v1: STAGE_VIEWS } as LifecycleBuilderProcessRecord : p)),
        };
        expect(STAGE_VIEWS).toHaveLength(6);
        const result = validateBusinessProcessForPublish(withViews);
        const codes = result.errors.map((e) => `${e.code}:${(e.detail as { contract_code?: string; control_id?: string } | undefined)?.contract_code}:${(e.detail as { control_id?: string } | undefined)?.control_id}`).sort();
        expect(JSON.stringify(result.errors)).not.toContain("closed_lost");
        expect(codes).toEqual([
            "stage_operating_contract:outcome_movement_grain_mismatch:stage-outcome-automation-no_availability-transition",
            "stage_operating_contract:outcome_movement_grain_mismatch:stage-outcome-automation-wants_waitlist-transition",
            "stage_operating_contract:stage_transition_missing:stage-outgoing-transitions",
            "stage_operating_contract:transition_destination_grain_mismatch:stage-transition-decision_to_waitlist",
            "stage_operating_contract:transition_destination_grain_mismatch:stage-transition-tour_to_waitlist",
        ]);
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
    });

    it("the runtime fallback for stages WITHOUT a stored plan is unchanged (shared defaults untouched)", () => {
        // The repair lives in template application. The defaults stay as they were, so the runtime fallback
        // (which strips movement) does not start closing cases it never closed before.
        for (const x of LOST_EXITS) {
            const defaults = defaultStageOperatingPlanForEnrollmentStage(x.stage)!;
            const rule = defaults.outcome_rules!.find((r) => r.when_outcome_key === x.outcome)!;
            expect(rule.targets.some((t) => t.kind === "update_family_case_status")).toBe(false);
        }
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
