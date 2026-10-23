import { emitEvent } from "@/lib/emitEvent";

/**
 * DURABLE AUDIT FOR DOCUMENT ACCESS AND DOCUMENT MUTATION.
 *
 * Before D1a, issuing a signed link, hard-deleting a Processing source document and setting or
 * clearing a profile photo left no record at all — and the one document audit that did exist
 * (`logAdminAudit`) writes only to the console.
 *
 * WHERE IT LIVES. `workflow_events`, through the canonical `emitEvent` — the same durable,
 * org-scoped, forced-RLS store `document_uploaded` already uses. `app_security_audit` was the other
 * candidate and is the wrong one: its event vocabulary is a CHECK constraint owned by the Developer
 * Platform, so recording a document event there needs a schema migration (out of D1a), and it would
 * mix tenant document access into partner-credential history. Events are written with
 * `entity_type = "documents"` (or `"persons"` for the photo pointer), never `"opportunities"`, so
 * they cannot surface in an activity timeline.
 *
 * RELIABLE MEANS THE ACTION WAITS FOR ITS RECORD. Callers write the event BEFORE they hand out the
 * link or perform the mutation, and refuse when it cannot be written: an unrecorded link is not
 * issued, an unrecorded deletion does not happen. The payload never carries the signed URL or the
 * storage path — the audit is read by more people than may open the file.
 */
export type DocumentAuditEvent =
    | "document_link_issued"
    | "document_delete_authorized"
    | "document_delete_failed"
    | "document_quarantined"
    | "document_released"
    // D2: a replacement version, an association change, a raised sensitivity class. Each is recorded BEFORE the change.
    | "document_version_added"
    | "document_subject_changed"
    | "document_sensitivity_raised"
    | "person_profile_photo_set"
    | "person_profile_photo_cleared";

export type DocumentAuditInput = {
    orgId: string;
    actorUserId: string;
    event: DocumentAuditEvent;
    /** `documents` for an event about one document, `persons` for the photo pointer. */
    subject: { type: "documents" | "persons"; id: string };
    /** Where the action came from, e.g. `admin/documents/signed-url`. */
    route: string;
    detail?: Record<string, unknown>;
};

export type DocumentAuditResult = { ok: true; eventId: string } | { ok: false; error: string };

export async function recordDocumentAudit(input: DocumentAuditInput): Promise<DocumentAuditResult> {
    try {
        const eventId = await emitEvent({
            org_id: input.orgId,
            event_type: input.event,
            entity_type: input.subject.type,
            entity_id: input.subject.id,
            payload: {
                ...(input.detail ?? {}),
                actor_user_id: input.actorUserId,
                route: input.route,
                audit: "documents_v1_d1a",
            },
        });
        return { ok: true, eventId };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error("[DOCUMENT_AUDIT_WRITE_FAILED]", { event: input.event, subject: input.subject.type, route: input.route });
        return { ok: false, error };
    }
}

/** The refusal a route returns when its audit record could not be written. */
export const DOCUMENT_AUDIT_UNAVAILABLE = {
    body: { ok: false, error: "This action could not be recorded, so it was not performed.", code: "AUDIT_UNAVAILABLE" },
    status: 503,
} as const;
