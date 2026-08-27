/**
 * The documents this artifact asks the PARTICIPANT to attach.
 *
 * ## What an upload is, and is not
 *
 * An upload is participant WORK and its result is EVIDENCE. It is not a value box: attaching an
 * immunization record does not tell Alloy that a child received a polio dose, and nothing here
 * manufactures one. Structured dose truth is Health's to own, and the vaccine grid on the Oregon
 * CIS stays truthfully blank until Health supplies it. What the parent supplies is the document
 * their school is legally required to hold.
 *
 * ## Why the destination decides everything
 *
 * The upload route takes a field id from the caller and NOTHING else about what the file is. What
 * kind of document belongs there, and what it is called, come from the session's own pinned schema
 * — so a participant cannot name a `doc_type`, cannot attach to another entity, and cannot invent
 * an obligation. This module is that derivation, kept pure so the route and the surface agree.
 *
 * Pure. No I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

export type ParticipantUploadRequest = {
    readonly field_id: string;
    /** The school's own words for what to attach. */
    readonly title: string;
    /** The authored explanation, when the document carries one. */
    readonly description: string | null;
    readonly required: boolean;
    /** The canonical document classification this attachment is filed under. */
    readonly docType: string;
};

/**
 * Where an unclassified attachment is filed.
 *
 * The Exemption's "I have attached the required document from (check one)" carries no
 * `document_type`, and guessing one would file a vaccine-module certificate as an immunization
 * record — a different fact. `enrollment_document` says what is true: a document this enrollment
 * asked for.
 */
const UNCLASSIFIED_DOC_TYPE = "enrollment_document";

function walk(fields: readonly FormField[], out: FormField[]): FormField[] {
    for (const f of fields) {
        if (f.type === "group") walk((f as { fields: FormField[] }).fields, out);
        else out.push(f);
    }
    return out;
}

function requestFor(field: FormField): ParticipantUploadRequest | null {
    if (field.type !== "file_ref") return null;
    const authoredTitle = (field.label ?? "").trim();
    const description = ((field as { description?: string }).description ?? "").trim();
    /*
     * A clause that became both the title and the explanation is ONE sentence, not two.
     *
     * The Exemption's "I have attached the required document from (check one):" is carried in both
     * places by the importer, and printing it twice reads as a stutter rather than as help.
     */
    const explains = description && description !== authoredTitle ? description : "";
    return {
        field_id: field.id,
        title: authoredTitle || "Document",
        description: explains || null,
        required: field.required === true,
        docType: ((field as { document_type?: string }).document_type ?? "").trim() || UNCLASSIFIED_DOC_TYPE,
    };
}

/** Every attachment this artifact asks for, in document order. */
export function participantUploadRequests(schema: Pick<FormSchemaV1, "fields">): ParticipantUploadRequest[] {
    const out: ParticipantUploadRequest[] = [];
    for (const field of walk(schema.fields, [])) {
        const request = requestFor(field);
        if (request) out.push(request);
    }
    return out;
}

/** The destination one field id names, or null when it is not an upload on THIS artifact. */
export function uploadDestinationForField(
    schema: Pick<FormSchemaV1, "fields">,
    fieldId: string,
): ParticipantUploadRequest | null {
    return participantUploadRequests(schema).find((r) => r.field_id === fieldId) ?? null;
}

/**
 * Is this attachment on file?
 *
 * Only a DOCUMENT ID counts, which is the same thing `validateSubmission` requires of a `file_ref`.
 * A looser "some text is present" test read the conversation's `Not applicable` as a satisfied
 * obligation, and the Exemption's two attachments showed as already attached before the parent had
 * been asked for anything.
 */
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uploadIsOnFile(held: unknown): boolean {
    return typeof held === "string" && DOCUMENT_ID.test(held.trim());
}

/** The attachments still owed — a `file_ref` holds a document id once it is satisfied. */
export function outstandingUploadRequests(
    schema: Pick<FormSchemaV1, "fields">,
    values: Readonly<Record<string, unknown>>,
): ParticipantUploadRequest[] {
    return participantUploadRequests(schema).filter((r) => !uploadIsOnFile(values[r.field_id]));
}
