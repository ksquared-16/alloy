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
    // D3: a Studio configuration change (category or type), recorded before the change.
    | "document_category_changed"
    | "document_type_changed"
    // D4: an operator upload, recorded before the file is stored.
    | "document_upload_authorized"
    // D5: filing a received document to a customer record. `document_filing_authorized` is recorded BEFORE the filing
    // transaction; `document_filed` after it committed (the committed fact itself is `documents.metadata.filing`).
    | "document_filing_authorized"
    | "document_filed"
    // D6: a requirement configuration change, recorded before the change; a waiver grant or revocation, recorded before
    // the database decides on it (an attempt the database refuses is recorded too).
    | "document_requirement_changed"
    | "document_requirement_waiver_granted"
    | "document_requirement_waiver_revoked"
    // D6: the review of a document's current version (accepted / rejected), recorded before it is written.
    | "document_version_reviewed"
    // D7: validity dates (effective / expiration) recorded on a document's current version, before they are written.
    | "document_version_validity_set"
    | "person_profile_photo_set"
    | "person_profile_photo_cleared"
    // D1c-2: a malware verdict recorded by the scan process, or a human revocation of one — recorded BEFORE the store
    // writes it. The payload names ids, verdict and engine labels only: never a URL, a path or content.
    | "document_malware_verdict_recorded"
    | "document_malware_verdict_revoked"
    // D9.2: an `/api/v1` upload its installation never filed, handed to Processing after the grace period (recorded
    // BEFORE the case opens), and that case closed because the document was filed after all (recorded BEFORE it closes).
    | "document_unfiled_upload_escalated"
    | "document_unfiled_upload_case_resolved"
    // D9.3: a document archived (the only external removal; nothing is deleted), recorded BEFORE `document_archive`; and
    // its staff restore, recorded BEFORE `document_unarchive`.
    | "document_archived"
    | "document_restored";

/**
 * The closed vocabulary of automated writers. A new one is added here, deliberately. Naming a process grants nothing
 * and proves nothing: it is a label. For example, `record_document_malware_verdict` writes `malware_scan_worker` itself,
 * but the database enforces only that a service_role caller recorded the verdict, not which process it was. An enforced
 * scanner identity is a separate, unbuilt boundary (the verdict-store review response, O2).
 */
export const DOCUMENT_SYSTEM_PROCESSES = ["inbound_email_attachment", "malware_scan_worker", "api_upload_escalation"] as const;
export type DocumentSystemProcess = (typeof DOCUMENT_SYSTEM_PROCESSES)[number];

export type DocumentAuditInput = {
    orgId: string;
    /** The signed-in user. Null only for an application principal (`/api/v1`), which must then be named below. */
    actorUserId: string | null;
    /**
     * D9: the external application that acted — installation and credential, never a user.
     * D10: a named server process acting on received content (an inbound email attachment), never a user. The process
     * vocabulary is closed: a new automated writer is named here, deliberately.
     */
    actorPrincipal?:
        | { kind: "application"; applicationId: string; installationId: string; credentialId: string }
        | { kind: "system"; process: DocumentSystemProcess };
    event: DocumentAuditEvent;
    /** `documents` for an event about one document, `persons` for the photo pointer, the configuration table for D3/D6. */
    subject: {
        type: "documents" | "persons" | "document_categories" | "document_types" | "document_requirements" | "document_requirement_waivers";
        id: string;
    };
    /** Where the action came from, e.g. `admin/documents/signed-url`. */
    route: string;
    detail?: Record<string, unknown>;
};

export type DocumentAuditResult = { ok: true; eventId: string } | { ok: false; error: string };

export async function recordDocumentAudit(input: DocumentAuditInput): Promise<DocumentAuditResult> {
    // An action is always attributable: a user, or a named application principal — never neither.
    if (!input.actorUserId && !input.actorPrincipal) return { ok: false, error: "actor_required" };
    if (input.actorPrincipal?.kind === "system" && !(DOCUMENT_SYSTEM_PROCESSES as readonly string[]).includes(input.actorPrincipal.process)) return { ok: false, error: "actor_required" };
    try {
        const eventId = await emitEvent({
            org_id: input.orgId,
            event_type: input.event,
            entity_type: input.subject.type,
            entity_id: input.subject.id,
            payload: {
                ...(input.detail ?? {}),
                actor_user_id: input.actorUserId,
                ...(input.actorPrincipal?.kind === "application"
                    ? {
                          actor_kind: "application",
                          actor_application_id: input.actorPrincipal.applicationId,
                          actor_installation_id: input.actorPrincipal.installationId,
                          actor_credential_id: input.actorPrincipal.credentialId,
                      }
                    : input.actorPrincipal?.kind === "system"
                      ? { actor_kind: "system", actor_process: input.actorPrincipal.process }
                      : {}),
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

/**
 * W-C1: the actor facts an effect's database function checks against the audit row it binds (`p_audit_payload`). Built
 * from the same input `recordDocumentAudit` writes, so the two cannot drift. Matching application + installation is the
 * D9 attribution; the credential stays recorded in the audit but is not required to match. A system process is matched
 * by name, a staff user by id.
 */
export function auditActorFacts(input: Pick<DocumentAuditInput, "actorUserId" | "actorPrincipal">): Record<string, string> {
    const p = input.actorPrincipal;
    if (p?.kind === "application") return { actor_kind: "application", actor_application_id: p.applicationId, actor_installation_id: p.installationId };
    if (p?.kind === "system") return { actor_kind: "system", actor_process: p.process };
    return input.actorUserId ? { actor_user_id: input.actorUserId } : {};
}

/** W-C1: the audit row an effect binds, and the actor it must have been written for. */
export type AuditBinding = { eventId: string; actor: Record<string, string> };

/** W-C1: the audit parameters, only when the caller bound an audit row (staff callers may not). */
export function withAudit<T extends Record<string, unknown>>(args: T, audit: AuditBinding | undefined): T & { p_audit_event_id?: string; p_audit_payload?: Record<string, string> } {
    return audit ? { ...args, p_audit_event_id: audit.eventId, p_audit_payload: audit.actor } : args;
}

/**
 * W-C1 deploy order: the app ships before migration 20261222090000 is applied. Until then PostgREST does not know the
 * audit parameters and answers PGRST202 without running anything; the caller then retries once without them, which is
 * exactly the behaviour before W-C1. Any other error is a real refusal.
 */
export function isRpcSignatureMissing(error: { code?: string } | null | undefined): boolean {
    return error?.code === "PGRST202";
}

/** The refusal a route returns when its audit record could not be written. */
export const DOCUMENT_AUDIT_UNAVAILABLE = {
    body: { ok: false, error: "This action could not be recorded, so it was not performed.", code: "AUDIT_UNAVAILABLE" },
    status: 503,
} as const;
