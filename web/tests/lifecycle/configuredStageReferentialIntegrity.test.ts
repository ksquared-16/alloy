/**
 * Configured Stage Referential Integrity — the platform contract.
 *
 * Proves the core doctrine end to end at the unit level: a stage is valid ONLY when explicitly
 * present in the configured Business Process; built-in lists, templates and legacy constants
 * never grant runtime validity; and a non-configured stage move never writes.
 *
 * Uses BOTH an enrollment fixture and a non-enrollment fixture, and an arbitrary stage name, to
 * prove the rule is process-driven, not vocabulary-driven.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isValidBootstrapBuilderStage } from "@/lib/lifecycle/buildLifecycleStageBootstrap";
import {
    configuredStageInventoryFromMetadata,
    isStageInConfiguredInventory,
    assertStageConfigured,
} from "@/lib/lifecycle/configuredStageInventory";
import { validateConfiguredStageReferences } from "@/lib/lifecycle/validateConfiguredStageReferences";
import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import {
    CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS,
    ENROLLMENT_STAGE_SPECS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** Build department metadata whose active process has exactly the given stages + key. */
function processMetadata(processKey: string, stageKeys: string[]): Record<string, unknown> {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: `proc-${processKey}`,
            processes: [
                {
                    id: `proc-${processKey}`,
                    key: processKey,
                    name: processKey,
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: stageKeys.map((key, i) => ({
                        id: `stage-${key}`,
                        key,
                        label: key,
                        sort_order: i,
                        is_active: true,
                    })),
                },
            ],
        },
    };
}

describe("stage validity is configured-membership only", () => {
    it("a configured custom stage named `qualification` IS valid", () => {
        // If a process explicitly configures qualification, it works — the rule is membership,
        // not a banned word.
        const meta = processMetadata("enrollment", ["lead", "qualification", "tour"]);
        expect(isValidBootstrapBuilderStage(meta, "qualification")).toBe(true);
        expect(isStageInConfiguredInventory(configuredStageInventoryFromMetadata(meta), "qualification")).toBe(true);
    });

    it("the SAME key `qualification` is REJECTED when absent from the configured process", () => {
        const meta = processMetadata("enrollment", ["lead", "tour", "decision", "waitlist", "enrolling", "enrolled"]);
        expect(isValidBootstrapBuilderStage(meta, "qualification")).toBe(false);
    });

    it("an arbitrary stage name works with no presentation-code changes — process-driven", () => {
        const meta = processMetadata("support", ["triage", "banana_stage", "resolved"]);
        expect(isValidBootstrapBuilderStage(meta, "banana_stage")).toBe(true);
        expect(isValidBootstrapBuilderStage(meta, "not_configured")).toBe(false);
    });

    it("a non-enrollment process is governed by the same rule", () => {
        const meta = processMetadata("onboarding", ["invited", "active"]);
        expect(isValidBootstrapBuilderStage(meta, "active")).toBe(true);
        // enrollment built-in vocabulary grants NOTHING in a non-enrollment process.
        expect(isValidBootstrapBuilderStage(meta, "qualification")).toBe(false);
        expect(isValidBootstrapBuilderStage(meta, "enrolling")).toBe(false);
    });

    it("bootstrap cannot return a non-configured stage (validity gate closed)", () => {
        const meta = processMetadata("enrollment", ["lead", "tour"]);
        for (const bad of ["qualification", "enrollment", "closed_withdrawn", "zzz"]) {
            expect(isValidBootstrapBuilderStage(meta, bad)).toBe(false);
        }
    });
});

describe("move_to_stage cannot write a non-configured stage", () => {
    const orgId = "org-1";
    const departmentId = "dept-1";
    const configuredMeta = processMetadata("enrollment", ["lead", "tour", "decision"]);

    let writes: string[];
    function supabaseWith(meta: Record<string, unknown>) {
        writes = [];
        return {
            from: (table: string) => {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = async () =>
                    table === "departments" ? { data: { metadata: meta }, error: null } : { data: { stage_key: "lead" }, error: null };
                chain.update = () => {
                    writes.push(table);
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                };
                return chain;
            },
        };
    }

    const move = (stageKey: string) => ({
        orgId,
        userId: "user-1",
        departmentId,
        stageKey: "lead",
        plan: { stage_key: "lead", journey_segment: "family", work_templates: [], outcomes: [], outcome_rules: [], attention_rules: [] } as unknown as StageOperatingPlanV1,
        subject: { journey_segment: "family" as const, opportunity_id: "opp-1" },
        target: { kind: "move_to_stage" as const, stage_key: stageKey },
    });

    it("rejects a move to a non-configured stage and writes NOTHING", async () => {
        const supabase = supabaseWith(configuredMeta);
        const result = await applyStageOutcomeRuleTarget(supabase as never, move("qualification"));
        expect(result.error).toContain("not part of the configured Business Process");
        expect(writes).toEqual([]); // no opportunities write
        expect(result.undo).toBeUndefined();
    });

    it("executes a move to a CONFIGURED stage (decision)", async () => {
        const supabase = supabaseWith(configuredMeta);
        const result = await applyStageOutcomeRuleTarget(supabase as never, move("decision"));
        expect(result.error).toBeUndefined();
        expect(writes).toContain("opportunities");
    });
});

describe("a rejected move creates no activity and no next work", () => {
    it("the guard returns before any write — no status update, no undo (nothing to compensate)", async () => {
        // The guard short-circuits move_to_stage before the opportunities/process_instances write
        // and before any activity/next-work step downstream. Proven at the writer: error + no undo.
        const configuredMeta = processMetadata("enrollment", ["lead", "tour"]);
        const writes: string[] = [];
        const supabase = {
            from: (table: string) => {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = async () =>
                    table === "departments" ? { data: { metadata: configuredMeta }, error: null } : { data: { stage_key: "lead" }, error: null };
                chain.update = () => {
                    writes.push(table);
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                };
                return chain;
            },
        };
        const result = await applyStageOutcomeRuleTarget(supabase as never, {
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            stageKey: "lead",
            plan: { stage_key: "lead", journey_segment: "family", work_templates: [], outcomes: [], outcome_rules: [], attention_rules: [] } as unknown as StageOperatingPlanV1,
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            target: { kind: "move_to_stage", stage_key: "qualification" },
        });
        expect(result.error).toContain("not part of the configured Business Process");
        expect(result.undo).toBeUndefined();
        expect(result.status_updated).toBeUndefined();
        expect(writes).toEqual([]); // no opportunities/process_instances write; nothing downstream
    });
});

describe("fresh tenants contain no hidden qualification stage", () => {
    it("the current enrollment template stage set excludes qualification", () => {
        expect(CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS.has("qualification")).toBe(false);
        expect(ENROLLMENT_STAGE_SPECS.map((s) => s.key)).not.toContain("qualification");
        // decision IS a fresh-template stage.
        expect(ENROLLMENT_STAGE_SPECS.map((s) => s.key)).toContain("decision");
    });

    it("a freshly-configured tenant (template stages only) rejects a qualification bootstrap", () => {
        const meta = processMetadata(
            "enrollment",
            ENROLLMENT_STAGE_SPECS.map((s) => s.key),
        );
        expect(isValidBootstrapBuilderStage(meta, "qualification")).toBe(false);
        expect(isValidBootstrapBuilderStage(meta, "decision")).toBe(true);
    });
});

describe("assertStageConfigured surfaces a clear configuration error", () => {
    it("names the stage and the configured set", () => {
        const inv = configuredStageInventoryFromMetadata(processMetadata("enrollment", ["lead", "tour"]));
        const res = assertStageConfigured(inv, "qualification");
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error.stage_key).toBe("qualification");
            expect(res.error.configured_stages).toEqual(["lead", "tour"]);
            expect(res.error.message).toContain("configuration error");
        }
    });
});

describe("publish rejects dangling references", () => {
    function planWith(overrides: Partial<StageOperatingPlanV1>): unknown {
        return { stage_key: "x", journey_segment: "family", work_templates: [], outcomes: [], outcome_rules: [], attention_rules: [], ...overrides };
    }

    it("rejects a dangling outcome move_to_stage target", () => {
        const config = {
            version: 1,
            active_process_id: "p",
            processes: [
                {
                    id: "p",
                    key: "enrollment",
                    stages: [
                        {
                            key: "lead",
                            is_active: true,
                            stage_operating_plan_v1: planWith({
                                outcome_rules: [
                                    { rule_key: "r", when_outcome_key: "o", targets: [{ kind: "move_to_stage", stage_key: "qualification" }] },
                                ] as never,
                            }),
                        },
                        { key: "tour", is_active: true },
                    ],
                },
            ],
        };
        const res = validateConfiguredStageReferences(config);
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.violations[0]).toMatchObject({
                source_stage: "lead",
                invalid_target: "qualification",
                reference_kind: "move_to_stage",
            });
        }
    });

    it("rejects a dangling transition target", () => {
        const config = {
            processes: [
                {
                    key: "enrollment",
                    stages: [
                        {
                            key: "tour",
                            is_active: true,
                            stage_operating_plan_v1: planWith({
                                outgoing_transitions: [{ transition_ref: "t1", source_stage_key: "tour", target_stage_key: "decision", available: true }],
                            } as never),
                        },
                        { key: "waitlist", is_active: true },
                    ],
                },
            ],
        };
        const res = validateConfiguredStageReferences(config);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.violations[0].invalid_target).toBe("decision");
    });

    it("rejects a dangling automation/nested target field", () => {
        const config = {
            processes: [
                {
                    key: "enrollment",
                    stages: [
                        {
                            key: "waitlist",
                            is_active: true,
                            stage_operating_plan_v1: planWith({
                                outcome_rules: [
                                    { rule_key: "auto", when_enter_status_key: "s", targets: [{ kind: "some_automation", next_stage_key: "enrollment" }] },
                                ] as never,
                            }),
                        },
                        { key: "enrolling", is_active: true },
                    ],
                },
            ],
        };
        const res = validateConfiguredStageReferences(config);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.violations[0].invalid_target).toBe("enrollment");
    });

    it("accepts a config whose references are all configured (including a valid decision)", () => {
        const config = {
            processes: [
                {
                    key: "enrollment",
                    stages: [
                        {
                            key: "tour",
                            is_active: true,
                            stage_operating_plan_v1: planWith({
                                outgoing_transitions: [{ transition_ref: "t1", source_stage_key: "tour", target_stage_key: "decision", available: true }],
                                outcome_rules: [
                                    { rule_key: "r", when_outcome_key: "o", targets: [{ kind: "move_to_stage", transition_ref: "t1" }] },
                                ] as never,
                            }),
                        },
                        { key: "decision", is_active: true },
                    ],
                },
            ],
        };
        expect(validateConfiguredStageReferences(config).ok).toBe(true);
    });
});
