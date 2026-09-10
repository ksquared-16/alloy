/**
 * What a returned answer MEANS next to the record Alloy already owns.
 *
 * ## Why this is one function and not a packet feature
 *
 * A family completing a packet re-answers a lot of questions they were never really asked. Three
 * forms in one packet each collect the child's name; almost every answer is the value already on
 * file. Shown as a flat list of "proposed values", all of it looks like a change, and an operator
 * asked to approve thirty changes when two are real will approve all thirty.
 *
 * The distinction already existed — but only at the moment of commit, inside
 * `planExistingChildCommit`, which discovers "already applied" AFTER the operator has decided. That
 * is exactly backwards: the operator needs it while deciding. So the comparison moved here, the
 * planner imports it, and review and commit cannot disagree about what "unchanged" means because
 * there is one definition of it.
 *
 * ## The vocabulary is the existing one
 *
 * `unchanged` is the planner's `already_applied`. `refused` is what its `skip(...)` reasons already
 * express (`unsupported`, `invalid`, plus the proposal model's own diagnostics). `form_only` is the
 * `missing_field_binding` diagnostic seen from the operator's side. Nothing new was invented for
 * packets; a packet simply produces more of all of it.
 *
 * ## Re-registration reads the same five answers
 *
 * "The family confirmed most of their information and changed their address and emergency contact"
 * is this function's output counted up: confirmed unchanged, changed, new, unresolved. That summary
 * needs no separate model, which is the point of putting the distinction here rather than in a
 * packet-shaped view.
 *
 * Pure. No I/O.
 */

import type { ProposalDiagnostic, RelatedRecordProposalStatus } from "@/lib/intake/proposals/types";

export type ReturnedValueClassification =
    /** The participant returned the value Alloy already holds. Not a change; never presented as one. */
    | "unchanged"
    /** Canonical truth holds something different. This is the decision an operator is actually for. */
    | "changed"
    /** Canonical truth holds nothing; the participant supplied it. */
    | "new"
    /** The answer has no canonical destination. It stays Form/submission truth and never commits. */
    | "form_only"
    /** Ownership, grain or mapping could not be resolved safely. Must never silently commit. */
    | "refused";

/** The planner's own three-way freshness answer, kept verbatim. */
export type ReturnedValueStaleState = "already_applied" | "stale_conflict" | "clean";

/**
 * Canonical value equality.
 *
 * Deliberately string-comparing with null and undefined collapsed to "": a form returns "" where a
 * record holds null, and treating that as a change would make every untouched optional field look
 * edited. This is the planner's original rule, moved rather than rewritten.
 */
export function sameCanonicalValue(a: unknown, b: unknown): boolean {
    return String(a ?? "") === String(b ?? "");
}

/** True when canonical truth holds nothing for this field. */
export function canonicalValueIsEmpty(value: unknown): boolean {
    return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Has the record moved under a proposal since it was formed?
 *
 * @param current what the record holds now
 * @param observed what it held when the proposal was formed, when that was recorded
 * @param proposed the value being offered
 */
export function staleStateFor(
    current: unknown,
    observed: unknown | undefined,
    proposed: unknown,
): ReturnedValueStaleState {
    if (sameCanonicalValue(current, proposed)) return "already_applied";
    if (observed !== undefined && !sameCanonicalValue(current, observed)) return "stale_conflict";
    return "clean";
}

/** Diagnostics that mean "we could not safely say where this belongs". */
const REFUSING_DIAGNOSTICS = new Set([
    "unknown_provider",
    "invalid_existing_record_id",
    "unsupported_item_entity",
    "collection_mismatch",
    "duplicate_instance_key",
    "malformed_value",
    "missing_source_context",
    "org_boundary",
    "inaccessible_record",
]);

export type ClassifyReturnedValueInput = {
    /** Whether the authored field names a canonical destination at all. */
    readonly hasCanonicalBinding: boolean;
    /** What the owning record holds now. `undefined` means it could not be resolved. */
    readonly canonicalCurrentValue?: unknown;
    /** What the participant returned. */
    readonly participantValue: unknown;
    /** What the record held when the proposal was formed, when recorded. */
    readonly observedValue?: unknown;
    /** The proposal's own status, when this value came through one. */
    readonly proposalStatus?: RelatedRecordProposalStatus | null;
    readonly diagnostics?: readonly ProposalDiagnostic[];
};

export type ClassifiedReturnedValue = {
    readonly classification: ReturnedValueClassification;
    readonly staleState: ReturnedValueStaleState | null;
    /** Short, operator-facing reason. Present only when the answer is refused. */
    readonly refusalReason?: string;
};

/**
 * Classify one returned value.
 *
 * Order matters, and it is the order of safety: an answer that cannot be placed is refused before
 * anything tries to read it as a change, and a value with no destination is form-only before it is
 * compared to a canonical value it does not have.
 */
export function classifyReturnedValue(input: ClassifyReturnedValueInput): ClassifiedReturnedValue {
    const refusing = (input.diagnostics ?? []).find((d) => REFUSING_DIAGNOSTICS.has(d.code));
    if (refusing) {
        return { classification: "refused", staleState: null, refusalReason: refusing.message };
    }
    if (input.proposalStatus === "invalid" || input.proposalStatus === "unsupported") {
        return {
            classification: "refused",
            staleState: null,
            refusalReason:
                input.proposalStatus === "unsupported"
                    ? "This answer is not writable through the canonical mutation platform."
                    : "This answer could not be resolved to a record safely.",
        };
    }

    // No destination is not a failure. It is the honest answer for a question the form asks for its
    // own sake, and the value stays where it was returned.
    if (!input.hasCanonicalBinding) return { classification: "form_only", staleState: null };

    /*
     * A binding we cannot READ is not the same as a binding whose value is empty. Calling an
     * unresolved record "new" would invite an operator to create something that may already exist,
     * so an unreadable owner is refused rather than guessed at.
     */
    if (input.canonicalCurrentValue === undefined) {
        return {
            classification: "refused",
            staleState: null,
            refusalReason: "The owning record could not be read, so this answer cannot be compared.",
        };
    }

    const stale = staleStateFor(input.canonicalCurrentValue, input.observedValue, input.participantValue);
    if (stale === "already_applied") return { classification: "unchanged", staleState: stale };
    if (canonicalValueIsEmpty(input.canonicalCurrentValue)) {
        return { classification: "new", staleState: stale };
    }
    return { classification: "changed", staleState: stale };
}

/**
 * Count a set of classifications the way a summary sentence reads them.
 *
 * This is what lets "confirmed most of their information and changed their address" be generated
 * later from the same model, without a Re-registration-specific one.
 */
export function summarizeReturnedValueClassifications(
    classifications: readonly ReturnedValueClassification[],
): Record<ReturnedValueClassification, number> {
    const out: Record<ReturnedValueClassification, number> = {
        unchanged: 0,
        changed: 0,
        new: 0,
        form_only: 0,
        refused: 0,
    };
    for (const c of classifications) out[c] += 1;
    return out;
}
