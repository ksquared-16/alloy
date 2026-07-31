/**
 * Draft-time referential integrity, scoped to what the current edit touched (decision D3).
 *
 * The existing all-or-nothing validator blocks a save whenever ANY stage in the process has a
 * dangling reference. On a legacy tenant that means the operator cannot edit anything until they
 * have first fixed everything — which pushes them onto the unvalidated write paths that caused
 * this sprint. D3 puts the hard boundary at publish and keeps drafting permissive:
 *
 *   block   — a reference this save introduced or changed, on the stage being saved
 *   warn    — every pre-existing defect, anywhere in the graph
 *
 * This is deliberately NOT the Law 3 publish validator. It reuses `validateProcessStageReferences`
 * and diffs before against after; the full-graph publish gate is a separate slice.
 */

import type {
    ConfigurationError,
    ConfigurationWarning,
} from "@/lib/businessProcesses/configuration/configurationDiagnostics";
import {
    activeLifecycleProcess,
    serializeLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    validateProcessStageReferences,
    type StageReferenceViolation,
} from "@/lib/lifecycle/validateConfiguredStageReferences";

export const DANGLING_STAGE_REFERENCE = "dangling_stage_reference" as const;
export const DANGLING_PARENT_STAGE = "dangling_parent_stage_key" as const;

export type TouchedReferenceValidation = {
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
};

/** Identity of a violation, so "already there before" is decidable. */
function signature(v: StageReferenceViolation): string {
    return [v.source_stage, v.reference_kind, v.reference, v.invalid_target].join("|");
}

function violationsForActiveProcess(builder: LifecycleBuilderV1): StageReferenceViolation[] {
    const active = activeLifecycleProcess(builder);
    if (!active) return [];
    // Serialize first: the walker is written against stored JSON shapes, and serializing also
    // splices back unowned residue, so a reference living in a field this branch does not model
    // is still audited.
    const serialized = serializeLifecycleBuilderV1(builder);
    const processes = Array.isArray(serialized.processes) ? serialized.processes : [];
    const process = processes.find(
        (p) => p != null && typeof p === "object" && (p as { id?: unknown }).id === active.id,
    );
    if (!process) return [];
    const result = validateProcessStageReferences(process);
    return result.ok ? [] : result.violations;
}

function diagnostic(v: StageReferenceViolation): ConfigurationError {
    return {
        code: DANGLING_STAGE_REFERENCE,
        stage_key: v.source_stage,
        path: `processes[${v.process_key ?? "?"}].stages[${v.source_stage}]`,
        message: v.message,
        detail: {
            reference: v.reference,
            reference_kind: v.reference_kind,
            invalid_target: v.invalid_target,
            configured_stages: v.configured_stages,
        },
    };
}

export function validateTouchedStageReferences(params: {
    before: LifecycleBuilderV1;
    after: LifecycleBuilderV1;
    /** The stage this save is editing. Only its new violations block. */
    stageKey: string;
}): TouchedReferenceValidation {
    const stageKey = params.stageKey.trim();
    const priorSignatures = new Set(violationsForActiveProcess(params.before).map(signature));

    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    for (const violation of violationsForActiveProcess(params.after)) {
        const isNew = !priorSignatures.has(signature(violation));
        if (isNew && violation.source_stage === stageKey) {
            errors.push(diagnostic(violation));
        } else {
            warnings.push(diagnostic(violation));
        }
    }

    // `parent_stage_key` names a stage but is not walked by validateProcessStageReferences.
    const active = activeLifecycleProcess(params.after);
    if (active) {
        const configured = new Set(active.stages.filter((s) => s.is_active).map((s) => s.key));
        const stage = active.stages.find((s) => s.key === stageKey && s.is_active);
        const parent = stage?.parent_stage_key?.trim();
        const priorParent = activeLifecycleProcess(params.before)
            ?.stages.find((s) => s.key === stageKey && s.is_active)
            ?.parent_stage_key?.trim();
        if (parent && !configured.has(parent) && parent !== priorParent) {
            errors.push({
                code: DANGLING_PARENT_STAGE,
                stage_key: stageKey,
                path: `processes[${active.key}].stages[${stageKey}].parent_stage_key`,
                message:
                    `Stage “${stageKey}” names parent stage “${parent}”, which is not configured ` +
                    `in this Business Process.`,
                detail: { invalid_target: parent, configured_stages: [...configured] },
            });
        }
    }

    return { errors, warnings };
}
