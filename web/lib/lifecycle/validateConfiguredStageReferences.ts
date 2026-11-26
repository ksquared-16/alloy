/**
 * Publish-time referential integrity for configured Business Process stages.
 *
 * Product doctrine: a stage may exist only when it is explicitly present in the current
 * configured Business Process. The builder must therefore REJECT any publish that references a
 * stage outside its own stage inventory — no silent drops. Every configurable stage target is
 * audited: move_to_stage, outgoing transitions, outcome targets, nested operating-plan targets.
 *
 * This is intentionally schema-tolerant: the config is operator-authored JSON, so the walker
 * inspects the shapes that can name a destination stage rather than trusting a fixed type.
 */

export type StageReferenceViolation = {
    process_key: string | null;
    /** The stage whose plan contains the invalid reference. */
    source_stage: string;
    /** Where in that stage the reference lives (rule/outcome/transition identifier). */
    reference: string;
    /** Which defect this is — a transition that does not exist, or a stage that does not. */
    defect?: "missing_transition" | "missing_destination_stage";
    /** The kind of reference (move_to_stage | transition | nested_target). */
    reference_kind: string;
    /** The stage key that does not exist in the process. */
    invalid_target: string;
    /** The stages that ARE configured — the valid set. */
    configured_stages: string[];
    message: string;
};

export type ValidateConfiguredStageReferencesResult =
    | { ok: true }
    | { ok: false; violations: StageReferenceViolation[] };

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
    return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function trimStr(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const s = value.trim();
    return s || null;
}

/**
 * Validate one process's stage references against its own stage inventory. `process` is the
 * builder process record (has `key` and `stages[]`, each with `stage_operating_plan_v1`).
 */
export function validateProcessStageReferences(process: unknown): ValidateConfiguredStageReferencesResult {
    const proc = asRecord(process);
    if (!proc) return { ok: true };
    const processKey = trimStr(proc.key);
    const stages = asArray(proc.stages)
        .map(asRecord)
        .filter((s): s is Json => s != null && (s.is_active === undefined || s.is_active === true));
    const configured = stages.map((s) => trimStr(s.key)).filter((k): k is string => k != null);
    const configuredSet = new Set(configured);

    const violations: StageReferenceViolation[] = [];
    /**
     * TWO different defects, said in two different sentences.
     *
     * A rule can fail here because the TRANSITION it names does not exist, or because a transition
     * that does exist points at a STAGE that does not. Both used to produce the same message —
     * "targets stage X, which is not configured" — followed by the configured stage list. For a
     * missing transition that names the wrong noun and lists an irrelevant set, and it is a real
     * cost: it sent this author to inspect a validator that was working correctly.
     *
     * The logic is unchanged. `defect` is carried structurally so product and tests cannot
     * conflate the two again.
     */
    const flagMissingTransition = (sourceStage: string, reference: string, kind: string) => {
        violations.push({
            process_key: processKey,
            source_stage: sourceStage,
            reference,
            reference_kind: kind,
            defect: "missing_transition",
            invalid_target: reference,
            configured_stages: configured,
            message:
                `This outcome refers to transition "${reference}", but that transition is not ` +
                `configured on the ${sourceStage} stage. Create or select an outgoing transition ` +
                `before publishing.`,
        });
    };

    const flag = (sourceStage: string, reference: string, kind: string, target: string) => {
        violations.push({
            process_key: processKey,
            source_stage: sourceStage,
            reference,
            reference_kind: kind,
            defect: "missing_destination_stage",
            invalid_target: target,
            configured_stages: configured,
            message:
                `Transition "${reference}" points to stage "${target}", but that stage is not ` +
                `configured in this Business Process. Configured stages: ${configured.join(", ") || "(none)"}.`,
        });
    };

    for (const stage of stages) {
        const sourceStage = trimStr(stage.key) ?? "(unnamed)";
        const plan = asRecord(stage.stage_operating_plan_v1);
        if (!plan) continue;

        // outgoing_transitions[].target_stage_key
        const transitions = asArray(plan.outgoing_transitions).map(asRecord).filter((t): t is Json => t != null);
        const transitionByRef = new Map<string, Json>();
        for (const t of transitions) {
            const ref = trimStr(t.transition_ref);
            if (ref) transitionByRef.set(ref, t);
            const target = trimStr(t.target_stage_key);
            if (target && !configuredSet.has(target)) {
                flag(sourceStage, ref ?? "(transition)", "transition", target);
            }
        }

        // outcome_rules[].targets[] — move_to_stage (stage_key or transition_ref), plus any
        // nested field that names a destination stage.
        for (const rule of asArray(plan.outcome_rules).map(asRecord)) {
            if (!rule) continue;
            const ruleKey = trimStr(rule.rule_key) ?? trimStr(rule.when_outcome_key) ?? "(rule)";
            for (const target of asArray(rule.targets).map(asRecord)) {
                if (!target) continue;
                const kind = trimStr(target.kind);
                if (kind === "move_to_stage") {
                    let dest = trimStr(target.stage_key);
                    if (!dest) {
                        const ref = trimStr(target.transition_ref);
                        // transition_ref may be "move_to_stage:<key>" or a real transition ref.
                        if (ref?.startsWith("move_to_stage:")) {
                            dest = ref.slice("move_to_stage:".length).trim() || null;
                        } else if (ref) {
                            dest = trimStr(transitionByRef.get(ref)?.target_stage_key);
                            // A rule pointing at a missing transition_ref is a MISSING TRANSITION —
                            // not a missing stage. Same failure, different noun, different fix.
                            if (!transitionByRef.has(ref)) {
                                flagMissingTransition(sourceStage, ref, "move_to_stage");
                                continue;
                            }
                        }
                    }
                    if (dest && !configuredSet.has(dest)) {
                        flag(sourceStage, ruleKey, "move_to_stage", dest);
                    }
                }
                // Any other target field that names a stage destination.
                for (const field of ["target_stage_key", "next_stage_key", "return_stage_key", "destination_stage_key"]) {
                    const dest = trimStr((target as Json)[field]);
                    if (dest && !configuredSet.has(dest)) {
                        flag(sourceStage, ruleKey, `nested_target:${field}`, dest);
                    }
                }
            }
        }
    }

    return violations.length ? { ok: false, violations } : { ok: true };
}

/**
 * Validate every process in a builder config. Returns all violations across processes so publish
 * can report them together.
 */
export function validateConfiguredStageReferences(config: unknown): ValidateConfiguredStageReferencesResult {
    const cfg = asRecord(config);
    if (!cfg) return { ok: true };
    const all: StageReferenceViolation[] = [];
    for (const process of asArray(cfg.processes)) {
        const result = validateProcessStageReferences(process);
        if (!result.ok) all.push(...result.violations);
    }
    return all.length ? { ok: false, violations: all } : { ok: true };
}
