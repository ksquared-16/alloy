/**
 * Firefly tenant remediation — dangling stage reference cleanup.
 *
 * Proves the remediation is correct + idempotent against the tenant's REAL captured config, and
 * that it preserves valid stages (decision) while removing/blocking dangling targets.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { remediateDanglingStageReferences } from "@/lib/lifecycle/remediateDanglingStageReferences";
import { validateConfiguredStageReferences } from "@/lib/lifecycle/validateConfiguredStageReferences";

const RAW = path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config/raw-builder.json");

function fireflyConfig(): unknown {
    return (JSON.parse(fs.readFileSync(RAW, "utf8")) as { body: { config: unknown } }).body.config;
}

describe("remediation of the live Firefly config", () => {
    it("removes exactly the three known dangling move targets, preserving decision", () => {
        const { changed, cleanedConfig, removals } = remediateDanglingStageReferences(fireflyConfig());
        expect(changed).toBe(true);
        const summary = removals.map((r) => `${r.source_stage}->${r.invalid_target}`).sort();
        expect(summary).toEqual(["enrolling->closed_withdrawn", "lead->qualification", "waitlist->enrollment"]);
        // decision was never touched — it is a valid configured stage.
        expect(removals.find((r) => r.invalid_target === "decision")).toBeUndefined();
        // The cleaned config now passes referential-integrity validation.
        expect(validateConfiguredStageReferences(cleanedConfig).ok).toBe(true);
    });

    it("is idempotent — re-running on the cleaned config makes no further change", () => {
        const first = remediateDanglingStageReferences(fireflyConfig());
        const second = remediateDanglingStageReferences(first.cleanedConfig);
        expect(second.changed).toBe(false);
        expect(second.removals).toEqual([]);
    });

    it("leaves the valid tour->decision transition intact and available", () => {
        const { cleanedConfig } = remediateDanglingStageReferences(fireflyConfig());
        const cfg = cleanedConfig as { processes: Array<{ stages: Array<Record<string, unknown>> }> };
        const tour = cfg.processes[0].stages.find((s) => s.key === "tour") as {
            stage_operating_plan_v1?: { outgoing_transitions?: Array<Record<string, unknown>> };
        };
        const toDecision = tour.stage_operating_plan_v1?.outgoing_transitions?.find(
            (t) => t.target_stage_key === "decision",
        );
        expect(toDecision?.available).not.toBe(false);
    });
});

describe("remediation does not invent destinations", () => {
    it("removes the invalid move target rather than repointing it", () => {
        const config = {
            processes: [
                {
                    key: "enrollment",
                    stages: [
                        {
                            key: "lead",
                            is_active: true,
                            stage_operating_plan_v1: {
                                outcome_rules: [
                                    {
                                        rule_key: "reached",
                                        when_outcome_key: "reached",
                                        targets: [
                                            { kind: "update_family_case_status", status_key: "open" },
                                            { kind: "move_to_stage", stage_key: "qualification" },
                                            { kind: "mark_stage_work_complete" },
                                        ],
                                    },
                                ],
                            },
                        },
                        { key: "tour", is_active: true },
                    ],
                },
            ],
        };
        const { cleanedConfig, removals } = remediateDanglingStageReferences(config);
        expect(removals).toHaveLength(1);
        const cfg = cleanedConfig as { processes: Array<{ stages: Array<Record<string, unknown>> }> };
        const lead = cfg.processes[0].stages[0] as {
            stage_operating_plan_v1: { outcome_rules: Array<{ targets: Array<{ kind: string }> }> };
        };
        // The other two targets survive; only the dangling move was removed — nothing invented.
        expect(lead.stage_operating_plan_v1.outcome_rules[0].targets.map((t) => t.kind)).toEqual([
            "update_family_case_status",
            "mark_stage_work_complete",
        ]);
    });
});
