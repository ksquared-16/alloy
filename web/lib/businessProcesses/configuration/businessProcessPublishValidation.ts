/**
 * Publication-time validation for a Business Process draft.
 *
 * Decision D3 puts the hard integrity boundary at publish, not at save:
 *
 *   drafting  — block only references this edit introduced (validateTouchedStageReferences)
 *   publish   — the full graph must resolve
 *
 * This is deliberately the *minimum* publish gate, not the finished Law 3 model. It composes the
 * validators that already exist and classifies their findings; extending coverage (work-item,
 * action and attention references, plus the structural-quality warnings) is Law 3's own slice.
 *
 * The class it must reject is the one that started this sprint: an outcome naming
 * `transition_ref: "lead_to_tour"` when the stage declares no such outgoing transition. Nothing in
 * the product caught that — `validateConfiguredStageReferences` could see it but was wired into
 * exactly one of ~15 write paths. Here it sits on the only path that can change runtime.
 */

import type {
    ConfigurationError,
    ConfigurationWarning,
} from "@/lib/businessProcesses/configuration/configurationDiagnostics";
import {
    parseLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    validateProcessStageReferences,
    type StageReferenceViolation,
} from "@/lib/lifecycle/validateConfiguredStageReferences";
import { validateProcessExecutionGraph } from "@/lib/businessProcesses/configuration/executionGraphValidation";

export const PUBLISH_UNREADABLE_PAYLOAD = "configuration_unreadable" as const;
export const PUBLISH_DANGLING_REFERENCE = "dangling_stage_reference" as const;
export const PUBLISH_NO_ACTIVE_PROCESS = "no_active_process" as const;
export const PUBLISH_DUPLICATE_STAGE_KEY = "duplicate_stage_key" as const;
export const PUBLISH_EMPTY_PROCESS = "process_has_no_stages" as const;

export type PublishValidationResult = {
    /** Publication is refused while this is non-empty. */
    errors: ConfigurationError[];
    /** Reported, never blocking — a mid-build process is allowed to be imperfect. */
    warnings: ConfigurationWarning[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function referenceDiagnostic(v: StageReferenceViolation): ConfigurationError {
    return {
        code: PUBLISH_DANGLING_REFERENCE,
        stage_key: v.source_stage,
        path: `processes[${v.process_key ?? "?"}].stages[${v.source_stage}].stage_operating_plan_v1`,
        message: v.message,
        detail: {
            reference: v.reference,
            reference_kind: v.reference_kind,
            invalid_target: v.invalid_target,
            configured_stages: v.configured_stages,
        },
    };
}

/**
 * Validate a stored draft payload for publication.
 *
 * Takes the raw payload rather than a parsed builder on purpose: an unparseable payload is itself
 * a blocking finding, and Law 1 forbids degrading it to a default and publishing that.
 */
export function validateBusinessProcessForPublish(payload: unknown): PublishValidationResult {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    if (!isRecord(payload)) {
        return {
            errors: [
                {
                    code: PUBLISH_UNREADABLE_PAYLOAD,
                    message: "This configuration cannot be read, so it cannot be published.",
                    path: "lifecycle_builder_v1",
                },
            ],
            warnings,
        };
    }

    const builder = parseLifecycleBuilderV1(payload);
    if (!builder) {
        return {
            errors: [
                {
                    code: PUBLISH_UNREADABLE_PAYLOAD,
                    message: "This configuration cannot be read, so it cannot be published.",
                    path: "lifecycle_builder_v1",
                },
            ],
            warnings,
        };
    }

    return validateParsedBusinessProcessForPublish(builder, payload);
}

/** The same gate over an already-parsed builder, for callers holding one. */
export function validateParsedBusinessProcessForPublish(
    builder: LifecycleBuilderV1,
    rawPayload?: unknown,
): PublishValidationResult {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    const activeProcesses = builder.processes.filter((p) => p.is_active);
    if (!activeProcesses.length) {
        errors.push({
            code: PUBLISH_NO_ACTIVE_PROCESS,
            message: "This Business Process has no active process to publish.",
            path: "processes",
        });
        return { errors, warnings };
    }

    // Walk the RAW payload where available: it carries the residue this branch does not model, and
    // a reference can live in a field a newer writer authored.
    const rawProcesses =
        isRecord(rawPayload) && Array.isArray(rawPayload.processes) ? rawPayload.processes : null;

    for (const process of activeProcesses) {
        const rawProcess =
            rawProcesses?.find(
                (p) => isRecord(p) && String(p.id ?? "") === process.id,
            ) ?? process;

        // THE EXECUTION GRAPH owns everything about transitions and movements: identity,
        // source/destination existence, outgoing membership, and whether an outcome may actually
        // use the transition it names.
        const graph = validateProcessExecutionGraph(rawProcess);
        errors.push(...graph.errors);
        warnings.push(...graph.warnings);

        // The older walker is kept ONLY for the reference kinds the graph model does not cover —
        // `next_stage_key`, `return_stage_key` and friends on arbitrary targets. Its `transition`
        // and `move_to_stage` findings are deliberately dropped: they duplicate the graph's, and
        // its wording is actively misleading, reporting a missing transition as
        // `targets stage "lead_to_tour"` — a transition ref described as a stage name.
        const result = validateProcessStageReferences(rawProcess);
        if (!result.ok) {
            errors.push(
                ...result.violations
                    .filter((v) => v.reference_kind.startsWith("nested_target:"))
                    .map(referenceDiagnostic),
            );
        }

        const activeStages = process.stages.filter((s) => s.is_active);
        if (!activeStages.length) {
            // A process with no stages cannot execute, but it is a legitimate mid-build state and
            // publishing it breaks nothing that was working. Warning, per Law 3's severity rule.
            warnings.push({
                code: PUBLISH_EMPTY_PROCESS,
                message: `Process “${process.name}” has no active stages.`,
                path: `processes[${process.key}]`,
            });
        }

        // Identity uniqueness is enforced nowhere on the read path except command_set_v1
        // (Law 2 audit). A duplicate stage key resolves first-wins and silently shadows, so it must
        // not reach runtime.
        const seen = new Set<string>();
        for (const stage of activeStages) {
            if (seen.has(stage.key)) {
                errors.push({
                    code: PUBLISH_DUPLICATE_STAGE_KEY,
                    stage_key: stage.key,
                    path: `processes[${process.key}].stages[${stage.key}]`,
                    message:
                        `Two active stages share the key “${stage.key}”. One would silently shadow ` +
                        `the other at runtime.`,
                });
            }
            seen.add(stage.key);
        }
    }

    return { errors, warnings };
}
