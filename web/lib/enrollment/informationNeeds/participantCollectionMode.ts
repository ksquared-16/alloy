/**
 * Two questions the runtime kept answering with one property.
 *
 *   Collection mode — does the PARTICIPANT supply this, and how?
 *   Dedupe scope    — can the resulting value be reused across destinations?
 *
 * They are independent, and collapsing them cost the conversation two thirds of its questions. A
 * field with no canonical binding cannot join shared-value dedupe — true, and `artifact_specific`
 * says so correctly. But the runtime then read that as "not a question", so 64 questions the school
 * actually asks — "How is your child comforted?", "Is your child able to play alone?" — were skipped
 * by the conversation and dumped into raw Form controls at the end.
 *
 * Those questions were classified deliberately: ask the family during Enrollment, create no durable
 * canonical truth. That is a statement about STORAGE. This module is the statement about ASKING.
 *
 * Pure. No I/O.
 */

import type { FormField } from "@/lib/forms/schema";
import { formFieldAsksParticipant } from "@/lib/forms/formFieldCollectsValue";

export const PARTICIPANT_COLLECTION_MODES = [
    /** A question in the conversation, answered in words or through a control. */
    "conversational",
    /** The participant attaches a document. Belongs to its artifact's own work. */
    "upload",
    /** The participant accepts a statement. Belongs beside the statement it accepts. */
    "acknowledgement",
    /** The participant signs. Recipient-scoped, artifact-specific, never shared. */
    "signature",
    /** Alloy supplies it: derived, prefilled placement, or printed prose. */
    "system",
] as const;

export type ParticipantCollectionMode = (typeof PARTICIPANT_COLLECTION_MODES)[number];

/**
 * AN UNBOUND, REQUIRED BOOLEAN IS A STATEMENT TO ACCEPT — NOT A QUESTION TO ANSWER.
 *
 * This is not a new rule. `compileParticipantArtifact` has classified exactly this shape as an
 * `acknowledgment` all along, which is how the sign step already knows to render it beside the
 * document. The rule is lifted here so both layers read ONE definition, because they disagreed:
 * the artifact compiler called the field an acknowledgment while the need projection called it a
 * question, and the parent was asked it twice.
 *
 * The three clauses each carry weight, and together they are what keeps a real question a question:
 *
 *   unbound     a bound boolean is canonical truth about the child or household
 *               ("does this child have allergies") and is genuinely asked;
 *   boolean     only a yes/no shape can be an acceptance;
 *   required    an OPTIONAL unbound boolean is a bespoke school question, which the compiler
 *               already routes to `unresolved_artifact_specific` rather than to acknowledgment.
 *
 * Measured on the certification tenant: `f_ack` — "I acknowledge the information above is accurate."
 * — is unbound, boolean and required, and sits immediately before the signature field it attests to.
 */
export function fieldIsAcknowledgement(field: FormField, opts: { readonly bound: boolean }): boolean {
    return !opts.bound && field.type === "boolean" && field.required === true;
}

/**
 * How this destination gets its value from the person completing the document.
 *
 * Deliberately derived from the FIELD, never from the need's identity — that is the whole point of
 * separating the dimensions. A signature is artifact-specific because of who signs it, not because
 * it lacks a binding; a school's bespoke question lacks a binding but is still asked out loud.
 *
 * `bound` is the one thing the field cannot answer about itself, so it is passed in. Omitting it
 * preserves the previous behaviour exactly, which keeps every existing caller honest rather than
 * silently reclassifying fields it never considered.
 */
export function participantCollectionMode(
    field: FormField,
    opts: { readonly bound?: boolean } = {},
): ParticipantCollectionMode {
    if (!formFieldAsksParticipant(field)) return "system";
    if (field.type === "signature") return "signature";
    if (field.type === "file_ref") return "upload";
    /*
     * The mode existed in this list from the start, documented as "belongs beside the statement it
     * accepts", and no code path ever returned it. That gap is the whole of Kelly's finding: an
     * attestation about "the information above" was asked in the conversation, BEFORE any document
     * existed for there to be anything above.
     */
    if (opts.bound !== undefined && fieldIsAcknowledgement(field, { bound: opts.bound })) {
        return "acknowledgement";
    }
    return "conversational";
}

/** Modes the conversation itself resolves, one turn at a time. */
export function collectionModeIsConversational(mode: ParticipantCollectionMode): boolean {
    return mode === "conversational";
}

/**
 * The session key a process-scoped answer lives under.
 *
 * NOT a `shared_value_key`, and deliberately shaped so it can never be mistaken for one: it names a
 * single destination on a single Form, so nothing in the canonical namespace can match it and no
 * other destination can claim it. That is what keeps a bespoke school question out of durable
 * child/person truth while still letting the conversation ask it once and remember the answer.
 *
 * Stable across resume because the packet pins the Form version.
 */
export function processScopedAnswerKey(formDefinitionId: string, fieldId: string): string {
    return `process:${formDefinitionId}:${fieldId}`;
}

export function isProcessScopedAnswerKey(key: string): boolean {
    return key.startsWith("process:");
}

export function parseProcessScopedAnswerKey(key: string): { formDefinitionId: string; fieldId: string } | null {
    if (!isProcessScopedAnswerKey(key)) return null;
    const rest = key.slice("process:".length);
    const at = rest.indexOf(":");
    if (at <= 0 || at === rest.length - 1) return null;
    return { formDefinitionId: rest.slice(0, at), fieldId: rest.slice(at + 1) };
}
