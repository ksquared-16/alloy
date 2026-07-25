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
 *   2. responsible_party — who must act (a guardian, either, all, financial/primary guardian, child, role)
 *   3. satisfied_by      — what counts as done (one/assigned/every-assigned/one-per-child/one-per-document)
 *
 * DURABLE REQUIREMENT IDENTITY (see the design doc): a requirement is addressed by
 * `{ form_definition_id, section_id?, field_id? }` — the smallest reference that survives form
 * versioning, packet composition, participant projection, correction, document regeneration, and audit.
 * `field_id` (an upload/ack/signature/etc.) is the most specific; `section_id` addresses an information
 * block; neither → a form-level default. These ids are the schema's stable field/section `id`s, NOT
 * display labels or array positions. If a new form version drops an id, its rule becomes a dangling
 * reference — surfaced as a blocking validation error, never silently rebound.
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
    | { kind: "primary_guardian" }
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

/**
 * The kind of obligation a requirement represents — derived from the form field/section, surfaced in
 * operator + participant language, and used to pick sensible defaults.
 */
export type RequirementType =
    | "information" // a section/field collecting digital info
    | "static_content" // content that must be presented (text_block / static reference)
    | "upload" // a document attachment (file_ref)
    | "acknowledgement" // a consent/policy the participant must acknowledge (boolean)
    | "initials"
    | "signature"
    | "generated_review"; // review/sign a generated document

/** Durable requirement identity. `field_id` most specific → `section_id` → form-level (neither set). */
export interface RequirementRef {
    form_definition_id: string;
    section_id?: string | null;
    field_id?: string | null;
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

/**
 * Sensible, EDITABLE defaults by requirement type (operator can override every one). Scope defaults to
 * `participant`; the operator promotes to household/child. Financial/primary narrowing is an operator
 * override (not derivable from a field type).
 */
export function defaultResponsibilityForType(type: RequirementType): RequirementResponsibility {
    switch (type) {
        case "acknowledgement":
        case "initials":
        case "signature":
        case "generated_review":
            return { applies_to: "participant", responsible_party: { kind: "all_guardians" }, satisfied_by: "every_assigned_participant" };
        case "upload":
        case "static_content":
        case "information":
        default:
            return { applies_to: "participant", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_participant" };
    }
}

// ---------------------------------------------------------------------------------------------------
// Requirement enumeration — walk a published form schema into meaningful, stably-identified requirements.
// ---------------------------------------------------------------------------------------------------

/** Structural subset of FormSchemaV1 this module needs (kept local to avoid tight coupling). */
export interface EnumerableFormField {
    id: string;
    label: string;
    required?: boolean;
    type: string;
    signature?: { mode?: string } | undefined;
}
export interface EnumerableFormSection {
    id: string;
    title?: string;
    field_ids: string[];
}
export interface EnumerableFormSchema {
    title?: string;
    sections: EnumerableFormSection[];
    fields: EnumerableFormField[];
}

/** A requirement enumerated from a form: its stable ref, kind, label, and default responsibility. */
export interface EnumeratedRequirement {
    ref: RequirementRef;
    type: RequirementType;
    label: string;
    required: boolean;
    default_responsibility: RequirementResponsibility;
}

/** Map a form field to a requirement type, or null when it is a plain information input. */
function fieldRequirementType(field: EnumerableFormField): RequirementType | null {
    switch (field.type) {
        case "file_ref":
            return "upload";
        case "signature":
            return field.signature?.mode === "initials" ? "initials" : "signature";
        case "boolean":
            return "acknowledgement";
        case "text_block":
            return "static_content";
        default:
            return null; // text/number/date/select/multiselect/group → part of an information section
    }
}

/**
 * Enumerate the meaningful requirements of a published form. Field-grain requirements (upload,
 * acknowledgement, signature/initials, static content) are emitted per field; the remaining plain
 * inputs in a section collapse into a single section-grain "information" requirement. Order follows
 * the schema's section then field order. Fields not referenced by any section are still enumerated
 * (appended) so nothing meaningful is dropped.
 */
export function enumerateRequirementsFromForm(formDefinitionId: string, schema: EnumerableFormSchema): EnumeratedRequirement[] {
    const fieldsById = new Map(schema.fields.map((f) => [f.id, f]));
    const out: EnumeratedRequirement[] = [];
    const seenFieldIds = new Set<string>();

    const emitField = (field: EnumerableFormField, type: RequirementType) => {
        seenFieldIds.add(field.id);
        out.push({
            ref: { form_definition_id: formDefinitionId, field_id: field.id },
            type,
            label: field.label,
            required: field.required === true,
            default_responsibility: defaultResponsibilityForType(type),
        });
    };

    for (const section of schema.sections) {
        let sectionHasInfo = false;
        let sectionHasRequiredInfo = false;
        for (const fid of section.field_ids) {
            const field = fieldsById.get(fid);
            if (!field) continue;
            const type = fieldRequirementType(field);
            if (type) {
                emitField(field, type);
            } else {
                sectionHasInfo = true;
                if (field.required === true) sectionHasRequiredInfo = true;
                seenFieldIds.add(field.id);
            }
        }
        if (sectionHasInfo) {
            out.push({
                ref: { form_definition_id: formDefinitionId, section_id: section.id },
                type: "information",
                label: section.title?.trim() || "Information",
                required: sectionHasRequiredInfo,
                default_responsibility: defaultResponsibilityForType("information"),
            });
        }
    }

    // Top-level fields not referenced by any section (still meaningful requirements).
    for (const field of schema.fields) {
        if (seenFieldIds.has(field.id)) continue;
        const type = fieldRequirementType(field);
        if (type) emitField(field, type);
    }

    return out;
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
        case "primary_guardian":
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
                ...(typeof ref.section_id === "string" && ref.section_id ? { section_id: ref.section_id } : {}),
                ...(typeof ref.field_id === "string" && ref.field_id ? { field_id: ref.field_id } : {}),
            },
            applies_to,
            responsible_party: party,
            satisfied_by,
        });
    }
    return out;
}

/** Serialize rules for storage under metadata.requirement_responsibilities. */
export function serializeRequirementResponsibilityRules(rules: RequirementResponsibilityRule[]): Record<string, unknown> {
    return { [REQUIREMENT_RESPONSIBILITIES_KEY]: rules };
}

// ---------------------------------------------------------------------------------------------------
// Resolution — field-specific → section-specific → form-level → packet default → built-in default.
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
    if (ref.field_id) {
        const field = forForm.find((r) => r.ref.field_id === ref.field_id);
        if (field) return pickResponsibility(field);
    }
    if (ref.section_id) {
        const section = forForm.find((r) => !r.ref.field_id && r.ref.section_id === ref.section_id);
        if (section) return pickResponsibility(section);
    }
    const formLevel = forForm.find((r) => !r.ref.field_id && !r.ref.section_id);
    if (formLevel) return pickResponsibility(formLevel);
    return packetDefault ?? DEFAULT_RESPONSIBILITY;
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

export interface RequirementInstance {
    ref: RequirementRef;
    type: RequirementType;
    label: string;
    responsibility: RequirementResponsibility;
    /** "household" | "packet" | `child:${customer_member_id}`. */
    scope_key: string;
    child_id: string | null;
    required: boolean;
    responsible_participants: Participant[];
    satisfied_by: SatisfactionRule;
}

export interface ProjectionRoster {
    children: RosterChild[];
    recipients: RosterRecipient[];
    /** Optional: the recipient who is the financial guardian (else inferred from relationship). */
    financial_guardian_person_id?: string | null;
    /** Optional: the primary guardian (else the first recipient). */
    primary_guardian_person_id?: string | null;
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
        case "primary_guardian": {
            const byId = roster.primary_guardian_person_id
                ? roster.recipients.find((r) => r.person_id === roster.primary_guardian_person_id)
                : undefined;
            const chosen = byId ?? roster.recipients[0];
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
 * instance per child; household/packet/participant/document yield a single family instance.
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
                type: req.type,
                label: req.label,
                responsibility,
                scope_key: scope.scope_key,
                child_id: scope.child?.customer_member_id ?? null,
                required: req.required,
                responsible_participants: resolveResponsibleParticipants(responsibility.responsible_party, roster, scope.child),
                satisfied_by: responsibility.satisfied_by,
            });
        }
    }
    return instances;
}

// ---------------------------------------------------------------------------------------------------
// Validation — blocking responsibility errors that must prevent launch.
// ---------------------------------------------------------------------------------------------------

export type RequirementValidationCode =
    | "no_participant_can_satisfy"
    | "all_guardians_with_one_guardian"
    | "signature_without_signer"
    | "child_scope_without_children"
    | "role_not_present"
    | "generated_review_without_reviewer";

export interface RequirementValidationIssue {
    code: RequirementValidationCode;
    ref: RequirementRef;
    scope_key: string;
    label: string;
    message: string;
    blocking: boolean;
}

/** Detect blocking responsibility problems in the projected instances (see the design doc's list). */
export function validateProjection(instances: RequirementInstance[], roster: ProjectionRoster): RequirementValidationIssue[] {
    const issues: RequirementValidationIssue[] = [];
    const guardianCount = roster.recipients.length;
    for (const inst of instances) {
        const base = { ref: inst.ref, scope_key: inst.scope_key, label: inst.label };
        if (inst.required && inst.responsible_participants.length === 0) {
            issues.push({
                ...base,
                code:
                    inst.responsibility.responsible_party.kind === "role"
                        ? "role_not_present"
                        : inst.type === "signature" || inst.type === "initials"
                          ? "signature_without_signer"
                          : inst.type === "generated_review"
                            ? "generated_review_without_reviewer"
                            : "no_participant_can_satisfy",
                message: `"${inst.label}" is required but no participant can complete it as configured.`,
                blocking: true,
            });
            continue;
        }
        if (
            inst.responsibility.satisfied_by === "every_assigned_participant" &&
            inst.responsibility.responsible_party.kind === "all_guardians" &&
            guardianCount < 2
        ) {
            issues.push({
                ...base,
                code: "all_guardians_with_one_guardian",
                message: `"${inst.label}" expects every guardian to complete it, but only one guardian is configured.`,
                blocking: false,
            });
        }
        if (inst.responsibility.applies_to === "child" && roster.children.length === 0) {
            issues.push({
                ...base,
                code: "child_scope_without_children",
                message: `"${inst.label}" applies to each child, but no child is in scope.`,
                blocking: true,
            });
        }
    }
    return issues;
}

// ---------------------------------------------------------------------------------------------------
// Completion — reduce submissions to per-instance completion. Powers operator view + participant journey.
// ---------------------------------------------------------------------------------------------------

export function refKey(ref: RequirementRef): string {
    return `${ref.form_definition_id}::${ref.section_id ?? "*"}::${ref.field_id ?? "*"}`;
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
                complete = matching.length > 0;
                break;
            case "one_per_document":
                complete = matching.some((s) => !!s.document_id);
                break;
        }
        return { instance, complete, completed_by: completedBy, outstanding_participants: outstanding };
    });
}

/** A packet is complete only when every REQUIRED projected requirement satisfies its rule. */
export function isPacketComplete(completions: RequirementCompletion[]): boolean {
    const required = completions.filter((c) => c.instance.required);
    return required.length > 0 && required.every((c) => c.complete);
}
