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
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";
import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import {
    isProcessEntryIntent,
    PROCESS_ENTRY_INTENT_SUBJECT_GRAIN,
    PROCESS_ENTRY_INTENTS,
    type ProcessEntryIntentV1,
} from "@/lib/lifecycle/processEntryPointsV1";
import { resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";
import { ENROLLED_CHILD_STATUS_KEY } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

export const PUBLISH_UNREADABLE_PAYLOAD = "configuration_unreadable" as const;
export const PUBLISH_DANGLING_REFERENCE = "dangling_stage_reference" as const;
export const PUBLISH_NO_ACTIVE_PROCESS = "no_active_process" as const;
export const PUBLISH_DUPLICATE_STAGE_KEY = "duplicate_stage_key" as const;
export const PUBLISH_EMPTY_PROCESS = "process_has_no_stages" as const;
/** A Work Template uses a capability the process has not selected. Blocking at publish. */
export const PUBLISH_COMMAND_SET_INCOMPLETE = "process_command_set_incomplete" as const;
/** An operating-contract finding, surfaced under its own contract code in `detail.contract_code`. */
export const PUBLISH_OPERATING_CONTRACT = "stage_operating_contract" as const;
/**
 * An `entry_points_v1` mapping names a stage this process does not have, or has deactivated (D-103).
 *
 * Blocking, and blocking HERE, because a published revision is immutable: a journey pinned to a
 * revision whose entry stage does not resolve can never be repaired by editing the configuration —
 * only by republishing, which leaves the already-pinned journeys behind.
 */
export const PUBLISH_ENTRY_STAGE_UNRESOLVABLE = "process_entry_stage_unresolvable" as const;
/**
 * `entry_points_v1.by_intent` carries a key the platform does not know as an initiation intent.
 *
 * Blocking rather than ignored. The parser drops unknown keys, so an authored typo would otherwise
 * become "that intent is not configured" — which reads as a deliberate choice and fails silently at
 * the moment a real journey starts.
 */
export const PUBLISH_ENTRY_INTENT_UNKNOWN = "process_entry_intent_unknown" as const;
/**
 * An entry intent starts its journeys in a stage whose grain cannot hold that journey's subject.
 *
 * THE PLATFORM-GENERAL RULE: a configured process must not route a subject into a stage whose
 * membership grain cannot own that subject.
 *
 * This is the check whose absence cost this program a sprint. Start Enrollment begins ONE CHILD's
 * enrollment, and the tenant pointed it at a stage its own operating plan declared family-grain.
 * Everything downstream then behaved consistently with a family stage: the child's completion
 * outcome lived on a different stage, no rule matched, and Complete Enrollment reported success
 * while changing nothing. Every individual piece was internally valid. Only the join was wrong,
 * and nothing was looking at the join.
 */
export const PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH = "process_entry_stage_grain_mismatch" as const;
/**
 * A child's Enrollment can be completed somewhere no child entering Enrollment can ever get to.
 *
 * Reachability, not naming: the completion effect is identified by the durable disposition it
 * writes, and the walk follows configured movement out of the stage the tenant itself declares as
 * the child Enrollment entry. No stage key is assumed to exist or to be called anything.
 *
 * Blocking, because the failure it describes is invisible at runtime. An unreachable completion
 * rule does not error — it simply never matches, and an outcome that never matches is reported to
 * the operator as a success that changed nothing.
 */
export const PUBLISH_CHILD_COMPLETION_UNREACHABLE = "child_completion_unreachable" as const;

export type PublishValidationResult = {
    /** Publication is refused while this is non-empty. */
    errors: ConfigurationError[];
    /** Reported, never blocking — a mid-build process is allowed to be imperfect. */
    warnings: ConfigurationWarning[];
};


// ─── Entry grain and child-completion reachability ───────────────────────────────────────────

type StageGrainInput = { key: string; grain: string | null };

/** A stage's grain, from its own two configured declarations. Never guessed. */
function stageGrainOf(
    stage: LifecycleBuilderStageRecord | undefined,
    metadataGrain: string | null,
): ReturnType<typeof resolveStageGrain> {
    return resolveStageGrain({
        stageKey: stage?.key ?? "",
        operatingPlanJourneySegment: stage?.stage_operating_plan_v1?.journey_segment,
        configuredMetadataGrain: metadataGrain,
    });
}

/**
 * Every stage a subject can move to from `from`, following ONLY configured movement.
 *
 * Both movement expressions are followed, because a rule may name either: a `transition_ref`
 * resolved against the stage's own declared exits, or a bare `stage_key`. A rule naming a stage the
 * process does not have contributes no edge — that dangling reference is already reported by its
 * own validator, and inventing an edge for it here would hide this check behind that one.
 */
function reachableStages(
    process: LifecycleBuilderProcessRecord,
    from: string,
): Set<string> {
    const byKey = new Map(process.stages.map((s) => [s.key, s]));
    const seen = new Set<string>([from]);
    const queue = [from];
    while (queue.length) {
        const stage = byKey.get(queue.shift()!);
        if (!stage) continue;
        const plan = stage.stage_operating_plan_v1;
        const exits = plan?.outgoing_transitions ?? [];
        const destinations: string[] = exits
            .filter((t) => t.available !== false)
            .map((t) => t.target_stage_key);
        for (const rule of plan?.outcome_rules ?? []) {
            for (const target of rule.targets ?? []) {
                if ((target as { kind?: string }).kind !== "move_to_stage") continue;
                const direct = (target as { stage_key?: string }).stage_key;
                if (direct) destinations.push(direct);
                const ref = (target as { transition_ref?: string }).transition_ref;
                const resolved = ref ? exits.find((t) => t.transition_ref === ref) : undefined;
                if (resolved) destinations.push(resolved.target_stage_key);
            }
        }
        for (const destination of destinations) {
            const key = (destination ?? "").trim();
            if (!key || seen.has(key) || !byKey.has(key)) continue;
            seen.add(key);
            queue.push(key);
        }
    }
    return seen;
}

/** Stages whose plan carries an outcome that writes the child's ENROLLED durable status. */
function stagesCompletingChildEnrollment(process: LifecycleBuilderProcessRecord): string[] {
    const completing: string[] = [];
    for (const stage of process.stages) {
        const rules = stage.stage_operating_plan_v1?.outcome_rules ?? [];
        const completes = rules.some((rule) =>
            (rule.targets ?? []).some(
                (target) =>
                    (target as { kind?: string }).kind === "update_child_enrollment_status"
                    && (target as { disposition_key?: string }).disposition_key === ENROLLED_CHILD_STATUS_KEY,
            ),
        );
        if (completes) completing.push(stage.key);
    }
    return completing;
}

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

        /**
         * D-103 — every configured entry intent must be known, and must name an active stage.
         *
         * Absence is not checked: it means the tenant has not authored entry points, which every
         * existing published revision is, and refusing those would block publication for a question
         * they were never asked. Consumers refuse on absence instead, where the refusal is nameable.
         *
         * The UNKNOWN-intent check reads the RAW payload deliberately. The parser drops keys it does
         * not recognise, so by the time the typed record exists the typo is gone — and a typo that
         * merely disappears becomes "that intent is not configured", which reads as a choice and
         * fails at the moment a real journey starts instead of at publish.
         */
        const rawEntryPoints = isRecord(rawProcess) ? rawProcess.entry_points_v1 : null;
        const rawByIntent =
            isRecord(rawEntryPoints) && isRecord(rawEntryPoints.by_intent)
                ? (rawEntryPoints.by_intent as Record<string, unknown>)
                : null;
        for (const authoredIntent of Object.keys(rawByIntent ?? {})) {
            if (isProcessEntryIntent(authoredIntent)) continue;
            errors.push({
                code: PUBLISH_ENTRY_INTENT_UNKNOWN,
                path: `processes[${process.key}].entry_points_v1.by_intent.${authoredIntent}`,
                message:
                    `Process “${process.name}” maps an entry point for “${authoredIntent}”, which is ` +
                    `not an initiation this platform can supply. No journey would ever match it.`,
                detail: {
                    authored_intent: authoredIntent,
                    known_intents: [...PROCESS_ENTRY_INTENTS],
                },
            });
        }

        for (const [intent, declaredEntry] of Object.entries(process.entry_points_v1?.by_intent ?? {})) {
            if (!declaredEntry || activeStages.some((s) => s.key === declaredEntry)) continue;
            errors.push({
                code: PUBLISH_ENTRY_STAGE_UNRESOLVABLE,
                stage_key: declaredEntry,
                path: `processes[${process.key}].entry_points_v1.by_intent.${intent}`,
                message:
                    `Process “${process.name}” starts “${intent}” journeys in stage “${declaredEntry}”, ` +
                    `which is not an active stage of this process. Every such journey published under ` +
                    `this revision would begin nowhere.`,
                detail: {
                    entry_intent: intent,
                    declared_entry_stage_key: declaredEntry,
                    active_stages: activeStages.map((s) => s.key),
                },
            });
        }

        /**
         * ENTRY GRAIN — a subject may not be started in a stage that cannot own it.
         *
         * Reads the same two configured declarations `resolveStageGrain` ranks, and refuses on the
         * same uncertainties: a stage that declares no grain, and a stage whose plan and metadata
         * disagree, both block rather than resolve. A stage nobody has described is not proof of
         * safety.
         */
        const stageGrainMetadata = new Map<string, string | null>(
            process.stages.map((s) => {
                const raw = (s as { grain?: unknown }).grain;
                return [s.key, typeof raw === "string" ? raw : null] as const;
            }),
        );
        for (const [intent, declaredEntry] of Object.entries(process.entry_points_v1?.by_intent ?? {})) {
            if (!declaredEntry) continue;
            const stage = activeStages.find((s) => s.key === declaredEntry);
            // Missing/inactive is already reported above as PUBLISH_ENTRY_STAGE_UNRESOLVABLE.
            if (!stage) continue;
            const subjectGrain = PROCESS_ENTRY_INTENT_SUBJECT_GRAIN[intent as ProcessEntryIntentV1];
            if (!subjectGrain) continue;
            const grain = stageGrainOf(stage, stageGrainMetadata.get(stage.key) ?? null);
            if (grain.ok && grain.grain === subjectGrain) continue;
            errors.push({
                code: PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH,
                stage_key: declaredEntry,
                path: `processes[${process.key}].entry_points_v1.by_intent.${intent}`,
                message: grain.ok
                    ? `Process “${process.name}” starts “${intent}” journeys in stage `
                      + `“${stage.label ?? declaredEntry}”, which belongs to the ${grain.grain} `
                      + `track. That initiation begins ${subjectGrain === "child" ? "one child’s" : "a family’s"} `
                      + `journey, and a ${grain.grain}-grain stage cannot hold it.`
                    : `Process “${process.name}” starts “${intent}” journeys in stage `
                      + `“${stage.label ?? declaredEntry}”, whose track cannot be determined, so it `
                      + `cannot be shown to hold ${subjectGrain === "child" ? "a child" : "a family"}. `
                      + grain.message,
                detail: {
                    entry_intent: intent,
                    declared_entry_stage_key: declaredEntry,
                    entry_subject_grain: subjectGrain,
                    ...(grain.ok
                        ? { entry_stage_grain: grain.grain, grain_source: grain.source }
                        : { entry_stage_grain_reason: grain.reason }),
                },
            });
        }

        /**
         * CHILD COMPLETION REACHABILITY — the completion outcome must be somewhere a child can get.
         *
         * Checked only when the tenant declares a child Enrollment entry AND configures a
         * completion effect somewhere: a process that does neither is not enrolling children, and
         * inventing a requirement for it would block every process that is not this one.
         */
        const childEntry = process.entry_points_v1?.by_intent?.enrollment_start?.trim();
        const completingStages = stagesCompletingChildEnrollment(process);
        if (childEntry && completingStages.length) {
            const reachable = reachableStages(process, childEntry);
            const stranded = completingStages.filter((key) => !reachable.has(key));
            if (stranded.length === completingStages.length) {
                errors.push({
                    code: PUBLISH_CHILD_COMPLETION_UNREACHABLE,
                    stage_key: stranded[0],
                    path: `processes[${process.key}].entry_points_v1.by_intent.enrollment_start`,
                    message:
                        `Process “${process.name}” can mark a child enrolled only from `
                        + stranded.map((k) => `“${k}”`).join(", ")
                        + `, and no configured movement leads there from “${childEntry}”, where a `
                        + `child’s Enrollment begins. Every child would reach the end of their `
                        + `paperwork with no way to be enrolled, and completing it would report `
                        + `success without changing anything.`,
                    detail: {
                        child_entry_stage_key: childEntry,
                        completion_stage_keys: completingStages,
                        reachable_from_entry: [...reachable],
                    },
                });
            }
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

    /**
     * COMMAND-SET COMPLETENESS — blocking here, and only here.
     *
     * This check previously ran on every lifecycle-builder SAVE and nowhere else, which was the
     * boundary exactly inverted: an incomplete draft could not be saved, while a process with
     * orphaned capabilities could be published, because publication never asked. Draft saves now
     * report it as readiness; Validate and Publish block on it, both through this one function so
     * neither route carries its own copy.
     *
     * `errors`, deliberately — `warnings` are documented as never blocking, and a Work Template
     * that invokes a capability the process has not selected is not executable at runtime.
     */
    /**
     * ONE operating-contract result, consumed by the stage editor AND by publication.
     *
     * The editor called `validateStageOperatingPlanOperatingContract` and publication did not, so a
     * stage could show blocking issues while process-level Validate reported a clean, publishable
     * draft. Two validation universes describing the same configuration is not a presentation bug;
     * it means a publish can freeze in exactly what the editor is refusing.
     *
     * The contract is the single source. Its `severity` is carried through unchanged — errors
     * block publication, warnings report — so neither surface can soften what the other blocks.
     */
    /**
     * Contract codes the EXECUTION GRAPH already reports, in better words.
     *
     * Both validators inspect transition references, so wiring the contract into publication made
     * one defect arrive twice — `movement_transition_not_found` from the graph and
     * `outcome_transition_invalid` from the contract, describing the same outcome. "Each distinct
     * issue renders once" means picking an owner per diagnosis, not deduplicating text.
     *
     * The graph wins these because it names the outcome and phrases the destination as a stage.
     * The contract still contributes everything only it knows: journey grain, close-status
     * resolution, primary actions, follow-up templates, and the stage-scoped "no way out at all".
     */
    const EXECUTION_GRAPH_OWNED = new Set([
        "outcome_transition_invalid", // graph: movement_transition_not_found
        "transition_destination_invalid", // graph: transition_destination_unknown
        "transition_destination_self", // graph: transition_self_loop
        "transition_identity_duplicate", // graph: duplicate_transition_identity
        "transition_source_invalid", // graph: transition_missing_source / _source_unknown
    ]);

    for (const process of activeProcesses) {
        const stages = process.stages ?? [];
        const processStages = stages.map((s) => {
            const rawGrain = (s as { grain?: unknown }).grain;
            return {
                key: s.key,
                label: s.label ?? s.key,
                // A malformed STRING is passed through so `resolveStageGrain` can still refuse it;
                // a non-string is indistinguishable from absent. Never coerced to a valid grain.
                grain: typeof rawGrain === "string" ? rawGrain : null,
            };
        });
        for (const stage of stages) {
            const plan = stage.stage_operating_plan_v1;
            if (!plan) continue;
            const contractIssues = validateStageOperatingPlanOperatingContract({
                plan,
                processStageKeys: stages.map((s) => s.key),
                processStages,
                /*
                 * Derived from the plan's OWN transitions. Omitting them made the contract
                 * conclude the stage had no exit paths at all and report
                 * `stage_transition_missing` against stages that plainly have them — trading the
                 * false positive this slice removed for a new one.
                 *
                 * `configuredStatuses` is deliberately NOT passed: this validator is pure and
                 * cannot read the tenant status catalog, and `undefined` means "cannot evaluate",
                 * so status-domain checks are skipped rather than guessed from an empty list.
                 */
                transitionOptions: (plan.outgoing_transitions ?? []).map((t) => ({
                    transition_ref: t.transition_ref,
                    label: t.label,
                    target_stage_key: t.target_stage_key,
                    target_stage_label:
                        stages.find((s) => s.key === t.target_stage_key)?.label ?? t.target_stage_key,
                    available: t.available,
                })),
            });
            for (const issue of contractIssues) {
                if (EXECUTION_GRAPH_OWNED.has(issue.code)) continue;
                const entry = {
                    code: PUBLISH_OPERATING_CONTRACT,
                    stage_key: stage.key,
                    path:
                        `processes[${process.key}].stages[${stage.key}]`
                        + `.stage_operating_plan_v1`,
                    message: issue.message,
                    detail: {
                        contract_code: issue.code,
                        control_id: issue.controlId,
                        ...(issue.outcome_key ? { outcome_key: issue.outcome_key } : {}),
                        ...(issue.template_key ? { work_template_key: issue.template_key } : {}),
                    },
                };
                if (issue.severity === "error") errors.push(entry as ConfigurationError);
                else warnings.push(entry as ConfigurationWarning);
            }
        }
    }

    {
        const commandSets = validateProcessCommandSetsForPublish(builder);
        // `issues` exists only on the failing variant of the union.
        for (const issue of commandSets.ok ? [] : commandSets.issues) {
            errors.push({
                code: PUBLISH_COMMAND_SET_INCOMPLETE,
                stage_key: issue.stageKey ?? null,
                path:
                    `processes[${issue.processKey ?? "?"}]`
                    + (issue.stageKey ? `.stages[${issue.stageKey}]` : "")
                    + `.command_set_v1`,
                message: issue.message,
            } as ConfigurationError);
        }
    }

    /*
     * "This stage has no way out" is stage-scoped CONTEXT. Once the execution graph has already
     * named the specific movement that failed on that same stage, repeating the context states one
     * problem twice — the exact pattern this program has been removing. The graph's message wins
     * because it names the outcome and the transition; the contract's stage-scoped line is kept
     * only where nothing more specific was reported.
     */
    const stagesWithMovementErrors = new Set(
        errors
            .filter(
                (e) =>
                    e.code === "movement_transition_not_found" || e.code === "movement_without_transition",
            )
            .map((e) => e.stage_key)
            .filter(Boolean),
    );
    const deduped = errors.filter(
        (e) =>
            !(
                e.code === PUBLISH_OPERATING_CONTRACT
                && (e.detail as { contract_code?: string } | undefined)?.contract_code
                    === "stage_transition_missing"
                && stagesWithMovementErrors.has(e.stage_key)
            ),
    );

    return { errors: deduped, warnings };
}
