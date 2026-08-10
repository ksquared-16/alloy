/**
 * Validate operator-supplied inputs for a participant decision, and bind them onto its targets.
 *
 * Pure. Takes the configured decision and the operator's values, returns either the targets the
 * executor should run or the reasons it must not run at all. No database, no clock, no writes —
 * so "did the operator supply a valid reason?" is answerable in a test without a tenant.
 *
 * Two jobs, deliberately in one place:
 *
 *  1. VALIDATE — a required input must be present; a `select` input must hold one of its own
 *     configured options. Validating options matters more than it looks: without it, any string
 *     the client posts lands in `process_instances.close_reason_key` and the tenant's reason
 *     vocabulary becomes whatever a request body said it was.
 *
 *  2. BIND — copy the value onto the target field the CONFIGURATION named in
 *     `binds_to_target_field`. Never onto a field inferred from the input's key. An input with no
 *     binding is collected and validated but writes nothing durable through this path; that is a
 *     legitimate shape (a note, a confirmation) and not an error.
 *
 * Binding only ever writes to target kinds declared to accept the field. A decision that binds a
 * close reason but whose targets cannot carry one is refused rather than silently dropping the
 * operator's answer — the same failure the validator reports at authoring time, caught again here
 * because configuration can change after a surface was rendered.
 */

import {
    STAGE_PARTICIPANT_DECISION_BINDING_ACCEPTORS,
    type StageOutcomeRuleTargetV1,
    type StageParticipantDecisionInputV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type ParticipantDecisionInputIssue = {
    /** The input that failed, so a surface can mark the right control. */
    input_key: string;
    code: "required_missing" | "not_a_configured_option" | "binding_unsupported_by_targets";
    /** Operator-facing. */
    message: string;
};

export type ApplyParticipantDecisionInputsResult =
    | { ok: true; targets: StageOutcomeRuleTargetV1[]; boundValues: Record<string, string> }
    | { ok: false; issues: ParticipantDecisionInputIssue[] };

function readSuppliedValue(values: Record<string, unknown> | null | undefined, key: string): string | null {
    const raw = values?.[key];
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed || null;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    if (typeof raw === "boolean") return raw ? "true" : "false";
    return null;
}

function targetsAccepting(
    targets: readonly StageOutcomeRuleTargetV1[],
    field: NonNullable<StageParticipantDecisionInputV1["binds_to_target_field"]>,
): number {
    const acceptors = STAGE_PARTICIPANT_DECISION_BINDING_ACCEPTORS[field];
    return targets.filter((t) => acceptors.includes(t.kind)).length;
}

/**
 * The parts of a configured action this applier actually needs.
 *
 * Deliberately NOT `StageWorkParticipantDecisionV1`. Governed family close reuses this for both
 * halves of its operation, and the only way to call it with the full decision type was to invent a
 * `decision_key` and a `subject_grain` that meant nothing — a fake object built to satisfy a type,
 * which is how a reader ends up believing family close runs a participant decision. Narrowing the
 * parameter to what is read removes the lie.
 */
export type ParticipantDecisionInputBindable = {
    targets: readonly StageOutcomeRuleTargetV1[];
    required_inputs?: readonly StageParticipantDecisionInputV1[];
};

export function applyParticipantDecisionInputs(input: {
    decision: ParticipantDecisionInputBindable;
    /** Raw operator values, keyed by input key. */
    values?: Record<string, unknown> | null;
}): ApplyParticipantDecisionInputsResult {
    const inputs = input.decision.required_inputs ?? [];
    const issues: ParticipantDecisionInputIssue[] = [];
    const boundValues: Record<string, string> = {};

    // Start from a copy so a refusal cannot leave a partially-bound target array behind, and so the
    // configured decision object is never mutated by executing it.
    const targets: StageOutcomeRuleTargetV1[] = input.decision.targets.map((t) => ({ ...t }));

    for (const spec of inputs) {
        const value = readSuppliedValue(input.values, spec.key);

        if (value == null) {
            if (spec.required) {
                issues.push({
                    input_key: spec.key,
                    code: "required_missing",
                    message: `${spec.label} is required.`,
                });
            }
            continue;
        }

        // An empty options array means "no options configured", which cannot validate anything —
        // it is checked only when the author actually listed choices.
        if (spec.type === "select" && spec.options?.length) {
            const allowed = spec.options.some((o) => o.value === value);
            if (!allowed) {
                issues.push({
                    input_key: spec.key,
                    code: "not_a_configured_option",
                    message: `Choose one of the available options for ${spec.label}.`,
                });
                continue;
            }
        }

        if (!spec.binds_to_target_field) continue;

        if (targetsAccepting(targets, spec.binds_to_target_field) === 0) {
            issues.push({
                input_key: spec.key,
                code: "binding_unsupported_by_targets",
                message:
                    `${spec.label} cannot be recorded by this decision as it is configured. `
                    + `Check the Business Process configuration for this step.`,
            });
            continue;
        }

        const acceptors = STAGE_PARTICIPANT_DECISION_BINDING_ACCEPTORS[spec.binds_to_target_field];
        for (const target of targets) {
            if (!acceptors.includes(target.kind)) continue;
            // The operator's answer wins over an authored constant on the same field. A decision
            // that both asks and hardcodes is a configuration smell, but if it exists the value the
            // operator actually chose is the truthful one to persist.
            target[spec.binds_to_target_field] = value;
        }
        boundValues[spec.key] = value;
    }

    if (issues.length) return { ok: false, issues };
    return { ok: true, targets, boundValues };
}
