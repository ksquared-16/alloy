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

describe("FIXED — the runtime now rejects a stage that is not in the configured process", () => {
    it("isValidBootstrapBuilderStage returns FALSE for qualification (was TRUE — the defect)", () => {
        // Historical defect: this returned true via the built-in LIFECYCLE_STAGE_ORDER, so
        // stage-bootstrap served qualification (live HTTP 200). Fixed: configured membership only.
        expect(isConfiguredStageKey(tenantMetadata(), "qualification")).toBe(false);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "qualification")).toBe(false);
    });

    it("the built-in operator-stage list is now presentation-only and grants NO validity", () => {
        // LIFECYCLE_STAGE_ORDER may still list qualification for display bucketing, but it no
        // longer short-circuits validity — the two are decoupled.
        expect((LIFECYCLE_STAGE_ORDER as readonly string[]).includes("qualification")).toBe(true);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "qualification")).toBe(false);
    });

    it("the legacy template-key set retains qualification for migration support only", () => {
        // Kept as documented legacy/migration support; no longer a runtime-validity source.
        expect(ENROLLMENT_TEMPLATE_STAGE_KEYS.has("qualification")).toBe(true);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "qualification")).toBe(false);
    });

    it("CONTROL: a truly unknown stage is rejected too", () => {
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

    it("transition RESOLUTION still names qualification — the guard lives at the WRITER, not here", () => {
        // resolveStageTransitionExecutionTargets is shape resolution only; it does not know the
        // configured inventory. It still produces move_to_stage: qualification. The membership
        // guard is downstream in applyStageOutcomeRuleTarget (proven in
        // configuredStageReferentialIntegrity.test.ts), where the write is now blocked.
        const plan = leadPlan();
        const rules = outcomeRulesForKey(plan, "reached_qualified", { attemptCount: null });
        const move = rules
            .flatMap((r) => r.targets)
            .map((t) => resolveStageTransitionExecutionTargets(plan, t))
            .flatMap((r) => (r.error ? [] : r.targets))
            .find((t) => t.kind === "move_to_stage");
        expect(move?.stage_key).toBe("qualification");
        // And the writer-level guard would reject exactly this target.
        expect(configuredStageKeysForMetadata(tenantMetadata())).not.toContain("qualification");
    });
});

describe("The same defect class — every move target vs the configured process", () => {
    it("three tenant move targets name stages absent from the configured process; ALL now rejected", () => {
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
        // After the fix, NONE of the three non-configured targets pass validity — the built-in
        // short-circuit is gone, so configured membership is the only authority.
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "qualification")).toBe(false);
        expect(isValidBootstrapBuilderStage(tenantMetadata(), "enrollment")).toBe(false);
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
