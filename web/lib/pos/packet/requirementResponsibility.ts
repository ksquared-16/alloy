/**
 * Phase 7 — Requirement Responsibility model (deterministic core).
 *
 * Packet → Forms → Requirements → **Responsibility Rules** → Conversation Runtime. Every downstream
 * surface (packet view, participant journey, conversation runtime, completion state) is a derived
 * projection of the rules here. There is NO packet/item "assignment" model.
 *
 * A responsibility rule answers three questions — the STABLE contract (see
 * docs/platform/planning/phase7-requirement-responsibility-model.md):
 *   1. applies_to        — what the requirement applies to (household/participant/child/document/packet)
 *   2. responsible_party — who must act (a guardian, either, all, financial guardian, child, a role)
 *   3. satisfied_by      — what counts as done (one/assigned/every-assigned/one-per-child/one-per-document)
 *
 * Rules ride packet-definition metadata now; the SAME objects promote to a first-class table later with
 * no change to these axes or to `deriveParticipantRequirements`/`evaluateCompletion` — the one seam that
 * every consumer calls. This module is pure (no I/O) so it is exhaustively unit-testable.
 */

import type { RosterChild, RosterRecipient } from "./posPacketRoster";

// ---------------------------------------------------------------------------------------------------
// The three axes — the stable contract.
// ---------------------------------------------------------------------------------------------------

export type RequirementScope = "household" | "participant" | "child" | "document" | "packet";

export type ResponsibleParty =
    | { kind: "either_guardian" }
    | { kind: "all_guardians" }
    | { kind: "specific_guardian"; person_id: string }
    | { kind: "financial_guardian" }
    | { kind: "child_participant" }
    | { kind: "role"; role: string };

export type SatisfactionRule =
    | "one_participant"
    | "assigned_participant"
    | "every_assigned_participant"
    | "one_per_child"
    | "one_per_document";

export interface RequirementResponsibility {
    applies_to: RequirementScope;
    responsible_party: ResponsibleParty;
    satisfied_by: SatisfactionRule;
}

/** Addresses a requirement. `section_key` absent → a form-level default for all its requirements. */
export interface RequirementRef {
    form_definition_id: string;
    section_key?: string | null;
}

/** A responsibility rule bound to a requirement ref — the shape stored in packet metadata. */
export interface RequirementResponsibilityRule extends RequirementResponsibility {
    ref: RequirementRef;
}

/** Built-in fallback when no rule and no packet default apply. */
export const DEFAULT_RESPONSIBILITY: RequirementResponsibility = {
    applies_to: "participant",
    responsible_party: { kind: "either_guardian" },
    satisfied_by: "one_participant",
};

// ---------------------------------------------------------------------------------------------------
// Resolution — section-specific rule → form-level default → packet default → built-in default.
// ---------------------------------------------------------------------------------------------------

function pickResponsibility(rule: RequirementResponsibilityRule): RequirementResponsibility {
    return { applies_to: rule.applies_to, responsible_party: rule.responsible_party, satisfied_by: rule.satisfied_by };
}

export function resolveResponsibility(
    rules: RequirementResponsibilityRule[],
    ref: RequirementRef,
    packetDefault?: RequirementResponsibility
): RequirementResponsibility {
    const forForm = rules.filter((r) => r.ref.form_definition_id === ref.form_definition_id);
    if (ref.section_key) {
        const section = forForm.find((r) => r.ref.section_key === ref.section_key);
        if (section) return pickResponsibility(section);
    }
    const formLevel = forForm.find((r) => !r.ref.section_key);
    if (formLevel) return pickResponsibility(formLevel);
    return packetDefault ?? DEFAULT_RESPONSIBILITY;
}

// ---------------------------------------------------------------------------------------------------
// Persistence — rules ride packet-definition metadata.requirement_responsibilities (no migration).
// ---------------------------------------------------------------------------------------------------

export const REQUIREMENT_RESPONSIBILITIES_KEY = "requirement_responsibilities";

const SCOPES: RequirementScope[] = ["household", "participant", "child", "document", "packet"];
const SATISFACTIONS: SatisfactionRule[] = [
    "one_participant",
    "assigned_participant",
    "every_assigned_participant",
    "one_per_child",
    "one_per_document",
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseResponsibleParty(raw: unknown): ResponsibleParty | null {
    if (!isPlainObject(raw)) return null;
    const kind = raw.kind;
    switch (kind) {
        case "either_guardian":
        case "all_guardians":
        case "financial_guardian":
        case "child_participant":
            return { kind };
        case "specific_guardian":
            return typeof raw.person_id === "string" && raw.person_id ? { kind, person_id: raw.person_id } : null;
        case "role":
            return typeof raw.role === "string" && raw.role.trim() ? { kind, role: raw.role } : null;
        default:
            return null;
    }
}

/** Parse `metadata.requirement_responsibilities` into validated rules (drops malformed entries). */
export function parseRequirementResponsibilityRules(metadata: unknown): RequirementResponsibilityRule[] {
    if (!isPlainObject(metadata)) return [];
    const raw = metadata[REQUIREMENT_RESPONSIBILITIES_KEY];
    if (!Array.isArray(raw)) return [];
    const out: RequirementResponsibilityRule[] = [];
    for (const entry of raw) {
        if (!isPlainObject(entry)) continue;
        const ref = entry.ref;
        if (!isPlainObject(ref) || typeof ref.form_definition_id !== "string" || !ref.form_definition_id) continue;
        const party = parseResponsibleParty(entry.responsible_party);
        if (!party) continue;
        const applies_to = SCOPES.includes(entry.applies_to as RequirementScope) ? (entry.applies_to as RequirementScope) : null;
        const satisfied_by = SATISFACTIONS.includes(entry.satisfied_by as SatisfactionRule) ? (entry.satisfied_by as SatisfactionRule) : null;
        if (!applies_to || !satisfied_by) continue;
        out.push({
            ref: {
                form_definition_id: ref.form_definition_id,
                ...(typeof ref.section_key === "string" && ref.section_key ? { section_key: ref.section_key } : {}),
            },
            applies_to,
            responsible_party: party,
            satisfied_by,
        });
    }
    return out;
}

// ---------------------------------------------------------------------------------------------------
// Projection — (requirements + rules + roster) → concrete per-participant requirement instances.
// ---------------------------------------------------------------------------------------------------

export type ParticipantKind = "guardian" | "child" | "role";

export interface Participant {
    participant_id: string; // person_id (guardian/role) or customer_member_id (child)
    kind: ParticipantKind;
    label: string;
    relationship?: string | null;
}

/** A requirement enumerated from a form (a section, or the form itself when section_key is absent). */
export interface EnumeratedRequirement {
    ref: RequirementRef;
    label: string;
    /** SectionDisposition when known (upload/acknowledgement/signature/…) — informational. */
    disposition?: string | null;
}

export interface RequirementInstance {
    ref: RequirementRef;
    label: string;
    disposition: string | null;
    responsibility: RequirementResponsibility;
    /** "household" | "packet" | `child:${customer_member_id}`. */
    scope_key: string;
    child_id: string | null;
    responsible_participants: Participant[];
    satisfied_by: SatisfactionRule;
}

export interface ProjectionRoster {
    children: RosterChild[];
    recipients: RosterRecipient[];
    /** Optional: the recipient who is the financial guardian (else inferred from relationship). */
    financial_guardian_person_id?: string | null;
}

function guardianParticipant(r: RosterRecipient): Participant {
    return { participant_id: r.person_id, kind: "guardian", label: r.label, relationship: r.relationship };
}

function childParticipant(c: RosterChild): Participant {
    return { participant_id: c.customer_member_id, kind: "child", label: c.label };
}

function looksFinancial(relationship: string | null): boolean {
    return /financ|billing|payer/i.test(relationship ?? "");
}

/** Resolve which concrete participants own a requirement instance from the responsible-party rule. */
function resolveResponsibleParticipants(
    party: ResponsibleParty,
    roster: ProjectionRoster,
    childForScope: RosterChild | null
): Participant[] {
    const guardians = roster.recipients.map(guardianParticipant);
    switch (party.kind) {
        case "either_guardian":
        case "all_guardians":
            return guardians;
        case "specific_guardian": {
            const match = roster.recipients.find((r) => r.person_id === party.person_id);
            return match ? [guardianParticipant(match)] : [];
        }
        case "financial_guardian": {
            const byId = roster.financial_guardian_person_id
                ? roster.recipients.find((r) => r.person_id === roster.financial_guardian_person_id)
                : undefined;
            const chosen = byId ?? roster.recipients.find((r) => looksFinancial(r.relationship));
            return chosen ? [guardianParticipant(chosen)] : [];
        }
        case "child_participant":
            return childForScope ? [childParticipant(childForScope)] : roster.children.map(childParticipant);
        case "role": {
            const wanted = party.role.trim().toLowerCase();
            return roster.recipients
                .filter((r) => (r.relationship ?? "").trim().toLowerCase() === wanted)
                .map((r) => ({ participant_id: r.person_id, kind: "role" as const, label: r.label, relationship: r.relationship }));
        }
    }
}

/**
 * Fan each requirement out into concrete instances against the roster. `applies_to: child` yields one
 * instance per child; household/packet/participant yield a single family instance. `responsible_party`
 * populates who owns each instance; `satisfied_by` rides through to completion evaluation.
 */
export function deriveParticipantRequirements(input: {
    requirements: EnumeratedRequirement[];
    rules: RequirementResponsibilityRule[];
    roster: ProjectionRoster;
    packetDefault?: RequirementResponsibility;
}): RequirementInstance[] {
    const { requirements, rules, roster, packetDefault } = input;
    const instances: RequirementInstance[] = [];
    for (const req of requirements) {
        const responsibility = resolveResponsibility(rules, req.ref, packetDefault);
        const perChild = responsibility.applies_to === "child";
        const scopes: Array<{ scope_key: string; child: RosterChild | null }> = perChild
            ? roster.children.map((c) => ({ scope_key: `child:${c.customer_member_id}`, child: c }))
            : [{ scope_key: responsibility.applies_to === "packet" ? "packet" : "household", child: null }];
        for (const scope of scopes) {
            instances.push({
                ref: req.ref,
                label: req.label,
                disposition: req.disposition ?? null,
                responsibility,
                scope_key: scope.scope_key,
                child_id: scope.child?.customer_member_id ?? null,
                responsible_participants: resolveResponsibleParticipants(responsibility.responsible_party, roster, scope.child),
                satisfied_by: responsibility.satisfied_by,
            });
        }
    }
    return instances;
}

// ---------------------------------------------------------------------------------------------------
// Completion — reduce submissions to per-instance completion. Powers operator view + participant journey.
// ---------------------------------------------------------------------------------------------------

export function refKey(ref: RequirementRef): string {
    return `${ref.form_definition_id}::${ref.section_key ?? "*"}`;
}

export interface RequirementSubmission {
    ref_key: string; // refKey(ref)
    scope_key: string; // matches RequirementInstance.scope_key
    participant_id: string; // who completed it
    document_id?: string | null;
}

export interface RequirementCompletion {
    instance: RequirementInstance;
    complete: boolean;
    completed_by: string[];
    /** Participants still owing a completion (meaningful for every_assigned_participant). */
    outstanding_participants: Participant[];
}

export function evaluateCompletion(
    instances: RequirementInstance[],
    submissions: RequirementSubmission[]
): RequirementCompletion[] {
    return instances.map((instance) => {
        const key = refKey(instance.ref);
        const matching = submissions.filter((s) => s.ref_key === key && s.scope_key === instance.scope_key);
        const completedBy = Array.from(new Set(matching.map((s) => s.participant_id)));
        const responsibleIds = new Set(instance.responsible_participants.map((p) => p.participant_id));

        let complete = false;
        let outstanding: Participant[] = [];
        switch (instance.satisfied_by) {
            case "one_participant":
                complete = matching.length > 0;
                break;
            case "assigned_participant":
                complete = matching.some((s) => responsibleIds.has(s.participant_id));
                break;
            case "every_assigned_participant":
                outstanding = instance.responsible_participants.filter((p) => !completedBy.includes(p.participant_id));
                complete = instance.responsible_participants.length > 0 && outstanding.length === 0;
                break;
            case "one_per_child":
                // Instance is already per-child (scope_key child:*); one submission for it suffices.
                complete = matching.length > 0;
                break;
            case "one_per_document":
                complete = matching.some((s) => !!s.document_id);
                break;
        }
        return { instance, complete, completed_by: completedBy, outstanding_participants: outstanding };
    });
}
