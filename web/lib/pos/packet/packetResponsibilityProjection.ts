/**
 * Phase 7 — Packet responsibility projection (the single source consumed by operator preview, the
 * participant runtime seam, and completion). Pure composition over requirementResponsibility.ts —
 * NO I/O — so UI, API, and runtime all derive from the same deterministic core, never re-implementing it.
 *
 *   packet forms → enumerated requirements → rules → roster → { instances, validation } → completion
 *                                                                                        → per-participant view
 */

import type { RosterRecipient } from "./posPacketRoster";
import {
    deriveParticipantRequirements,
    enumerateRequirementsFromForm,
    evaluateCompletion,
    isPacketComplete,
    resolveResponsibility,
    validateProjection,
    type EnumerableFormSchema,
    type EnumeratedRequirement,
    type Participant,
    type ProjectionRoster,
    type RequirementCompletion,
    type RequirementInstance,
    type RequirementResponsibility,
    type RequirementResponsibilityRule,
    type RequirementSubmission,
    type RequirementValidationIssue,
    refKey,
} from "./requirementResponsibility";

/** A packet's composed forms, each with its published schema (for enumeration). */
export interface PacketFormInput {
    form_definition_id: string;
    schema: EnumerableFormSchema;
}

export interface PacketProjectionInput {
    forms: PacketFormInput[];
    rules: RequirementResponsibilityRule[];
    roster: ProjectionRoster;
    packetDefault?: RequirementResponsibility;
}

export interface PacketProjection {
    /** Enumerated requirements per form (stable identity + type + resolved responsibility). */
    requirements: Array<EnumeratedRequirement & { responsibility: RequirementResponsibility }>;
    instances: RequirementInstance[];
    validation: RequirementValidationIssue[];
    /** True when any blocking validation issue exists — a packet with these must not launch. */
    launch_blocked: boolean;
}

/** Enumerate + resolve + project + validate a packet across its roster. The one composition seam. */
export function projectPacketResponsibilities(input: PacketProjectionInput): PacketProjection {
    const enumerated: EnumeratedRequirement[] = [];
    for (const form of input.forms) {
        enumerated.push(...enumerateRequirementsFromForm(form.form_definition_id, form.schema));
    }
    const requirements = enumerated.map((req) => ({
        ...req,
        responsibility: resolveResponsibility(input.rules, req.ref, input.packetDefault),
    }));
    const instances = deriveParticipantRequirements({
        requirements: enumerated,
        rules: input.rules,
        roster: input.roster,
        packetDefault: input.packetDefault,
    });
    const validation = validateProjection(instances, input.roster);
    return {
        requirements,
        instances,
        validation,
        launch_blocked: validation.some((v) => v.blocking),
    };
}

// ---------------------------------------------------------------------------------------------------
// Completion — map real form submissions onto requirement completion.
// ---------------------------------------------------------------------------------------------------

/** A real form submission reduced to what completion needs. One per (form, participant, optional child). */
export interface FormSubmissionFact {
    form_definition_id: string;
    /** person_id of the submitter (from form_submissions.person_id, seeded from link.recipient_person_id). */
    participant_id: string | null;
    /** customer_member_id when the submission is child-scoped. */
    child_id?: string | null;
    /** document ids produced/attached by this submission (uploads / generated docs). */
    document_ids?: string[];
}

/**
 * Expand form submissions into per-requirement submissions. Submitting a form completes each of its
 * requirements for the submitter, at the matching scope (a child submission satisfies that child's
 * per-child instances; otherwise the household instance).
 */
export function buildRequirementSubmissions(
    facts: FormSubmissionFact[],
    formsById: Map<string, EnumeratedRequirement[]>
): RequirementSubmission[] {
    const out: RequirementSubmission[] = [];
    for (const fact of facts) {
        if (!fact.participant_id) continue;
        const reqs = formsById.get(fact.form_definition_id) ?? [];
        for (const req of reqs) {
            const scope_key = fact.child_id ? `child:${fact.child_id}` : "household";
            out.push({
                ref_key: refKey(req.ref),
                scope_key,
                participant_id: fact.participant_id,
                document_id: fact.document_ids && fact.document_ids.length > 0 ? fact.document_ids[0] : null,
            });
            // A child submission ALSO counts toward the household instance (same participant/ref).
            if (fact.child_id) {
                out.push({ ref_key: refKey(req.ref), scope_key: "household", participant_id: fact.participant_id, document_id: null });
            }
        }
    }
    return out;
}

export interface PacketCompletion {
    completions: RequirementCompletion[];
    complete: boolean;
    /** Count of required instances that are still incomplete. */
    outstanding_required: number;
}

export function evaluatePacketCompletion(instances: RequirementInstance[], submissions: RequirementSubmission[]): PacketCompletion {
    const completions = evaluateCompletion(instances, submissions);
    return {
        completions,
        complete: isPacketComplete(completions),
        outstanding_required: completions.filter((c) => c.instance.required && !c.complete).length,
    };
}

// ---------------------------------------------------------------------------------------------------
// Participant runtime seam — "what does THIS participant still need to do?"
// ---------------------------------------------------------------------------------------------------

export type ParticipantRequirementState = "unresolved" | "complete" | "owned_by_others" | "either_can_complete";

export interface ParticipantRequirementView {
    ref: RequirementInstance["ref"];
    type: RequirementInstance["type"];
    label: string;
    scope_key: string;
    child_id: string | null;
    state: ParticipantRequirementState;
    /** Who else can/ must complete it (for owned_by_others / either). */
    other_participants: Participant[];
    reopened_for_correction: boolean;
}

/**
 * The clean seam the Conversation Runtime consumes: given the packet completion and a participant,
 * return an ordered projection of what that participant needs to do now, what is already done, what
 * either guardian can do, and what another participant owns. The runtime does NOT read packet schemas.
 */
export function projectForParticipant(args: {
    completions: RequirementCompletion[];
    participantId: string;
    reopenedRefKeys?: Set<string>;
}): ParticipantRequirementView[] {
    const reopened = args.reopenedRefKeys ?? new Set<string>();
    const views: ParticipantRequirementView[] = [];
    for (const c of args.completions) {
        const inst = c.instance;
        const owns = inst.responsible_participants.some((p) => p.participant_id === args.participantId);
        const others = inst.responsible_participants.filter((p) => p.participant_id !== args.participantId);
        // "Either can complete" = any one of multiple responsible participants satisfies it.
        const isEither = (inst.satisfied_by === "one_participant" || inst.satisfied_by === "one_per_child") && inst.responsible_participants.length > 1;

        let state: ParticipantRequirementState;
        if (c.complete) state = "complete";
        else if (!owns) state = "owned_by_others";
        else if (isEither) state = "either_can_complete";
        else state = "unresolved";

        // Only surface requirements relevant to this participant (owns it, or it's still open to either).
        if (!owns && state !== "owned_by_others") continue;
        views.push({
            ref: inst.ref,
            type: inst.type,
            label: inst.label,
            scope_key: inst.scope_key,
            child_id: inst.child_id,
            state,
            other_participants: others,
            reopened_for_correction: reopened.has(refKey(inst.ref)),
        });
    }
    // Ordering: the participant's own unresolved work first, then either-can-complete, then owned-by-others, then complete.
    const rank: Record<ParticipantRequirementState, number> = {
        unresolved: 0,
        either_can_complete: 1,
        owned_by_others: 2,
        complete: 3,
    };
    return views.sort((a, b) => rank[a.state] - rank[b.state]);
}

/** Convenience: guardians from a roster as Participants (for callers building per-guardian views). */
export function guardiansOf(recipients: RosterRecipient[]): Participant[] {
    return recipients.map((r) => ({ participant_id: r.person_id, kind: "guardian", label: r.label, relationship: r.relationship }));
}
