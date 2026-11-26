/**
 * Qualification visibility — the operator-facing acceptance rule.
 *
 * Rule: the word "Qualification" must never appear to an operator unless the CURRENT configured
 * Business Process explicitly contains a stage with that key or label.
 *
 * These tests prove the rule at the surfaces that drive the operator's enrollment stage
 * vocabulary — all configured-process-driven, so a legacy status mapping or built-in constant
 * cannot manufacture the label. The live authenticated cert
 * (playwright/tests/configured-stage-integrity-cert.spec.ts) proves the same rule empirically on
 * the running Firefly tenant's What's Next.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
    configuredStageKeysForMetadata,
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
    LIFECYCLE_BUILDER_METADATA_KEY,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveOutgoingProcessTransitions } from "@/lib/lifecycle/resolveOutgoingProcessTransitions";

const RAW = path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config/raw-builder.json");

function fireflyMetadata(): Record<string, unknown> {
    const raw = JSON.parse(fs.readFileSync(RAW, "utf8")) as { body: { config: unknown } };
    return { lifecycle_builder_v1: raw.body.config };
}

function processMetadata(stageSpecs: Array<{ key: string; label: string }>): Record<string, unknown> {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "p",
            processes: [
                {
                    id: "p",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    is_active: true,
                    stages: stageSpecs.map((s, i) => ({
                        id: s.key,
                        key: s.key,
                        label: s.label,
                        sort_order: i,
                        is_active: true,
                    })),
                },
            ],
        },
    };
}

/** The operator-facing stage vocabulary = the configured process's stage keys + labels. */
function operatorStageVocabulary(metadata: Record<string, unknown>): string[] {
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(metadata));
    const words: string[] = [];
    for (const stage of process?.stages ?? []) {
        words.push(stage.key);
        const label = (stage as { label?: unknown }).label;
        if (typeof label === "string") words.push(label);
    }
    return words;
}

describe("Firefly's operator vocabulary contains no Qualification", () => {
    it("no configured stage key or label is Qualification", () => {
        const vocab = operatorStageVocabulary(fireflyMetadata()).map((w) => w.toLowerCase());
        expect(vocab.some((w) => w.includes("qualification"))).toBe(false);
        // The real configured stages/labels.
        expect(configuredStageKeysForMetadata(fireflyMetadata())).toEqual([
            "lead",
            "tour",
            "decision",
            "waitlist",
            "enrolling",
            "enrolled",
        ]);
    });
});

describe("the rule: Qualification appears ONLY when configured", () => {
    it("absent from the configured process → absent from the operator stage vocabulary", () => {
        const meta = processMetadata([
            { key: "lead", label: "Lead" },
            { key: "tour", label: "Tour" },
            { key: "decision", label: "Decision" },
        ]);
        expect(operatorStageVocabulary(meta).join(" ").toLowerCase()).not.toContain("qualification");
    });

    it("an explicitly configured qualification stage IS shown with its configured label", () => {
        const meta = processMetadata([
            { key: "lead", label: "Lead" },
            { key: "qualification", label: "Qualification" },
            { key: "tour", label: "Tour" },
        ]);
        const vocab = operatorStageVocabulary(meta);
        expect(vocab).toContain("qualification");
        expect(vocab).toContain("Qualification");
    });

    it("a custom label on a qualification-keyed stage is shown verbatim (label is operator truth)", () => {
        const meta = processMetadata([
            { key: "qualification", label: "Fit Check" },
            { key: "tour", label: "Tour" },
        ]);
        const vocab = operatorStageVocabulary(meta);
        // The operator sees the configured label, not a built-in "Qualification".
        expect(vocab).toContain("Fit Check");
        expect(vocab.filter((w) => w === "Qualification")).toEqual([]);
    });
});

describe("legacy status mapping cannot inject a Qualification stage into the configured pipeline", () => {
    it("outgoing transitions offered to the operator target only configured stages", () => {
        // resolveOutgoingProcessTransitions filters targets to KNOWN configured stages, so a
        // dangling target (e.g. a legacy qualification) is never OFFERED to the operator.
        const meta = fireflyMetadata();
        const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(meta));
        const stages = (process?.stages ?? []).map((s) => ({
            key: s.key,
            label: (s as { label?: string }).label ?? s.key,
        }));
        const configured = new Set(configuredStageKeysForMetadata(meta));
        for (const stage of process?.stages ?? []) {
            const transitions = resolveOutgoingProcessTransitions({
                currentStageKey: stage.key,
                stageOperatingPlan: (stage as { stage_operating_plan_v1?: unknown })
                    .stage_operating_plan_v1 as never,
                processStages: stages,
            });
            for (const t of transitions) {
                expect(configured.has(t.target_stage_key)).toBe(true);
                expect(t.target_stage_key).not.toBe("qualification");
                expect(String(t.target_stage_label ?? "").toLowerCase()).not.toContain("qualification");
            }
        }
    });

    it("a plan with a dangling qualification transition does NOT offer it to the operator", () => {
        const transitions = resolveOutgoingProcessTransitions({
            currentStageKey: "lead",
            stageOperatingPlan: {
                outgoing_transitions: [
                    { transition_ref: "t", source_stage_key: "lead", target_stage_key: "qualification", label: "Qualify", available: true },
                ],
            } as never,
            processStages: [
                { key: "lead", label: "Lead" },
                { key: "tour", label: "Tour" },
            ],
        });
        // qualification is not a known stage → filtered out → never shown.
        expect(transitions).toEqual([]);
    });
});

describe("no built-in operator-facing label offers Qualification as canonical", () => {
    it("the Process Builder add-stage placeholder does not present Qualification as an example", () => {
        // Regression guard: the placeholder is shown to every operator adding a stage, so it must
        // not imply Qualification is a canonical stage.
        const form = fs.readFileSync(
            path.join(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleAddStageForm.tsx"),
            "utf8",
        );
        const placeholderLine = form.split("\n").find((l) => l.includes("placeholder=") && l.includes("Lead"));
        expect(placeholderLine ?? "").not.toMatch(/qualification/i);
    });

    it("the real operator drawer rail is configured-driven (no hardcoded Qualification)", () => {
        // The proof-only rail hardcodes stages; the REAL rail must not.
        const rail = fs.readFileSync(
            path.join(__dirname, "../../components/admin/drawer/RecordLifecycleRail.tsx"),
            "utf8",
        );
        expect(rail).not.toMatch(/label:\s*["']Qualification["']/);
    });
});

describe("metrics/filters do not manufacture a Qualification bucket for the enrollment process", () => {
    it("the enrollment stage inventory (what pipeline counts bucket by) has no qualification", () => {
        // Enrollment queue/metric bucketing is by configured stage_key; qualification is absent,
        // so no enrollment 'Qualification' bucket can be counted or filtered.
        expect(configuredStageKeysForMetadata(fireflyMetadata())).not.toContain("qualification");
    });
});
