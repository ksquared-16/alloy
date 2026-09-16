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
import { CONCLUDED_ENROLLMENT_PROCESS_STATES } from "@/lib/process/processInstances";
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
    /**
     * `process_instances.id` — this child's journey, WHEN ONE EXISTS. Never rendered.
     *
     * Optional on purpose: at the Decision stage most children have no journey yet, because
     * Begin Enrolling is the decision that starts one. A row is a child to decide about, not a
     * journey to report on.
     */
    process_instance_id?: string;
    /** `opportunity_customer_members.id` — this child's membership of THIS lead. Never rendered. */
    opportunity_customer_member_id: string;
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

    /*
     * WHO IS BEING DECIDED vs WHAT HAS HAPPENED TO THEM.
     *
     * This enumerated existing Enrollment journeys and derived the children from them. For a
     * pre-enrolment Decision that is backwards: `Begin Enrolling` is the decision that CREATES a
     * journey, so a child who has never been enrolled had no journey, therefore no row, therefore
     * could never be offered the decision — the children the surface exists for were exactly the
     * ones it could not see. Measured: two Decision-stage families returned zero rows while their
     * children were listed on the Children card beside them, and the only child that did appear
     * had a journey because someone had already run Start enrollment on them by hand.
     *
     * Membership defines the participants; a journey is optional state about one. So the lead's
     * own children are enumerated, and a journey attaches to a child when one exists.
     */
    const { data: membershipData } = await params.supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id, outcome_status_key")
        .eq("org_id", params.orgId)
        .eq("opportunity_id", params.opportunityId);

    const memberships = ((membershipData ?? []) as {
        id: string;
        customer_member_id: string | null;
        outcome_status_key: string | null;
    }[]).filter((m) => (m.customer_member_id ?? "").trim());

    /*
     * Still read, still useful — and still under BOTH anchors. A child mid-journey must show the
     * state they are actually in, and `listEnrollmentInstancesForLead` is what finds a journey
     * whether it was anchored to the Opportunity or to the participation.
     */
    const instances = await listEnrollmentInstancesForLead(params.supabase, {
        orgId: params.orgId,
        opportunityId: params.opportunityId,
    });
    const journeyByMember = new Map<string, ProcessInstanceRow>();
    for (const row of instances) {
        const subject = row.subject_id?.trim();
        if (!subject) continue;
        // One journey per child on this surface. A re-enrolling child can hold more than one; the
        // open one is what a Decision is about, so a concluded row never displaces it.
        const concluded = (r: ProcessInstanceRow) =>
            CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((r.state ?? "").trim().toLowerCase());
        const held = journeyByMember.get(subject);
        if (!held || concluded(held)) journeyByMember.set(subject, row);
    }

    const memberIds = [...new Set(memberships.map((m) => (m.customer_member_id ?? "").trim()))];

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

    const stateByMember = new Map<string, string | null>();
    const rows: ParticipantDecisionRowVM[] = memberships
        .map((membership) => {
            const customerMemberId = (membership.customer_member_id ?? "").trim();
            const journey = journeyByMember.get(customerMemberId) ?? null;
            const label = participantLabelFrom(memberNames, customerMemberId);
            /*
             * The child's current position, from the journey when there is one and from the
             * membership's own disposition when there is not. Both are canonical; neither is
             * invented, and a child with neither is simply undecided.
             */
            const state = journey?.state?.trim() || membership.outcome_status_key?.trim() || null;
            stateByMember.set(customerMemberId, state);
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
                opportunity_customer_member_id: membership.id,
                ...(journey ? { process_instance_id: journey.id } : {}),
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
        /*
         * Counts CHILDREN, not journeys. `requires_all_participants_resolved` means every child of
         * this lead, and deriving the count from journeys made a three-child family completable
         * after one decision simply because the other two had never been started.
         */
        progress: deriveParticipantDecisionProgress({
            participants: rows.map((r) => ({ state: stateByMember.get(r.customer_member_id) ?? null })),
            decisions: configured,
        }),
    };
}
