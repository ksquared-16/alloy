/**
 * The identity of a unique participant information need (Slice 2.4).
 *
 * ## Semantic identity is NOT invented here
 *
 * `packetFieldPlan.ts::canonicalKeyFor` already owns it, and this module reuses that precedence
 * verbatim: an explicit `field_source.shared_value_key` alias, else `entity_type:field_key`, else
 * unbound and never merged. `lib/pos/fieldKeyBinding.ts` states the doctrine — the form-field `id`
 * "is never POS's identity for a value" — and `pdf_slot` is an OUTPUT target, never identity.
 *
 * What this module adds is the one thing a packet-wide plan does not need and an Enrollment
 * objective does: **grain**.
 *
 * ## Why the canonical key alone is not enough
 *
 * `child:dob` is the same canonical key for every child alive. Collapsing on it would ask a parent
 * for one date of birth and write it onto two children. So identity is:
 *
 * ```
 *   scope + subject identity (child scope only) + canonicalKeyFor(field)
 * ```
 *
 * Scope comes from `lib/forms/fieldScope.ts`, which is already canonical and config-driven:
 * `household` collapses across children by doctrine, `child` is per child, and `recipient`
 * (every signature, unconditionally) is artifact-specific and never collapses at all.
 *
 * **The alias cannot defeat this.** `shared_value_key` supplies the KEY; it never supplies the
 * scope or the subject, so two children carrying the same alias remain two needs. That is asserted
 * as its own proof rather than left as a reading of this comment.
 *
 * ## The subject is the journey's own subject
 *
 * A packet session is anchored to exactly one `process_instance` (D-95), and an Enrollment instance's
 * subject IS one child — `subject_type = 'child'`, `subject_id = customer_members.id`. So the child
 * grain needs no new plumbing and no new selector: Child A and Child B have different journeys,
 * therefore different sessions, therefore different needs. Nothing here infers a subject.
 *
 * Pure. No I/O.
 *
 * @see lib/pos/packet/packetFieldPlan.ts — the ask-once planner whose identity this reuses
 * @see lib/forms/fieldScope.ts — the scope doctrine
 */

import { classifyFieldScope, type FieldScope } from "@/lib/forms/fieldScope";
import type { FormField } from "@/lib/forms/schema";
import {
    collectionModeIsConversational,
    participantCollectionMode,
    processScopedAnswerKey,
    type ParticipantCollectionMode,
} from "./participantCollectionMode";

/** How the canonical key was resolved — the same three bases the packet planner reports. */
export type EnrollmentNeedDedupeBasis = "shared_alias" | "canonical" | "unbound";

export type EnrollmentNeedIdentity = {
    /** Stable string identity. Deterministic, and safe as a map key or a wire id. */
    readonly key: string;
    readonly scope: FieldScope;
    /** `customer_members.id` for child scope; null for household and recipient scope. */
    readonly subject_id: string | null;
    /** The canonical datum key: the alias, or `entity_type:field_key`. Null when unbound. */
    readonly canonical_key: string | null;
    /** The `shared_values` key this need reads and writes. Null when it cannot participate. */
    readonly shared_value_key: string | null;
    readonly entity_type: string | null;
    readonly field_key: string | null;
    readonly basis: EnrollmentNeedDedupeBasis;
    /**
     * True when this occurrence must NOT collapse into a shared datum: a signature or other
     * recipient-scoped field, an unbound field, or a field inside a collection-bound repeat group.
     */
    readonly artifact_specific: boolean;
    /**
     * Does the PARTICIPANT supply this, and how? Independent of everything above.
     *
     * `artifact_specific` answers whether a value may be REUSED. This answers whether it is ASKED.
     * A bespoke school question is `artifact_specific` — it has no canonical identity to collapse
     * on — and `conversational` all the same.
     */
    readonly collection_mode: ParticipantCollectionMode;
    /**
     * The `shared_values` key this need reads and writes, INCLUDING process-scoped answers.
     *
     * Separate from `shared_value_key` on purpose. That one asserts a canonical datum other
     * destinations may claim; this one is only "where the session keeps this answer". For a
     * process-scoped question it is a key naming one destination, which no canonical consumer can
     * match — so the answer survives a resume without ever becoming durable truth.
     */
    readonly session_value_key: string | null;
};

export type NeedIdentityInput = {
    readonly field: FormField;
    /** The Form definition this occurrence belongs to — names a process-scoped answer's home. */
    readonly formDefinitionId?: string;
    /** The Enrollment journey's subject — `process_instances.subject_id`. */
    readonly subjectId: string | null;
    /** From `fieldIsInsideCollectionBoundGroup`: repeats never join shared_values dedupe. */
    readonly insideCollectionBoundGroup: boolean;
    /** Provenance, used only to keep artifact-specific occurrences distinct. */
    readonly formDefinitionVersionId: string;
    readonly sessionItemId: string;
};

/** Reuses `packetFieldPlan.ts::canonicalKeyFor` precedence exactly. Kept private and mirrored. */
function canonicalKeyParts(field: FormField): {
    canonical_key: string | null;
    shared_value_key: string | null;
    entity_type: string | null;
    field_key: string | null;
    basis: EnrollmentNeedDedupeBasis;
} {
    const source = field.field_source;
    const alias = source?.shared_value_key?.trim();
    const entity_type = source?.entity_type?.trim() || null;
    const field_key = source?.field_key?.trim() || null;

    if (alias) {
        return {
            canonical_key: alias,
            shared_value_key: alias,
            entity_type,
            field_key,
            basis: "shared_alias",
        };
    }
    if (entity_type && field_key) {
        const key = `${entity_type}:${field_key}`;
        return {
            canonical_key: key,
            shared_value_key: key,
            entity_type,
            field_key,
            basis: "canonical",
        };
    }
    return {
        canonical_key: null,
        shared_value_key: null,
        entity_type,
        field_key,
        basis: "unbound",
    };
}

/**
 * The identity of the need this field occurrence belongs to.
 *
 * Three conditions make an occurrence artifact-specific, and each is a repository rule rather than a
 * judgement call:
 *
 *  - `recipient` scope — `classifyFieldScope` returns it for EVERY signature unconditionally, and
 *    for attestation/consent-shaped fields by entity. A signature is a statement by one person on
 *    one document; reusing it elsewhere would forge it.
 *  - inside a collection-bound repeat — "Repeatable collection values do not participate in packet
 *    shared_values dedupe" (`formsCollectionPrefill.ts`). Their identity is the collection item, not
 *    the field.
 *  - unbound — no semantic identity exists, so there is nothing to collapse ON. Merging by label
 *    would be exactly the similarity matching this slice forbids.
 */
export function resolveEnrollmentNeedIdentity(input: NeedIdentityInput): EnrollmentNeedIdentity {
    const { field } = input;
    const scope = classifyFieldScope(field);
    const parts = canonicalKeyParts(field);

    const artifact_specific =
        scope === "recipient" || input.insideCollectionBoundGroup || parts.basis === "unbound";
    const collection_mode = participantCollectionMode(field);

    /*
     * A question with no canonical identity is still a question.
     *
     * It cannot join shared-value dedupe — nothing to collapse on — so it keeps a per-occurrence key
     * and `shared_value_key` stays null. What changes is that the conversation can now reach it: the
     * session remembers the answer under a key naming this one destination, which is not a claim of
     * canonical authority and cannot be matched by any canonical consumer.
     *
     * Signatures and collection repeats are excluded deliberately. A signature belongs to the
     * artifact it signs, and a repeat's identity is its collection item.
     */
    const processScoped =
        artifact_specific &&
        parts.basis === "unbound" &&
        scope !== "recipient" &&
        !input.insideCollectionBoundGroup &&
        collectionModeIsConversational(collection_mode);

    if (artifact_specific) {
        // Keyed by the exact occurrence, so two artifact-specific fields can never share a need —
        // not even two signatures on the same form.
        return {
            key: `artifact:${input.sessionItemId}:${input.formDefinitionVersionId}:${field.id}`,
            scope,
            subject_id: scope === "child" ? input.subjectId : null,
            canonical_key: parts.canonical_key,
            // Deliberately null: an artifact-specific occurrence must not read or write the shared
            // namespace, even when the field happens to carry a binding.
            shared_value_key: null,
            entity_type: parts.entity_type,
            field_key: parts.field_key,
            basis: parts.basis,
            artifact_specific: true,
            collection_mode,
            session_value_key:
                processScoped && input.formDefinitionId
                    ? processScopedAnswerKey(input.formDefinitionId, field.id)
                    : null,
        };
    }

    // Household collapses across children BY DOCTRINE; child grain carries the subject. The alias
    // supplies only the key — never the scope, never the subject — so equal aliases on distinct
    // children stay distinct.
    const subject_id = scope === "child" ? input.subjectId : null;
    return {
        key: `${scope}:${subject_id ?? "-"}:${parts.canonical_key}`,
        scope,
        subject_id,
        canonical_key: parts.canonical_key,
        shared_value_key: parts.shared_value_key,
        entity_type: parts.entity_type,
        field_key: parts.field_key,
        basis: parts.basis,
        artifact_specific: false,
        collection_mode,
        /*
         * Where the session keeps the PARTICIPANT's answer — so there is none when the participant
         * never answers. A placement-only destination carries a real canonical binding and is filled
         * from it for rendering; that is the fill path's business, and giving it a session key here
         * would make it a question the moment its value happened to be absent.
         */
        session_value_key: collection_mode === "system" ? null : parts.shared_value_key,
    };
}
