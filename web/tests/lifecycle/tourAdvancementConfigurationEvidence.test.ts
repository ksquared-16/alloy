/**
 * Phase 3 — Business Process integrity: WHY a confirmed tour booking does not advance the
 * configured process.
 *
 * This file does not decide whether booking a tour SHOULD advance the process. That is a
 * product decision and it is open. What it does is produce the runtime evidence for the
 * question, by executing the real configuration through the real rule matcher:
 *
 *   Business Process → Configured Trigger → Configured Rule → Configured Transition → Result
 *
 * The trace ends at "Configured Rule": the trigger fires, the matcher runs, and the
 * configuration contains no rule for it. The machinery is not broken — the rule was never
 * authored. Commit 70bec543e replaced a status-driven mechanism (`opportunities.status_key =
 * "tour_scheduled"`, retired by the status collapse) with a domain signal, and the
 * replacement rule did not land.
 *
 * Nothing here changes behaviour.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyConfiguredStageRulesForDomainSignal } from "@/lib/lifecycle/applyConfiguredStageAutomationRules";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { ENROLLMENT_TEMPLATE_STAGE_KEYS } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { domainSignalRulesForSignal, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const orgId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const departmentId = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: vi.fn(async () => departmentId),
}));

const stageKeys = [...ENROLLMENT_TEMPLATE_STAGE_KEYS] as string[];

function defaultPlans(): Array<{ stageKey: string; plan: StageOperatingPlanV1 }> {
    return stageKeys
        .map((stageKey) => ({ stageKey, plan: defaultStageOperatingPlanForEnrollmentStage(stageKey) }))
        .filter((entry): entry is { stageKey: string; plan: StageOperatingPlanV1 } => entry.plan != null);
}

/** Department metadata whose stages carry the given plans, as a published tenant would. */
function departmentMetadataFor(plans: Array<{ stageKey: string; plan: StageOperatingPlanV1 | null }>) {
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
                    stages: plans.map((entry, index) => ({
                        id: `stage-${entry.stageKey}`,
                        key: entry.stageKey,
                        label: entry.stageKey,
                        sort_order: index,
                        is_active: true,
                        ...(entry.plan ? { stage_operating_plan_v1: entry.plan } : {}),
                    })),
                },
            ],
        },
    };
}

/** Supabase double that records every table touched and every write, so "nothing ran" is observable. */
function recordingSupabase(metadata: Record<string, unknown>) {
    const writes: string[] = [];
    const reads: string[] = [];
    const supabase = {
        from: (table: string) => {
            reads.push(table);
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.maybeSingle = async () => {
                if (table === "departments") return { data: { metadata }, error: null };
                if (table === "opportunities") return { data: { id: opportunityId, metadata: {} }, error: null };
                return { data: null, error: null };
            };
            chain.update = () => {
                writes.push(table);
                return chain;
            };
            return chain;
        },
    };
    return { supabase, writes, reads };
}

describe("Phase 3 evidence — tour_booking scheduled remains on Lead (overlap with Tours Work View)", () => {
    it("Lead owns domain_tour_booking_scheduled_remain; tour_scheduled still owns canceled", () => {
        const found: Array<{ stageKey: string; ruleKey: string; signal: string }> = [];
        for (const { stageKey, plan } of defaultPlans()) {
            for (const rule of plan.outcome_rules ?? []) {
                const signal = rule.when_domain_signal;
                if (signal?.domain === "tour_booking") {
                    found.push({ stageKey, ruleKey: rule.rule_key, signal: signal.signal });
                }
            }
        }

        expect(found).toEqual(
            expect.arrayContaining([
                {
                    stageKey: "lead",
                    ruleKey: "domain_tour_booking_scheduled_remain",
                    signal: "scheduled",
                },
                {
                    stageKey: "tour_scheduled",
                    ruleKey: "domain_tour_booking_canceled_attention",
                    signal: "canceled",
                },
            ]),
        );
        expect(found.some((entry) => entry.signal === "scheduled")).toBe(true);
    });

    it("Lead plan matches {tour_booking, scheduled} → no_movement (Tours lane is booking-based)", () => {
        const lead = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const matched = domainSignalRulesForSignal(lead, "tour_booking", "scheduled");
        expect(matched).toHaveLength(1);
        expect(matched[0]?.rule_key).toBe("domain_tour_booking_scheduled_remain");
        expect(matched[0]?.targets.every((t) => t.kind === "no_movement")).toBe(true);
        expect(matched[0]?.targets.some((t) => t.kind === "move_to_stage")).toBe(false);
    });

    it("the SAME machinery still advances on `canceled`", async () => {
        const { supabase, writes } = recordingSupabase(departmentMetadataFor(defaultPlans()));

        const result = await applyConfiguredStageRulesForDomainSignal({
            supabase: supabase as never,
            orgId,
            opportunityId,
            domain: "tour_booking",
            signal: "canceled",
        });

        expect(result.applied_rule_keys).toEqual(["domain_tour_booking_canceled_attention"]);
        expect(result.needs_attention_set).toBe(true);
        expect(writes).toContain("opportunities");
    });
});

describe("Phase 3 evidence — a published tenant plan SHADOWS the code default", () => {
    it("an explicit stage plan replaces the default outright; there is no merge", () => {
        const tenantPlanWithoutTourRules: StageOperatingPlanV1 = {
            ...defaultStageOperatingPlanForEnrollmentStage("tour_scheduled")!,
            outcome_rules: [],
        };
        const metadata = departmentMetadataFor([
            { stageKey: "tour_scheduled", plan: tenantPlanWithoutTourRules },
        ]);

        const resolved = resolveEffectiveStageOperatingPlan({
            departmentMetadata: metadata,
            builderStageKey: "tour_scheduled",
        });

        expect(resolved.source).toBe("explicit");
        // The default's canceled rule is NOT inherited — adding a rule to code alone would
        // not reach a tenant that already has a published plan.
        expect(domainSignalRulesForSignal(resolved.plan!, "tour_booking", "canceled")).toEqual([]);
    });

    it("with no explicit plan the default applies, so the two sources genuinely diverge", () => {
        const metadata = departmentMetadataFor([{ stageKey: "tour_scheduled", plan: null }]);

        const resolved = resolveEffectiveStageOperatingPlan({
            departmentMetadata: metadata,
            builderStageKey: "tour_scheduled",
        });

        expect(resolved.source).toBe("enrollment_default");
        expect(domainSignalRulesForSignal(resolved.plan!, "tour_booking", "canceled")).toHaveLength(1);
    });
});

describe("Phase 3 evidence — one seed migration destroys another's rule", () => {
    const migrations = join(process.cwd(), "..", "supabase", "migrations");
    const addsCancelRule = "20260622150000_firefly_tour_scheduled_automation_rules.sql";
    const overwritesPlan = "20260622205001_firefly_granular_tour_bp_stages.sql";

    it("20260622150000 adds the canceled rule to the tour_scheduled plan", () => {
        const sql = readFileSync(join(migrations, addsCancelRule), "utf8");
        expect(sql).toContain("domain_tour_booking_canceled_attention");
        // It appends to the EXISTING plan's outcome_rules.
        expect(sql).toContain("'{outcome_rules}'");
    });

    it("20260622205001 then overwrites that whole plan and does NOT carry the rule forward", () => {
        const sql = readFileSync(join(migrations, overwritesPlan), "utf8");
        // Wholesale replacement of stage_operating_plan_v1 for tour_scheduled.
        expect(sql).toContain("jsonb_set(v_stage, '{stage_operating_plan_v1}', c_tour_scheduled_plan, true)");
        // ...and the replacement plan never mentions the rule it replaces.
        expect(sql).not.toContain("domain_tour_booking_canceled_attention");
        // For a tenant that ran both, even the `canceled` signal is now inert.
    });
});
