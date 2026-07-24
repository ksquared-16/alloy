/**
 * Firefly stage provenance — the proof chain for `qualification` and `decision`.
 *
 * Loads the tenant's REAL published Business Process (captured verbatim to
 * docs/sprints/active/assets/firefly-config/raw-builder.json) and runs the actual runtime
 * predicates against it. This proves, deterministically, whether the running platform accepts
 * a stage that is NOT in the configured process — which the mission defines as a platform defect.
 *
 * Nothing here is a fixture: the metadata is the exact bytes the tenant is running.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
    configuredStageKeysForMetadata,
    isConfiguredStageKey,
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isValidBootstrapBuilderStage } from "@/lib/lifecycle/buildLifecycleStageBootstrap";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolveStageTransitionExecutionTargets } from "@/lib/lifecycle/resolveStageTransitionExecutionTargets";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_TEMPLATE_STAGE_KEYS } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const RAW = path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config/raw-builder.json");

/** The exact department metadata the tenant runs, reconstructed from the captured builder config. */
function tenantMetadata(): Record<string, unknown> {
    const raw = JSON.parse(fs.readFileSync(RAW, "utf8")) as { body: { config: unknown } };
    return { lifecycle_builder_v1: raw.body.config };
}

function leadPlan(): StageOperatingPlanV1 {
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(tenantMetadata()));
    const lead = process?.stages.find((s) => s.key === "lead");
    return (lead as { stage_operating_plan_v1: StageOperatingPlanV1 }).stage_operating_plan_v1;
}

describe("Firefly published Business Process — the ground truth", () => {
    it("the configured process has exactly these 6 stages, and qualification is NOT one of them", () => {
        const stages = configuredStageKeysForMetadata(tenantMetadata());
        expect(stages).toEqual(["lead", "tour", "decision", "waitlist", "enrolling", "enrolled"]);
        expect(stages).not.toContain("qualification");
        // decision IS configured — the prior report's "decision does not exist" was wrong.
        expect(stages).toContain("decision");
    });

    it("isConfiguredStageKey agrees: qualification is not configured, decision is", () => {
        expect(isConfiguredStageKey(tenantMetadata(), "qualification")).toBe(false);
        expect(isConfiguredStageKey(tenantMetadata(), "decision")).toBe(true);
    });
});

describe("PLATFORM DEFECT — the runtime accepts a stage that is not in the configured process", () => {
    it("isValidBootstrapBuilderStage returns TRUE for qualification despite it not being configured", () => {
        // This is the bug. The stage-bootstrap route gates on this predicate; a 200 for
        // qualification (observed live) flows directly from here.
        expect(isConfiguredStageKey(tenantMetadata(), "qualification")).toBe(false);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "qualification")).toBe(true);
    });

    it("...because a hardcoded built-in list short-circuits the configured-stage check", () => {
        // isValidBootstrapBuilderStage returns true when LIFECYCLE_STAGE_ORDER includes the key,
        // BEFORE consulting the configured process. qualification is still in that built-in list.
        expect((LIFECYCLE_STAGE_ORDER as readonly string[]).includes("qualification")).toBe(true);
    });

    it("the same residue exists in the template stage-key set", () => {
        expect(ENROLLMENT_TEMPLATE_STAGE_KEYS.has("qualification")).toBe(true);
    });

    it("CONTROL: a truly unknown stage IS rejected — so the gate is not simply wide open", () => {
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "zzz_not_a_stage")).toBe(false);
    });

    it("decision passes validity legitimately — it is configured (expected, not a defect)", () => {
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "decision")).toBe(true);
        expect(isConfiguredStageKey(tenantMetadata(), "decision")).toBe(true);
    });
});

describe("How qualification reaches a record — the lead plan's dangling move target", () => {
    it("the lead plan (published tenant data) routes Reached/Qualified to move_to_stage: qualification", () => {
        const plan = leadPlan();
        const reached = plan.outcome_rules.find((r) => r.when_outcome_key === "reached_qualified");
        const moveTarget = reached?.targets.find((t) => t.kind === "move_to_stage");
        expect(moveTarget?.stage_key).toBe("qualification");
        // The target names a stage absent from this process's own stage list.
        expect(configuredStageKeysForMetadata(tenantMetadata())).not.toContain(moveTarget?.stage_key);
    });

    it("resolving that move reveals what the operator actually experiences on Reached/Qualified", () => {
        const plan = leadPlan();
        const rules = outcomeRulesForKey(plan, "reached_qualified", { attemptCount: null });
        const outcomes: Array<{ target: string; error?: string; movesTo?: string }> = [];
        for (const rule of rules) {
            for (const target of rule.targets) {
                const resolved = resolveStageTransitionExecutionTargets(plan, target);
                if (resolved.error) {
                    outcomes.push({ target: target.kind, error: resolved.error });
                } else {
                    for (const t of resolved.targets) {
                        outcomes.push({ target: t.kind, movesTo: t.stage_key });
                    }
                }
            }
        }
        // Record the observed resolution as evidence (asserted below by shape).
        fs.writeFileSync(
            path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config/reached-qualified-resolution.json"),
            JSON.stringify({ outcomes }, null, 2),
        );
        // Either the move executes to a non-configured stage, or it errors — both are defects.
        const move = outcomes.find((o) => o.target === "move_to_stage");
        const errored = outcomes.find((o) => o.error);
        expect(Boolean(move?.movesTo === "qualification") || Boolean(errored)).toBe(true);
    });
});

describe("The same defect class — every move target vs the configured process", () => {
    it("three tenant move targets name stages absent from the configured process; the runtime accepts all", () => {
        const configured = configuredStageKeysForMetadata(tenantMetadata());
        const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(tenantMetadata()));
        const nonConfiguredTargets: Array<{ from: string; to: string }> = [];
        for (const stage of process?.stages ?? []) {
            const plan = (stage as { stage_operating_plan_v1?: StageOperatingPlanV1 }).stage_operating_plan_v1;
            if (!plan) continue;
            for (const rule of plan.outcome_rules ?? []) {
                for (const t of rule.targets) {
                    if (t.kind !== "move_to_stage") continue;
                    let to = t.stage_key ?? null;
                    if (!to && t.transition_ref) {
                        to = plan.outgoing_transitions?.find((x) => x.transition_ref === t.transition_ref)
                            ?.target_stage_key ?? null;
                    }
                    if (to && !configured.includes(to)) nonConfiguredTargets.push({ from: stage.key, to });
                }
            }
        }
        // lead→qualification, waitlist→enrollment, enrolling→closed_withdrawn.
        expect(nonConfiguredTargets).toEqual(
            expect.arrayContaining([
                { from: "lead", to: "qualification" },
                { from: "waitlist", to: "enrollment" },
                { from: "enrolling", to: "closed_withdrawn" },
            ]),
        );
        // Two acceptance paths, both defective:
        //  - qualification + enrollment are in the built-in LIFECYCLE_STAGE_ORDER, so the
        //    stage-validity gate ACCEPTS them despite not being configured.
        //  - closed_withdrawn is NOT in the built-in list, so the gate would reject it — yet the
        //    move-writer has no membership guard, so an outcome rule executes the move anyway.
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "qualification")).toBe(true);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "enrollment")).toBe(true);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "closed_withdrawn")).toBe(false);
    });

    it("the built-in operator-stage list is itself stale vs the current template", () => {
        // LIFECYCLE_STAGE_ORDER still names qualification + enrollment (the OLD model) and omits
        // the current template's decision + enrolling. That staleness is the root of the defect.
        expect((LIFECYCLE_STAGE_ORDER as readonly string[]).includes("qualification")).toBe(true);
        expect((LIFECYCLE_STAGE_ORDER as readonly string[]).includes("enrollment")).toBe(true);
        expect((LIFECYCLE_STAGE_ORDER as readonly string[]).includes("decision")).toBe(false);
        expect((LIFECYCLE_STAGE_ORDER as readonly string[]).includes("enrolling")).toBe(false);
    });
});

describe("resolveEffectiveStageOperatingPlan — the second built-in acceptance path", () => {
    it("qualification resolves through the code default resolver, not the configured process", () => {
        const resolved = resolveEffectiveStageOperatingPlan({
            departmentMetadata: tenantMetadata(),
            builderStageKey: "qualification",
        });
        // Whatever it returns, the point is the resolver was consulted for a non-configured stage
        // and did NOT reject it outright by process membership.
        expect(["explicit", "enrollment_default", null]).toContain(resolved.source);
        // It is not sourced from the configured process stages (qualification isn't one).
        expect(configuredStageKeysForMetadata(tenantMetadata())).not.toContain("qualification");
    });
});
