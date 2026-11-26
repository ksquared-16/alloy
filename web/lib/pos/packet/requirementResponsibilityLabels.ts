/**
 * Phase 7 — operator + participant facing language for the requirement-responsibility model.
 *
 * The UI and API responses render THESE strings; raw enum values, schema ids, and metadata JSON never
 * reach the operator. Also defines which axis options are VALID for a given requirement type/scope so
 * the composer only offers meaningful combinations (no invalid/meaningless choices).
 */

import type {
    RequirementResponsibility,
    RequirementScope,
    RequirementType,
    ResponsibleParty,
    SatisfactionRule,
} from "./requirementResponsibility";

// ---- Requirement type ----------------------------------------------------------------------------

export function requirementTypeLabel(type: RequirementType): string {
    switch (type) {
        case "information":
            return "Information";
        case "static_content":
            return "Presented content";
        case "upload":
            return "Document upload";
        case "acknowledgement":
            return "Acknowledgement";
        case "initials":
            return "Initials";
        case "signature":
            return "Signature";
        case "generated_review":
            return "Generated document review";
    }
}

/** Presented content is shown, not assigned — informational only (no responsibility to configure). */
export function isInformationalOnly(type: RequirementType): boolean {
    return type === "static_content";
}

// ---- Applies to (scope) --------------------------------------------------------------------------

export function scopeLabel(scope: RequirementScope): string {
    switch (scope) {
        case "household":
            return "Household";
        case "child":
            return "Each child";
        case "participant":
            return "Participant";
        case "document":
            return "Document";
        case "packet":
            return "Entire packet";
    }
}

/** Which scopes make sense for a requirement type — the composer offers only these. */
export function validScopes(type: RequirementType): RequirementScope[] {
    switch (type) {
        case "upload":
            return ["household", "child", "participant", "document"];
        case "generated_review":
            return ["document", "household", "participant"];
        case "signature":
        case "initials":
            return ["household", "child", "participant"];
        case "acknowledgement":
        case "information":
            return ["household", "child", "participant", "packet"];
        case "static_content":
            return ["packet"];
    }
}

// ---- Responsible party ---------------------------------------------------------------------------

export function partyLabel(party: ResponsibleParty): string {
    switch (party.kind) {
        case "either_guardian":
            return "Either guardian";
        case "all_guardians":
            return "All guardians";
        case "primary_guardian":
            return "Primary guardian";
        case "financial_guardian":
            return "Financial guardian";
        case "child_participant":
            return "Participant themselves";
        case "specific_guardian":
            return "A specific guardian";
        case "role":
            return `Role: ${party.role}`;
    }
}

export type PartyOptionKind = Exclude<ResponsibleParty["kind"], "specific_guardian">;

/**
 * Party options offered when configuring a REUSABLE packet definition. `specific_guardian` (a named
 * person) is deliberately excluded — it is only meaningful for an instantiated household packet.
 */
export function partyOptions(): Array<{ kind: PartyOptionKind; label: string }> {
    return [
        { kind: "either_guardian", label: "Either guardian" },
        { kind: "all_guardians", label: "All guardians" },
        { kind: "primary_guardian", label: "Primary guardian" },
        { kind: "financial_guardian", label: "Financial guardian" },
        { kind: "child_participant", label: "Participant themselves" },
        { kind: "role", label: "A specific role" },
    ];
}

// ---- Satisfaction --------------------------------------------------------------------------------

export function satisfactionLabel(rule: SatisfactionRule): string {
    switch (rule) {
        case "one_participant":
            return "One responsible person completes it";
        case "assigned_participant":
            return "The assigned person completes it";
        case "every_assigned_participant":
            return "Every responsible person completes it";
        case "one_per_child":
            return "Once for each child";
        case "one_per_document":
            return "Once for each document";
    }
}

/** Which satisfaction rules make sense for a given scope. */
export function validSatisfactions(scope: RequirementScope): SatisfactionRule[] {
    switch (scope) {
        case "child":
            return ["one_per_child", "one_participant", "every_assigned_participant"];
        case "document":
            return ["one_per_document", "one_participant"];
        default:
            return ["one_participant", "assigned_participant", "every_assigned_participant"];
    }
}

// ---- Concise summary (collapsed row) -------------------------------------------------------------

/** e.g. "Either guardian · Once for each child" — the one-line responsibility summary. */
export function responsibilitySummary(resp: RequirementResponsibility): string {
    return `${partyLabel(resp.responsible_party)} · ${satisfactionLabel(resp.satisfied_by)}`;
}
