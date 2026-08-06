/**
 * Project the per-participant Decision surface: one row per child, each carrying the configured
 * decisions available to that child and the path already chosen.
 *
 * Two halves, kept apart on purpose:
 *
 *   `deriveParticipantDecisionProgress` — PURE. Given participants and configuration, answers
 *   "how many are resolved?" It reads no database, so the family-work completion gate can be
 *   proven in a fixture rather than a tenant.
 *
 *   `projectParticipantDecisionRows` — reads `process_instances` (the child participation
 *   authority) and `customer_members` (names only) and hands the pure half its input.
 *
 * WHAT "RESOLVED" MEANS is not defined here. A participant is resolved when their durable state
 * matches the state some configured decision on this work template writes. That is derived from
 * `participant_decisions`, so adding a fourth path widens "resolved" automatically and there is
 * never a second list of terminal states to fall out of step with the first.
 *
 * No operator-facing value in this module is an id, a stage key, or a raw status key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyChildTrackState } from "@/lib/lifecycle/familyCloseGuard";
import { resolveChildTrackTransition } from "@/lib/lifecycle/resolveChildTrackTransition";
import {
    listEnrollmentInstancesForLead,
    type ProcessInstanceRow,
} from "@/lib/process/processInstances";
import type {
    StageOperatingPlanV1,
    StageParticipantDecisionInputV1,
    StageWorkParticipantDecisionV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

/** One decision as offered to ONE participant. */
export type ParticipantDecisionOptionVM = {
    decision_key: string;
    label: string;
    /** Inputs to collect before this decision can execute. */
    required_inputs: StageParticipantDecisionInputV1[];
    /** False when this decision cannot apply to this participant right now. */
    enabled: boolean;
    /** Operator-facing reason, present only when disabled. */
    disabled_reason?: string;
};

export type ParticipantDecisionRowVM = {
    /** `customer_members.id` — the durable child. Identity for execution, never rendered. */
    customer_member_id: string;
    /** `process_instances.id` — this child's journey through this lead. Never rendered. */
    process_instance_id: string;
    /** Operator-facing name. */
    label: string;
    /** What the operator sees as this child's current position, in plain language. */
    state_label: string;
    /** True once this child's path has been chosen. */
    resolved: boolean;
    /** The chosen decision's label when resolved and identifiable from configuration. */
    resolved_decision_label?: string;
    decisions: ParticipantDecisionOptionVM[];
};

export type ParticipantDecisionProgress = {
    resolved: number;
    total: number;
    /**
     * Operator copy: "1 of 3 children decided". Empty when there is nothing to say.
     *
     * "decided" and "path", never "resolved" — `resolved` is this module's internal word for a
     * computed condition, and it leaked onto the screen as jargon in the first version.
     */
    summary: string;
    /** Shown once every child has a path — the cue that the step can now be completed. */
    completion_hint: string;
    /** Drives the family completion gate. True only when `total > 0 && resolved === total`. */
    all_resolved: boolean;
};

export type ParticipantDecisionSurface = {
    template_key: string;
    rows: ParticipantDecisionRowVM[];
    progress: ParticipantDecisionProgress;
};

/** The set of durable states this template's configured decisions can produce. */
export function resolvedStatesForTemplate(
    decisions: readonly StageWorkParticipantDecisionV1[],
): Set<string> {
    const states = new Set<string>();
    for (const decision of decisions) {
        for (const target of decision.targets) {
            if (target.kind !== "update_child_enrollment_status") continue;
            const key = target.disposition_key?.trim();
            if (key) states.add(key);
        }
    }
    return states;
}

/** Which configured decision produced a participant's current state, if any. */
function decisionForState(
    decisions: readonly StageWorkParticipantDecisionV1[],
    state: string | null,
): StageWorkParticipantDecisionV1 | null {
    if (!state) return null;
    return (
        decisions.find((d) =>
            d.targets.some(
                (t) =>
                    t.kind === "update_child_enrollment_status"
                    && t.disposition_key?.trim() === state,
            ),
        ) ?? null
    );
}

/**
 * PURE progress derivation.
 *
 * `total` counts participants, not decisions taken, so a family with three children needs three
 * resolutions no matter how many times the operator changed their mind on one of them.
 */
export function deriveParticipantDecisionProgress(input: {
    participants: ReadonlyArray<{ state: string | null }>;
    decisions: readonly StageWorkParticipantDecisionV1[];
}): ParticipantDecisionProgress {
    const resolvable = resolvedStatesForTemplate(input.decisions);
    const total = input.participants.length;
    const resolved = input.participants.filter(
        (p) => p.state != null && resolvable.has(p.state.trim()),
    ).length;

    const allDecided = total > 0 && resolved === total;
    const noun = total === 1 ? "child" : "children";

    let summary = "";
    if (total > 0) {
        summary =
            allDecided ?
                total === 1 ? "This child has a path"
                : "All children have a path"
            :   `${resolved} of ${total} ${noun} decided`;
    }

    return {
        resolved,
        total,
        summary,
        completion_hint: allDecided ? "You can now complete this step." : "",
        all_resolved: allDecided,
    };
}

function participantLabelFrom(
    memberNames: Map<string, string>,
    customerMemberId: string,
): string {
    return memberNames.get(customerMemberId)?.trim() || "This child";
}

/**
 * Operator-facing description of where a child's track stands.
 *
 * Configuration owns the words for a CHOSEN path — it is the decision's own label. Only the two
 * states configuration does not name get platform copy, and neither leaks a status key.
 */
function stateLabelFor(
    state: string | null,
    chosen: StageWorkParticipantDecisionV1 | null,
    capabilityLabel: (decision: StageWorkParticipantDecisionV1) => string,
): string {
    if (chosen) return capabilityLabel(chosen);
    if (classifyChildTrackState(state) === "enrolled_blocking") return "Enrolled";
    return "No path chosen yet";
}

export async function projectParticipantDecisionRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    plan: StageOperatingPlanV1;
    templateKey: string;
    /** Resolves a decision's operator label, falling back to its registered capability label. */
    resolveDecisionLabel?: (decision: StageWorkParticipantDecisionV1) => string;
}): Promise<ParticipantDecisionSurface | null> {
    const template = params.plan.work_templates.find(
        (t) => t.template_key === params.templateKey.trim(),
    );
    const configured = template?.participant_decisions ?? [];
    if (!configured.length) return null;

    const labelFor =
        params.resolveDecisionLabel ?? ((d: StageWorkParticipantDecisionV1) => d.label?.trim() || d.decision_key);

    const instances = await listEnrollmentInstancesForLead(params.supabase, {
        orgId: params.orgId,
        opportunityId: params.opportunityId,
    });

    const memberIds = [
        ...new Set(
            instances
                .map((row) => row.subject_id?.trim())
                .filter((id): id is string => Boolean(id)),
        ),
    ];

    const memberNames = new Map<string, string>();
    if (memberIds.length) {
        const { data } = await params.supabase
            .from("customer_members")
            .select("id, first_name, last_name")
            .eq("org_id", params.orgId)
            .in("id", memberIds);
        for (const row of data ?? []) {
            const r = row as { id: string; first_name?: string | null; last_name?: string | null };
            const name = [r.first_name?.trim(), r.last_name?.trim()].filter(Boolean).join(" ");
            if (name) memberNames.set(r.id, name);
        }
    }

    // Available decisions are shown for every participant; whether each APPLIES is decided per
    // child by the same guard that will run at execution, so the surface never offers a button
    // that is going to be refused.
    const visible = configured.filter((d) => d.available !== false);

    const rows: ParticipantDecisionRowVM[] = instances
        .filter((row): row is ProcessInstanceRow & { subject_id: string } => Boolean(row.subject_id))
        .map((row) => {
            const customerMemberId = row.subject_id.trim();
            const label = participantLabelFrom(memberNames, customerMemberId);
            const state = row.state?.trim() || null;
            const chosen = decisionForState(configured, state);

            const decisions: ParticipantDecisionOptionVM[] = visible.map((decision) => {
                const stateTarget = decision.targets.find(
                    (t) => t.kind === "update_child_enrollment_status",
                );
                const targetState = stateTarget?.disposition_key?.trim() ?? "";
                const verdict = resolveChildTrackTransition({
                    currentState: state,
                    targetState,
                    participantLabel: label,
                });
                return {
                    decision_key: decision.decision_key,
                    label: labelFor(decision),
                    required_inputs: decision.required_inputs ?? [],
                    enabled: verdict.allowed,
                    ...(verdict.allowed ? {} : { disabled_reason: verdict.message }),
                };
            });

            return {
                customer_member_id: customerMemberId,
                process_instance_id: row.id,
                label,
                state_label: stateLabelFor(state, chosen, labelFor),
                resolved: chosen != null,
                ...(chosen ? { resolved_decision_label: labelFor(chosen) } : {}),
                decisions,
            };
        })
        // Stable, operator-meaningful order. Without it the rows reshuffle between reads and the
        // operator loses their place mid-decision.
        .sort((a, b) => a.label.localeCompare(b.label) || a.customer_member_id.localeCompare(b.customer_member_id));

    return {
        template_key: params.templateKey.trim(),
        rows,
        progress: deriveParticipantDecisionProgress({
            participants: rows.map((r) => ({
                state:
                    instances.find((i) => i.id === r.process_instance_id)?.state?.trim() ?? null,
            })),
            decisions: configured,
        }),
    };
}
