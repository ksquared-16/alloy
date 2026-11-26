/**
 * Idempotent remediation of dangling configured-stage references in a builder config.
 *
 * Product doctrine constraints honored here:
 *  - Do not invent destinations. Where the correct target is a Product decision, REMOVE the
 *    invalid move target (leaving the transition invalid and, for transitions, visibly blocked)
 *    rather than guessing a replacement.
 *  - Preserve valid configured stages (e.g. `decision`) untouched.
 *  - Report every change so remediation is auditable.
 *  - Idempotent: re-running on already-clean config produces no changes.
 *
 * This is pure config→config surgery. It does NOT persist — callers apply the cleaned config
 * through an auditable path (migration or authenticated publish).
 */

export type StageReferenceRemoval = {
    process_key: string | null;
    source_stage: string;
    reference: string;
    reference_kind: "move_to_stage" | "transition";
    invalid_target: string;
    action: "removed_target" | "blocked_transition";
};

export type RemediationResult = {
    changed: boolean;
    cleanedConfig: unknown;
    removals: StageReferenceRemoval[];
};

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function asArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}
function trimStr(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

/** Remediate one process in place (on a cloned object). Returns the removals it made. */
function remediateProcess(process: Json): StageReferenceRemoval[] {
    const processKey = trimStr(process.key);
    const stages = asArray(process.stages)
        .map(asRecord)
        .filter((s): s is Json => s != null);
    const configured = new Set(
        stages
            .filter((s) => s.is_active === undefined || s.is_active === true)
            .map((s) => trimStr(s.key))
            .filter((k): k is string => k != null),
    );

    const removals: StageReferenceRemoval[] = [];

    for (const stage of stages) {
        const sourceStage = trimStr(stage.key) ?? "(unnamed)";
        const plan = asRecord(stage.stage_operating_plan_v1);
        if (!plan) continue;

        // Map transition_ref → target, so move targets that resolve via a transition are checked.
        const transitions = asArray(plan.outgoing_transitions).map(asRecord).filter((t): t is Json => t != null);
        const transitionTarget = (ref: string): string | null =>
            trimStr(transitions.find((t) => trimStr(t.transition_ref) === ref)?.target_stage_key);

        // 1) outcome_rules[].targets[] — remove move_to_stage (and nested stage-target fields)
        //    whose destination is not configured.
        for (const rule of asArray(plan.outcome_rules).map(asRecord)) {
            if (!rule) continue;
            const ruleKey = trimStr(rule.rule_key) ?? trimStr(rule.when_outcome_key) ?? "(rule)";
            const targets = asArray(rule.targets).map(asRecord);
            const kept: Json[] = [];
            for (const target of targets) {
                if (!target) continue;
                if (trimStr(target.kind) === "move_to_stage") {
                    let dest = trimStr(target.stage_key);
                    if (!dest) {
                        const ref = trimStr(target.transition_ref);
                        if (ref?.startsWith("move_to_stage:")) dest = ref.slice("move_to_stage:".length).trim() || null;
                        else if (ref) dest = transitionTarget(ref);
                    }
                    if (dest && !configured.has(dest)) {
                        removals.push({
                            process_key: processKey,
                            source_stage: sourceStage,
                            reference: ruleKey,
                            reference_kind: "move_to_stage",
                            invalid_target: dest,
                            action: "removed_target",
                        });
                        continue; // drop this target
                    }
                }
                kept.push(target);
            }
            rule.targets = kept;
        }

        // 2) outgoing_transitions[] — a dangling transition is BLOCKED (available:false), not
        //    deleted, so the operator's intent stays visible and can be repointed by Product.
        for (const t of transitions) {
            const target = trimStr(t.target_stage_key);
            if (target && !configured.has(target) && t.available !== false) {
                t.available = false;
                removals.push({
                    process_key: processKey,
                    source_stage: sourceStage,
                    reference: trimStr(t.transition_ref) ?? "(transition)",
                    reference_kind: "transition",
                    invalid_target: target,
                    action: "blocked_transition",
                });
            }
        }
    }

    return removals;
}

export function remediateDanglingStageReferences(config: unknown): RemediationResult {
    const cfg = asRecord(config);
    if (!cfg) return { changed: false, cleanedConfig: config, removals: [] };
    const cleaned = clone(cfg);
    const removals: StageReferenceRemoval[] = [];
    for (const process of asArray(cleaned.processes).map(asRecord)) {
        if (process) removals.push(...remediateProcess(process));
    }
    return { changed: removals.length > 0, cleanedConfig: cleaned, removals };
}
