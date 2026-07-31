/**
 * The Business Process EXECUTION GRAPH — its model, and what makes it publishable.
 *
 * The Firefly failure this sprint exists to end:
 *
 *   an outcome rule references `lead_to_tour`
 *   the persisted Lead stage declares no such outgoing transition
 *   the status write succeeds, the stage move finds nothing, and durable state contradicts itself
 *
 * `validateConfiguredStageReferences` already catches a target stage that does not exist. It does
 * NOT catch the shapes that actually produce that failure: a transition declared on the wrong
 * stage, two transitions sharing an identity, or an outcome reaching for a transition that belongs
 * to a different stage. Those are what this module adds.
 *
 * THE INTEGRITY UNIT is one chain, and every link is checked here:
 *
 *   stage -> outgoing transition -> destination stage -> outcome/signal -> effect -> transition ref
 *
 * IDENTITY vs LABEL. A transition has a stable identity (`lead_to_tour`) and an operator label
 * (`Lead → Tour`). Operators author and read labels; only configuration and code use identities.
 * Every message this module produces is phrased in labels, because an operator asked to repair
 * "lead_to_tour" has been handed the platform's problem instead of theirs.
 */

import type {
    ConfigurationError,
    ConfigurationWarning,
} from "@/lib/businessProcesses/configuration/configurationDiagnostics";

export const TRANSITION_MISSING_SOURCE = "transition_missing_source" as const;
export const TRANSITION_MISSING_DESTINATION = "transition_missing_destination" as const;
export const TRANSITION_DESTINATION_UNKNOWN = "transition_destination_unknown" as const;
export const TRANSITION_SOURCE_UNKNOWN = "transition_source_unknown" as const;
export const TRANSITION_NOT_OUTGOING_FROM_SOURCE = "transition_not_outgoing_from_source" as const;
export const TRANSITION_DUPLICATE_IDENTITY = "duplicate_transition_identity" as const;
export const TRANSITION_SELF_LOOP = "transition_self_loop" as const;
export const MOVEMENT_TRANSITION_NOT_FOUND = "movement_transition_not_found" as const;
export const MOVEMENT_TRANSITION_FOREIGN = "movement_transition_from_another_stage" as const;
export const MOVEMENT_WITHOUT_TRANSITION = "movement_without_transition" as const;

export type ExecutionGraphTransition = {
    transition_ref: string;
    label: string;
    source_stage_key: string;
    target_stage_key: string;
    /** The stage whose operating plan declares it — must equal `source_stage_key`. */
    declared_on_stage_key: string;
    available: boolean;
};

export type ExecutionGraphMovement = {
    /** The stage whose rule configures the movement. */
    stage_key: string;
    rule_key: string;
    /** Operator-facing name of the trigger — the outcome label where one exists. */
    trigger_label: string;
    transition_ref: string | null;
    /** Legacy shape: a destination named directly instead of through a transition. */
    stage_key_target: string | null;
};

export type ExecutionGraph = {
    process_key: string;
    stage_keys: string[];
    stage_labels: Record<string, string>;
    transitions: ExecutionGraphTransition[];
    movements: ExecutionGraphMovement[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}
function asArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t || null;
}

/** `tour_scheduled` -> `Tour Scheduled`. Never show an operator a raw key. */
function humanize(key: string): string {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human name for a stage — its label when configured, otherwise a readable form of the key. */
function stageName(graph: Pick<ExecutionGraph, "stage_labels">, key: string): string {
    return graph.stage_labels[key] || humanize(key);
}

/** `Lead → Tour` — what the operator sees, never the raw ref. */
function transitionName(
    graph: ExecutionGraph,
    t: Pick<ExecutionGraphTransition, "label" | "source_stage_key" | "target_stage_key">,
): string {
    if (t.label) return t.label;
    return `${stageName(graph, t.source_stage_key)} → ${stageName(graph, t.target_stage_key)}`;
}

/**
 * Read the graph out of a serialized process record.
 *
 * Deliberately schema-tolerant and RAW: the config is operator-authored JSON, and a shape a newer
 * branch authored must still be audited rather than silently skipped by a typed parser.
 */
export function buildExecutionGraph(processRaw: unknown): ExecutionGraph {
    const process = isRecord(processRaw) ? processRaw : {};
    const stages = asArray(process.stages)
        .filter(isRecord)
        .filter((s) => s.is_active === undefined || s.is_active === true);

    const stage_labels: Record<string, string> = {};
    const stage_keys: string[] = [];
    for (const s of stages) {
        const key = str(s.key);
        if (!key) continue;
        stage_keys.push(key);
        stage_labels[key] = str(s.label) ?? key;
    }

    const transitions: ExecutionGraphTransition[] = [];
    const movements: ExecutionGraphMovement[] = [];

    for (const stage of stages) {
        const stageKey = str(stage.key);
        if (!stageKey) continue;
        const plan = isRecord(stage.stage_operating_plan_v1) ? stage.stage_operating_plan_v1 : null;
        if (!plan) continue;

        for (const raw of asArray(plan.outgoing_transitions).filter(isRecord)) {
            transitions.push({
                transition_ref: str(raw.transition_ref) ?? "",
                label: str(raw.label) ?? "",
                source_stage_key: str(raw.source_stage_key) ?? "",
                target_stage_key: str(raw.target_stage_key) ?? "",
                declared_on_stage_key: stageKey,
                available: raw.available !== false,
            });
        }

        // Outcome labels make the messages readable: "Tour Scheduled", not "tour_scheduled".
        const outcomeLabels = new Map<string, string>();
        for (const o of asArray(plan.outcomes).filter(isRecord)) {
            const key = str(o.outcome_key);
            if (key) outcomeLabels.set(key, str(o.label) ?? key);
        }

        for (const rule of asArray(plan.outcome_rules).filter(isRecord)) {
            const ruleKey = str(rule.rule_key) ?? "(rule)";
            const trigger =
                str(rule.when_outcome_key) ??
                str(rule.when_enter_status_key) ??
                (isRecord(rule.when_domain_signal) ? str(rule.when_domain_signal.signal) : null);
            // An outcome with no configured label still gets a readable name — an operator asked
            // to repair "tour_scheduled" has been handed the platform's vocabulary, not theirs.
            const triggerLabel =
                (trigger ? outcomeLabels.get(trigger) : null) ?? humanize(trigger ?? ruleKey);

            for (const target of asArray(rule.targets).filter(isRecord)) {
                if (str(target.kind) !== "move_to_stage") continue;
                const ref = str(target.transition_ref);
                movements.push({
                    stage_key: stageKey,
                    rule_key: ruleKey,
                    trigger_label: triggerLabel,
                    // `move_to_stage:<key>` is a legacy encoding of a bare destination.
                    transition_ref: ref && !ref.startsWith("move_to_stage:") ? ref : null,
                    stage_key_target:
                        str(target.stage_key) ??
                        (ref?.startsWith("move_to_stage:")
                            ? ref.slice("move_to_stage:".length).trim() || null
                            : null),
                });
            }
        }
    }

    return {
        process_key: str(process.key) ?? "",
        stage_keys,
        stage_labels,
        transitions,
        movements,
    };
}

export type ExecutionGraphValidation = {
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
};

/**
 * Everything that must hold before this graph can drive execution.
 *
 * Each finding names the operator-visible thing that is wrong and what to do about it. The
 * machine-readable identity lives in `detail`, where a surface can use it to jump to the object.
 */
export function validateExecutionGraph(graph: ExecutionGraph): ExecutionGraphValidation {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];
    const stages = new Set(graph.stage_keys);
    const path = (stageKey: string, suffix: string) =>
        `processes[${graph.process_key}].stages[${stageKey}].stage_operating_plan_v1.${suffix}`;

    // ── transitions ──────────────────────────────────────────────────────────
    const byRef = new Map<string, ExecutionGraphTransition[]>();

    for (const t of graph.transitions) {
        const name = transitionName(graph, t);
        const where = path(t.declared_on_stage_key, "outgoing_transitions");

        if (!t.transition_ref) {
            errors.push({
                code: TRANSITION_DUPLICATE_IDENTITY,
                stage_key: t.declared_on_stage_key,
                path: where,
                message:
                    `A transition on “${stageName(graph, t.declared_on_stage_key)}” has no identity, ` +
                    `so nothing can reference it. Remove it or give it a name.`,
            });
            continue;
        }
        byRef.set(t.transition_ref, [...(byRef.get(t.transition_ref) ?? []), t]);

        if (!t.source_stage_key) {
            errors.push({
                code: TRANSITION_MISSING_SOURCE,
                stage_key: t.declared_on_stage_key,
                path: where,
                message: `“${name}” does not say which stage it leaves from.`,
                detail: { transition_ref: t.transition_ref },
            });
        } else if (!stages.has(t.source_stage_key)) {
            errors.push({
                code: TRANSITION_SOURCE_UNKNOWN,
                stage_key: t.declared_on_stage_key,
                path: where,
                message:
                    `“${name}” leaves from “${stageName(graph, t.source_stage_key)}”, but that ` +
                    `stage is missing from this Business Process.`,
                detail: { transition_ref: t.transition_ref, invalid_target: t.source_stage_key },
            });
        } else if (t.source_stage_key !== t.declared_on_stage_key) {
            // The most subtle one: the transition exists, but not where the runtime looks for it.
            errors.push({
                code: TRANSITION_NOT_OUTGOING_FROM_SOURCE,
                stage_key: t.declared_on_stage_key,
                path: where,
                message:
                    `“${name}” is listed on “${stageName(graph, t.declared_on_stage_key)}” but ` +
                    `leaves from “${stageName(graph, t.source_stage_key)}”. Move it to ` +
                    `“${stageName(graph, t.source_stage_key)}” so it can be used there.`,
                detail: {
                    transition_ref: t.transition_ref,
                    declared_on: t.declared_on_stage_key,
                    source: t.source_stage_key,
                },
            });
        }

        if (!t.target_stage_key) {
            errors.push({
                code: TRANSITION_MISSING_DESTINATION,
                stage_key: t.declared_on_stage_key,
                path: where,
                message: `“${name}” does not say which stage it moves to.`,
                detail: { transition_ref: t.transition_ref },
            });
        } else if (!stages.has(t.target_stage_key)) {
            errors.push({
                code: TRANSITION_DESTINATION_UNKNOWN,
                stage_key: t.declared_on_stage_key,
                path: where,
                message:
                    `“${name}” points to “${stageName(graph, t.target_stage_key)}”, but the ` +
                    `${stageName(graph, t.target_stage_key)} stage is missing.`,
                detail: { transition_ref: t.transition_ref, invalid_target: t.target_stage_key },
            });
        } else if (t.target_stage_key === t.source_stage_key) {
            errors.push({
                code: TRANSITION_SELF_LOOP,
                stage_key: t.declared_on_stage_key,
                path: where,
                message:
                    `“${name}” both leaves from and moves to ` +
                    `“${stageName(graph, t.source_stage_key)}”. A stage cannot move to itself.`,
                detail: { transition_ref: t.transition_ref },
            });
        }
    }

    for (const [ref, list] of byRef) {
        if (list.length < 2) continue;
        errors.push({
            code: TRANSITION_DUPLICATE_IDENTITY,
            stage_key: list[0]!.declared_on_stage_key,
            path: path(list[0]!.declared_on_stage_key, "outgoing_transitions"),
            message:
                `${list.length} transitions share the identity “${ref}” ` +
                `(${list.map((t) => transitionName(graph, t)).join(", ")}). Only the first would ` +
                `ever be used.`,
            detail: { transition_ref: ref, declared_on: list.map((t) => t.declared_on_stage_key) },
        });
    }

    // ── movements ────────────────────────────────────────────────────────────
    for (const m of graph.movements) {
        const where = path(m.stage_key, "outcome_rules");

        if (!m.transition_ref) {
            if (m.stage_key_target && !stages.has(m.stage_key_target)) {
                errors.push({
                    code: TRANSITION_DESTINATION_UNKNOWN,
                    stage_key: m.stage_key,
                    path: where,
                    message:
                        `“${m.trigger_label}” moves to “${stageName(graph, m.stage_key_target)}”, ` +
                        `but that stage is missing from this Business Process.`,
                    detail: { rule_key: m.rule_key, invalid_target: m.stage_key_target },
                });
            } else if (m.stage_key_target) {
                // Legal today, but it bypasses the transition model, so the graph cannot say
                // whether the move is actually allowed from this stage. Warn rather than block:
                // blocking would freeze legacy tenants out of publishing anything.
                warnings.push({
                    code: MOVEMENT_WITHOUT_TRANSITION,
                    stage_key: m.stage_key,
                    path: where,
                    message:
                        `“${m.trigger_label}” moves straight to ` +
                        `“${stageName(graph, m.stage_key_target)}” without going through a ` +
                        `transition, so nothing checks that the move is allowed.`,
                    detail: { rule_key: m.rule_key, stage_key_target: m.stage_key_target },
                });
            }
            continue;
        }

        const candidates = byRef.get(m.transition_ref) ?? [];
        if (!candidates.length) {
            errors.push({
                code: MOVEMENT_TRANSITION_NOT_FOUND,
                stage_key: m.stage_key,
                path: where,
                message:
                    `“${m.trigger_label}” is set to move through “${m.transition_ref}”, but that ` +
                    `transition does not exist. Create it on ` +
                    `“${stageName(graph, m.stage_key)}”, or choose a different behaviour.`,
                detail: { rule_key: m.rule_key, transition_ref: m.transition_ref },
            });
            continue;
        }

        // Found — but is it OURS? A transition leaving another stage can never fire from here.
        const owned = candidates.find((t) => t.source_stage_key === m.stage_key);
        if (!owned) {
            const other = candidates[0]!;
            errors.push({
                code: MOVEMENT_TRANSITION_FOREIGN,
                stage_key: m.stage_key,
                path: where,
                message:
                    `“${m.trigger_label}” on “${stageName(graph, m.stage_key)}” is set to move ` +
                    `through “${transitionName(graph, other)}”, which leaves from ` +
                    `“${stageName(graph, other.source_stage_key)}”. An outcome can only use a ` +
                    `transition that leaves its own stage.`,
                detail: {
                    rule_key: m.rule_key,
                    transition_ref: m.transition_ref,
                    source: other.source_stage_key,
                },
            });
        }
    }

    return { errors, warnings };
}

/** Convenience: build and validate in one step. */
export function validateProcessExecutionGraph(processRaw: unknown): ExecutionGraphValidation {
    return validateExecutionGraph(buildExecutionGraph(processRaw));
}

/**
 * Transitions an outcome on `stageKey` may legitimately choose.
 *
 * This is the list the "Move through transition" selector must show — outgoing from THIS stage and
 * resolvable — and nothing else. Showing every transition in the process is how an outcome ends up
 * referencing one that can never fire from where it lives.
 */
export function selectableTransitionsForStage(
    graph: ExecutionGraph,
    stageKey: string,
): ExecutionGraphTransition[] {
    const stages = new Set(graph.stage_keys);
    return graph.transitions.filter(
        (t) =>
            t.source_stage_key === stageKey &&
            t.declared_on_stage_key === stageKey &&
            Boolean(t.transition_ref) &&
            stages.has(t.target_stage_key) &&
            t.target_stage_key !== t.source_stage_key,
    );
}
