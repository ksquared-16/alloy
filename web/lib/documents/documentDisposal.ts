/**
 * Disposing of the documents of a subject that is being deleted: the one Documents-owned path.
 *
 * WHY THIS EXISTS. Deleting a lead (`executeOpportunityLeadDeletionGraph`) removed `documents`,
 * `document_versions` and `document_field_values` ROWS through a generic `deleteByIn`. It never removed the
 * stored files, it wrote no document audit, and it checked no other reference. Every lead deletion with an
 * attachment therefore left an object in `org_documents` that nothing could reach or account for. That is how
 * 28 of the 34 orphaned objects found in D1b.5 came to exist.
 *
 * WHAT IT DOES, per candidate document of the deleted subject(s):
 *   * RETAIN, untouched (row and file), when anything else still relies on it:
 *       - another subject (`entity_id` outside the subjects being deleted);
 *       - Forms (a remaining submission link or drawn signature);
 *       - Processing (a case source);
 *       - staff-qualification, safeguarding, medical-consent or subsidy evidence;
 *       - a vendor's document pointer, or a remaining person's profile-photo pointer;
 *       - a retention or legal hold: D2's `documents.legal_hold` / `documents.retention_until`, and the interim
 *         `metadata.legal_hold === true` / future `metadata.retention_until` markers they were backfilled from;
 *       - a stored path outside the organization prefix. This path never deletes another tenant's object.
 *   * DELETE, through the same contract as the audited POS delete:
 *       1. record `document_delete_authorized` first (no record, no deletion);
 *       2. remove the stored objects: the document's own and every version's;
 *       3. delete field values, versions, then the row.
 *
 * FAILURE AND RETRY. Every step is idempotent, and a failure stops the disposal before the row goes:
 *   * a reference read that fails refuses everything (fail closed: nothing is deleted on an unanswered question);
 *   * an audit that cannot be written refuses that document;
 *   * a storage error (other than "already absent") keeps the row, so a retry finds the document and tries again;
 *   * an object already gone counts as removed, so a retry after a partial failure completes;
 *   * a document already deleted by an earlier attempt is reported `absent`.
 * The caller runs this BEFORE deleting the subject row itself. A thrown `DocumentDisposalError` therefore
 * leaves the subject in place, and the whole deletion can simply be retried.
 *
 * Organization-scoped throughout. A document of another organization is never read, retained or deleted:
 * it is invisible to every query here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordDocumentAudit } from "@/lib/documents/documentAudit";
import { isStoragePathWithinOrg } from "@/lib/documents/storagePathAuthority";

export type DocumentRetentionReason =
    | "other_subject"
    | "form_submission"
    | "form_signature"
    | "processing_case_source"
    | "staff_qualification_evidence"
    | "safeguarding_evidence"
    | "medical_consent_evidence"
    | "subsidy_source"
    | "vendor_document"
    | "profile_photo"
    | "legal_hold"
    | "retention_period"
    | "storage_outside_org";

export type DocumentDisposition =
    | { documentId: string; outcome: "deleted"; objectsRemoved: number; objectsAlreadyAbsent: number }
    | { documentId: string; outcome: "retained"; reasons: DocumentRetentionReason[] }
    | { documentId: string; outcome: "absent" };

export type DocumentDisposalCode = "reference_lookup_failed" | "audit_unavailable" | "storage_removal_failed" | "row_delete_failed";

export class DocumentDisposalError extends Error {
    constructor(
        readonly code: DocumentDisposalCode,
        readonly documentId: string | null,
        message: string,
    ) {
        super(message);
        this.name = "DocumentDisposalError";
    }
}

export type DisposeDocumentsInput = {
    orgId: string;
    actorUserId: string;
    /** Candidate documents: owned by, or linked through, the subjects being deleted. */
    documentIds: readonly string[];
    /** Every subject id being deleted in this operation (opportunity, persons, customer, customer members). */
    deletedSubjectIds: readonly string[];
    /** Where the deletion came from, for the audit (e.g. `admin/opportunities/delete`). */
    route: string;
    now?: Date;
};

type DocRow = {
    id: string;
    bucket: string | null;
    storage_path: string | null;
    entity_type: string | null;
    entity_id: string | null;
    doc_type: string | null;
    metadata: Record<string, unknown> | null;
    /** D2 hold columns. The interim metadata markers are still honoured. */
    legal_hold?: boolean | null;
    retention_until?: string | null;
};

const CHUNK = 100;
const chunks = <T,>(xs: readonly T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, i * CHUNK + CHUNK));

/** Values of `column` in `table` that are one of `ids`, in this org. Throws on any read error (fail closed). */
async function idsReferencedBy(
    supabase: SupabaseClient,
    orgId: string,
    table: string,
    column: string,
    ids: readonly string[],
    eq?: readonly [string, string],
): Promise<Set<string>> {
    const out = new Set<string>();
    for (const part of chunks(ids)) {
        let q = supabase.from(table).select(column).eq("org_id", orgId).in(column, part as string[]);
        if (eq) q = q.eq(eq[0], eq[1]);
        const { data, error } = await q;
        if (error) throw new DocumentDisposalError("reference_lookup_failed", null, `${table}.${column}: ${error.message}`);
        for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
            const v = row[column];
            if (typeof v === "string" && v) out.add(v);
        }
    }
    return out;
}

/** Documents a REMAINING person points at as their profile photo. Persons deleted in this operation do not count. */
async function profilePhotoPointers(
    supabase: SupabaseClient,
    orgId: string,
    ids: readonly string[],
    deletedSubjects: ReadonlySet<string>,
): Promise<Set<string>> {
    const out = new Set<string>();
    for (const part of chunks(ids)) {
        const { data, error } = await supabase
            .from("persons")
            .select("id, metadata")
            .eq("org_id", orgId)
            .in("metadata->>profile_photo_document_id", part as string[]);
        if (error) throw new DocumentDisposalError("reference_lookup_failed", null, `persons.profile_photo: ${error.message}`);
        for (const row of (data ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
            const v = row.metadata?.profile_photo_document_id;
            if (typeof v === "string" && v && !deletedSubjects.has(row.id)) out.add(v);
        }
    }
    return out;
}

function holdReasons(row: DocRow, now: Date): DocumentRetentionReason[] {
    const meta = row.metadata ?? {};
    const reasons: DocumentRetentionReason[] = [];
    if (row.legal_hold === true || meta.legal_hold === true) reasons.push("legal_hold");
    for (const value of [row.retention_until, meta.retention_until]) {
        const until = typeof value === "string" ? Date.parse(value) : NaN;
        if (Number.isFinite(until) && until > now.getTime()) {
            reasons.push("retention_period");
            break;
        }
    }
    return reasons;
}

export async function disposeDocumentsOfDeletedSubjects(
    supabase: SupabaseClient,
    input: DisposeDocumentsInput,
): Promise<DocumentDisposition[]> {
    const { orgId, actorUserId, route } = input;
    const now = input.now ?? new Date();
    const candidates = [...new Set(input.documentIds.filter(Boolean))];
    if (candidates.length === 0) return [];
    const deletedSubjects = new Set(input.deletedSubjectIds.filter(Boolean));

    // Rows of THIS organization only. A candidate id of another tenant is simply not here.
    const rows: DocRow[] = [];
    for (const part of chunks(candidates)) {
        const { data, error } = await supabase
            .from("documents")
            .select("id, bucket, storage_path, entity_type, entity_id, doc_type, metadata, legal_hold, retention_until")
            .eq("org_id", orgId)
            .in("id", part as string[]);
        if (error) throw new DocumentDisposalError("reference_lookup_failed", null, `documents: ${error.message}`);
        rows.push(...((data ?? []) as DocRow[]));
    }
    const present = new Set(rows.map((r) => r.id));
    const ids = [...present];

    // Every consumer that may still rely on a document. Any read failure refuses the whole disposal.
    const referenced: Array<[DocumentRetentionReason, Set<string>]> = ids.length
        ? [
              ["form_submission", await idsReferencedBy(supabase, orgId, "form_submission_documents", "document_id", ids)],
              ["form_signature", await idsReferencedBy(supabase, orgId, "form_submission_signatures", "drawn_asset_document_id", ids)],
              [
                  "processing_case_source",
                  await idsReferencedBy(supabase, orgId, "processing_case_sources", "source_id", ids, ["source_kind", "document"]),
              ],
              ["staff_qualification_evidence", await idsReferencedBy(supabase, orgId, "staff_qualification_evidence", "document_id", ids)],
              ["safeguarding_evidence", await idsReferencedBy(supabase, orgId, "child_safeguarding_restrictions", "evidence_document_id", ids)],
              ["medical_consent_evidence", await idsReferencedBy(supabase, orgId, "person_medical_consents", "evidence_document_id", ids)],
              [
                  "subsidy_source",
                  new Set([
                      ...(await idsReferencedBy(supabase, orgId, "financial_subsidy_authorizations", "source_document_id", ids)),
                      ...(await idsReferencedBy(supabase, orgId, "financial_subsidy_remittances", "source_document_id", ids)),
                  ]),
              ],
              [
                  "vendor_document",
                  new Set([
                      ...(await idsReferencedBy(supabase, orgId, "vendors", "insurance_doc_file_id", ids)),
                      ...(await idsReferencedBy(supabase, orgId, "vendors", "drivers_license_doc_file_id", ids)),
                  ]),
              ],
              ["profile_photo", await profilePhotoPointers(supabase, orgId, ids, deletedSubjects)],
          ]
        : [];

    const out: DocumentDisposition[] = candidates.filter((id) => !present.has(id)).map((documentId) => ({ documentId, outcome: "absent" as const }));

    for (const row of rows) {
        const reasons: DocumentRetentionReason[] = [];
        if (row.entity_id && !deletedSubjects.has(row.entity_id)) reasons.push("other_subject");
        for (const [reason, set] of referenced) if (set.has(row.id)) reasons.push(reason);
        reasons.push(...holdReasons(row, now));

        // Versions carry their own stored files. A version outside the org prefix retains the whole document.
        const { data: versions, error: vErr } = await supabase
            .from("document_versions")
            .select("storage_path")
            .eq("org_id", orgId)
            .eq("document_id", row.id);
        if (vErr) throw new DocumentDisposalError("reference_lookup_failed", row.id, `document_versions: ${vErr.message}`);
        const paths = [row.storage_path, ...((versions ?? []) as Array<{ storage_path: string | null }>).map((v) => v.storage_path)]
            .filter((p): p is string => typeof p === "string" && p.length > 0);
        if (paths.some((p) => !isStoragePathWithinOrg(p, orgId))) reasons.push("storage_outside_org");

        if (reasons.length > 0) {
            out.push({ documentId: row.id, outcome: "retained", reasons: [...new Set(reasons)] });
            continue;
        }

        // 1. Recorded before anything is removed.
        const audit = await recordDocumentAudit({
            orgId,
            actorUserId,
            event: "document_delete_authorized",
            subject: { type: "documents", id: row.id },
            route,
            detail: {
                reason: "subject_deleted",
                document_entity_type: row.entity_type,
                document_entity_id: row.entity_id,
                doc_type: row.doc_type,
                stored_objects: paths.length,
            },
        });
        if (!audit.ok) throw new DocumentDisposalError("audit_unavailable", row.id, "the deletion could not be recorded, so it was not performed");

        // 2. The stored objects. "Already absent" is success; any storage error keeps the row for a retry.
        let removed = 0;
        let absent = 0;
        const bucket = row.bucket || "org_documents";
        const uniquePaths = [...new Set(paths)];
        if (uniquePaths.length > 0) {
            const { data: rm, error: rmErr } = await supabase.storage.from(bucket).remove(uniquePaths);
            if (rmErr) {
                await recordDocumentAudit({
                    orgId,
                    actorUserId,
                    event: "document_delete_failed",
                    subject: { type: "documents", id: row.id },
                    route,
                    detail: { stage: "storage", error: rmErr.message },
                });
                throw new DocumentDisposalError("storage_removal_failed", row.id, `storage: ${rmErr.message}`);
            }
            removed = Array.isArray(rm) ? rm.length : 0;
            absent = Math.max(0, uniquePaths.length - removed);
        }

        // 3. The rows, children first. Each delete is a no-op on retry. The versions and subject associations go with the
        //    document row (ON DELETE CASCADE): D2 refuses to delete a version while its document remains.
        for (const [table, column] of [
            ["document_field_values", "document_id"],
            ["documents", "id"],
        ] as const) {
            const { error } = await supabase.from(table).delete().eq("org_id", orgId).eq(column, row.id);
            if (error) {
                await recordDocumentAudit({
                    orgId,
                    actorUserId,
                    event: "document_delete_failed",
                    subject: { type: "documents", id: row.id },
                    route,
                    detail: { stage: table, error: error.message },
                });
                throw new DocumentDisposalError("row_delete_failed", row.id, `${table}: ${error.message}`);
            }
        }
        out.push({ documentId: row.id, outcome: "deleted", objectsRemoved: removed, objectsAlreadyAbsent: absent });
    }
    return out;
}
