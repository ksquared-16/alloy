/**
 * D9.3 — the `/api/v1` document lifecycle: review, validity, version replacement, archive (writes) and reviews, history,
 * requirements (reads). Ratified contract: `certification/documents-v1/D9-WRITE-CONTRACT-PROPOSAL.md` §3.3–§3.7, Q3, Q5.
 *
 * The D9.2 rules hold for every operation here:
 *   - reach is D9.1's: a document the installation cannot read through `GET /api/v1/documents/{id}` (another org, outside
 *     the boundary, non-standard sensitivity, unavailable) answers 404 `NOT_FOUND`, identical to a random id, with nothing
 *     audited or written;
 *   - audit BEFORE effect, naming application, installation and credential, never a user (`p_actor` NULL);
 *   - an `Idempotency-Key` is required. Replays are domain-native: a review already in the requested state, a validity
 *     already equal, a filing already committed under the key, an archive already recorded under the key — each converges
 *     on the committed fact instead of acting twice;
 *   - each operation calls the staff command and nothing else: `reviewDocumentVersion` (never a re-review),
 *     `setDocumentVersionValidity`, `commitDocumentFilingAsApplication` (mode `new_version`), `document_archive`.
 * Responses carry ids, states and dates — never content, a path, a link, a reason someone else wrote or a person's name.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordDocumentAudit, type DocumentAuditInput, type DocumentAuditResult } from "@/lib/documents/documentAudit";
import { applyPage, EXTERNAL_DOCUMENT_SUBJECT_TYPES, listExternalDocuments, subjectVisibility, type ExternalDocumentSubjectType } from "@/lib/documents/external/externalDocumentAuthority";
import { externalFilingKey, stableUuid, type WriteContext, type WriteRefusal, type WriteResult } from "@/lib/documents/external/externalDocumentWrites";
import { resolveEscalatedUploadCase } from "@/lib/documents/external/unfiledApiUploadEscalation";
import { commitDocumentFilingAsApplication } from "@/lib/documents/filing/documentFiling";
import { buildDocumentHistory } from "@/lib/documents/library/documentHistory";
import { evaluateSubjects, loadLiveRequirements, loadRequirementTypes, requirementTypeClasses } from "@/lib/documents/requirements/documentRequirementService";
import { listReviewEvents, reviewDocumentVersion, setDocumentVersionValidity } from "@/lib/documents/review/documentReviewService";
import { resolveDocumentsClock } from "@/lib/documents/validity/documentsClock";
import { isIsoDate } from "@/lib/documents/validity/documentValidity";
import type { CollectionContext, CollectionRow } from "@/lib/platform/external/collectionRoute";

type Audit = (input: DocumentAuditInput) => Promise<DocumentAuditResult>;
type Source = Promise<{ data: CollectionRow[] | null; error: unknown }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refuse = (status: WriteRefusal["status"], code: string, message: string): { ok: false; error: WriteRefusal } => ({ ok: false, error: { status, code, message } });
const NOT_FOUND = () => refuse(404, "NOT_FOUND", "Not found.");
const KEY_REQUIRED = () => refuse(400, "idempotency_key_required", "An Idempotency-Key header (8–184 visible characters) is required.");
const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const boundaryOf = (ctx: WriteContext) => ({ organizationId: ctx.organizationId, installationId: ctx.installationId, boundaryMode: ctx.boundaryMode, siteIds: [...ctx.siteIds] });
const ONE = { limit: 1, cursorSort: null, cursorId: null, updatedSince: null };

/** A minimum and maximum for a reason the caller writes (the internal replacement rule is ≥ 10). */
const REASON_MIN = 10;
const REASON_MAX = 500;

/** The document as D9.1 would show it to this installation, or null (every "not yours" is the same null). */
async function visibleDocument(supabase: SupabaseClient, b: Parameters<typeof listExternalDocuments>[1], documentId: string) {
    if (!UUID.test(documentId)) return null;
    const r = await listExternalDocuments(supabase, b, { documentId }, ONE);
    if (!r.ok) return "error" as const;
    const row = r.rows.find((x) => x.id === documentId);
    return row ? { id: row.id, current_version_id: (row.current_version as { id?: string } | null)?.id ?? null, review_status: (row.review_status as string | null) ?? null } : null;
}

const principalOf = (ctx: WriteContext) => ({ kind: "application" as const, ...ctx.principal });

// ───────────────────────────────────────────────────────────────────────────── submitDocumentReview (documents.review)

export type ReviewResult = { document_id: string; version_id: string; review_status: "accepted" | "rejected"; replay: boolean };

/**
 * Body `{ document_id, version_id, decision: "accepted" | "rejected", reason? }`. The FIRST decision on the current version
 * only: reopening, or changing a recorded decision, is a re-review and needs staff authority (`processing.documents.manage`)
 * that no external scope maps to — 403 `REREVIEW_NOT_AUTHORIZED`. A rejection needs a reason.
 */
export async function submitDocumentReview(
    supabase: SupabaseClient,
    ctx: WriteContext,
    body: Record<string, unknown>,
    key: string | null,
    { audit = recordDocumentAudit }: { audit?: Audit } = {},
): Promise<WriteResult<ReviewResult>> {
    if (!key) return KEY_REQUIRED();
    const documentId = str(body.document_id) ?? "";
    const versionId = str(body.version_id) ?? "";
    const decision = body.decision;
    if (!UUID.test(documentId) || !UUID.test(versionId)) return refuse(400, "invalid_request", "document_id and version_id are required.");
    if (decision === "pending" || decision === "reopened") return refuse(403, "REREVIEW_NOT_AUTHORIZED", "Reopening a review is not available through the API.");
    if (decision !== "accepted" && decision !== "rejected") return refuse(400, "invalid_request", "decision must be accepted or rejected.");
    const reason = str(body.reason);
    if (reason && reason.length > REASON_MAX) return refuse(400, "invalid_request", `reason must be at most ${REASON_MAX} characters.`);
    if (decision === "rejected" && !reason) return refuse(400, "REASON_REQUIRED", "A rejection needs a reason.");

    const doc = await visibleDocument(supabase, boundaryOf(ctx), documentId);
    if (doc === "error") return refuse(503, "review_unavailable", "The review could not be recorded.");
    if (!doc) return NOT_FOUND();
    if (doc.current_version_id !== versionId) return refuse(409, "NOT_CURRENT_VERSION", "Only the current version can be reviewed.");
    // Converges: the version already carries this decision (a retry, or the same answer twice).
    if (doc.review_status === decision) return { ok: true, status: 200, result: { document_id: documentId, version_id: versionId, review_status: decision, replay: true } };
    if (doc.review_status === "accepted" || doc.review_status === "rejected") {
        return refuse(403, "REREVIEW_NOT_AUTHORIZED", "This version has already been reviewed; changing a review is not available through the API.");
    }

    const recorded = await audit({
        orgId: ctx.organizationId,
        actorUserId: null,
        actorPrincipal: principalOf(ctx),
        event: "document_version_reviewed",
        subject: { type: "documents", id: documentId },
        route: "api/v1/document-reviews",
        detail: { version_id: versionId, decision, rereview: false, has_reason: Boolean(reason), idempotency_key_sha256: keyHash(key) },
    });
    if (!recorded.ok) return refuse(503, "AUDIT_UNAVAILABLE", "The review could not be recorded, so it was not performed.");
    const r = await reviewDocumentVersion(supabase, { orgId: ctx.organizationId, documentId, versionId, decision, reason, actorUserId: null, rereview: false });
    if (!r.ok) {
        // A concurrent decision landed first: the database refused this one as a re-review.
        if (r.code === "REREVIEW_REQUIRED") return refuse(403, "REREVIEW_NOT_AUTHORIZED", "This version has already been reviewed; changing a review is not available through the API.");
        if (r.code === "NOT_CURRENT_VERSION") return refuse(409, "NOT_CURRENT_VERSION", "Only the current version can be reviewed.");
        if (r.code === "REASON_REQUIRED") return refuse(400, "REASON_REQUIRED", "A rejection needs a reason.");
        if (r.code === "NOT_FOUND" || r.code === "DOCUMENT_UNAVAILABLE") return NOT_FOUND();
        return refuse(503, "review_unavailable", "The review could not be recorded.");
    }
    return { ok: true, status: 201, result: { document_id: documentId, version_id: versionId, review_status: decision, replay: false } };
}

// ───────────────────────────────────────────────────────────────────────────── setDocumentValidity (documents.write)

export type ValidityResult = { document_id: string; version_id: string; effective_on: string | null; expires_on: string | null; changed: boolean };

/** Body `{ document_id, version_id, effective_on?, expires_on? }` (YYYY-MM-DD or null). The current version only. */
export async function setDocumentValidity(
    supabase: SupabaseClient,
    ctx: WriteContext,
    body: Record<string, unknown>,
    key: string | null,
    { audit = recordDocumentAudit }: { audit?: Audit } = {},
): Promise<WriteResult<ValidityResult>> {
    if (!key) return KEY_REQUIRED();
    const documentId = str(body.document_id) ?? "";
    const versionId = str(body.version_id) ?? "";
    if (!UUID.test(documentId) || !UUID.test(versionId)) return refuse(400, "invalid_request", "document_id and version_id are required.");
    if (!("effective_on" in body) && !("expires_on" in body)) return refuse(400, "invalid_request", "Provide effective_on, expires_on or both.");
    const date = (v: unknown): string | null | false => (v === undefined || v === null ? null : isIsoDate(v) ? v : false);
    const effectiveOn = date(body.effective_on);
    const expiresOn = date(body.expires_on);
    if (effectiveOn === false || expiresOn === false) return refuse(400, "BAD_DATE", "Dates must be YYYY-MM-DD.");
    if (effectiveOn && expiresOn && expiresOn < effectiveOn) return refuse(400, "VALIDITY_RANGE_INVERTED", "expires_on is before effective_on.");

    const doc = await visibleDocument(supabase, boundaryOf(ctx), documentId);
    if (doc === "error") return refuse(503, "validity_unavailable", "The dates could not be recorded.");
    if (!doc) return NOT_FOUND();
    if (doc.current_version_id !== versionId) return refuse(409, "NOT_CURRENT_VERSION", "Only the current version's dates can be set.");

    const recorded = await audit({
        orgId: ctx.organizationId,
        actorUserId: null,
        actorPrincipal: principalOf(ctx),
        event: "document_version_validity_set",
        subject: { type: "documents", id: documentId },
        route: "api/v1/document-validity",
        detail: { version_id: versionId, effective_on: effectiveOn, expires_on: expiresOn, idempotency_key_sha256: keyHash(key) },
    });
    if (!recorded.ok) return refuse(503, "AUDIT_UNAVAILABLE", "The dates could not be recorded, so they were not set.");
    // The function compares with the stored dates: the same dates again are `changed: false` and write no event.
    const r = await setDocumentVersionValidity(supabase, { orgId: ctx.organizationId, documentId, versionId, effectiveOn, expiresOn, reason: null, actorUserId: null });
    if (!r.ok) {
        if (r.code === "NOT_CURRENT_VERSION") return refuse(409, "NOT_CURRENT_VERSION", "Only the current version's dates can be set.");
        if (r.code === "VALIDITY_RANGE_INVERTED" || r.code === "BAD_DATE") return refuse(400, r.code, "The dates are not valid.");
        if (r.code === "NOT_FOUND" || r.code === "DOCUMENT_UNAVAILABLE") return NOT_FOUND();
        return refuse(503, "validity_unavailable", "The dates could not be recorded.");
    }
    return { ok: true, status: r.value.changed ? 201 : 200, result: { document_id: documentId, version_id: versionId, effective_on: r.value.effective_on, expires_on: r.value.expires_on, changed: r.value.changed } };
}

// ───────────────────────────────────────────────────────────────────────────── replaceDocumentVersion (documents.write)

export type ReplaceResult = { document_id: string; upload_document_id: string; version_id: string | null; version_number: number | null; replay: boolean };

/**
 * Body `{ document_id, upload_document_id, reason }`: the completed upload (received by THIS installation) becomes the
 * next version of a document the installation can read. One filing path: `commitDocumentFilingAsApplication` in
 * `new_version` mode, under `ext:<installation>:<Idempotency-Key>` — the type's replacement policy, the target's
 * availability and sensitivity, and the `document_file_as_version` transaction are the staff rules, unchanged. The new
 * version has no review and no malware verdict; whatever requires them holds it.
 */
export async function replaceDocumentVersion(
    supabase: SupabaseClient,
    ctx: WriteContext,
    body: Record<string, unknown>,
    key: string | null,
): Promise<WriteResult<ReplaceResult>> {
    if (!key) return KEY_REQUIRED();
    const target = str(body.document_id) ?? "";
    const upload = str(body.upload_document_id) ?? "";
    const reason = str(body.reason);
    if (!UUID.test(target) || !UUID.test(upload)) return refuse(400, "invalid_request", "document_id and upload_document_id are required.");
    if (!reason || reason.length < REASON_MIN || reason.length > REASON_MAX) return refuse(400, "REASON_REQUIRED", `reason must be ${REASON_MIN}–${REASON_MAX} characters.`);
    const r = await commitDocumentFilingAsApplication(
        supabase,
        ctx,
        { documentId: upload, mode: "new_version", docType: null, primary: null, contexts: [], targetDocumentId: target, reviewAccepted: false, reason, filingKey: externalFilingKey(ctx.installationId, key) },
        "api/v1/document-versions",
    );
    if (!r.ok) {
        const status = ([400, 404, 409, 413, 415, 422, 502, 503] as const).find((s) => s === r.status) ?? 422;
        return refuse(status, r.code, r.message);
    }
    await resolveEscalatedUploadCase(supabase, ctx.organizationId, upload).catch(() => undefined);
    return {
        ok: true,
        status: r.result.replay ? 200 : 201,
        result: { document_id: r.result.filed_document_id, upload_document_id: upload, version_id: r.result.version_id, version_number: r.result.version_number, replay: r.result.replay },
    };
}

// ───────────────────────────────────────────────────────────────────────────── archiveDocument (documents.write)

export type ArchiveResult = { document_id: string; archived: true; replay: boolean };

/** The key an archive is recorded under (on the document's own record, by `document_archive`). */
export const externalArchiveKey = (installationId: string, key: string) => `ext:${installationId}:${key}`;

/**
 * Body `{ document_id, reason }`. The only removal the API offers (Q5): the document becomes `archived` — unavailable
 * like quarantined or superseded, so it leaves every list, every requirement's evidence and every filing — and nothing is
 * deleted: bytes, versions, reviews and history stay. Reversible internally only.
 *
 * Needs `document_archive` (pending migration `20261217090000_documents_d9_3_archive.sql`, NOT applied). Until a
 * database has it the operation answers 503 `archive_unavailable` after nothing but its audit attempt — never a direct
 * status write, which would leave the database's own availability checks blind to `archived`.
 */
export async function archiveDocument(
    supabase: SupabaseClient,
    ctx: WriteContext,
    body: Record<string, unknown>,
    key: string | null,
    { audit = recordDocumentAudit }: { audit?: Audit } = {},
): Promise<WriteResult<ArchiveResult>> {
    if (!key) return KEY_REQUIRED();
    const documentId = str(body.document_id) ?? "";
    const reason = str(body.reason);
    if (!UUID.test(documentId)) return refuse(400, "invalid_request", "document_id is required.");
    if (!reason || reason.length < REASON_MIN || reason.length > REASON_MAX) return refuse(400, "REASON_REQUIRED", `reason must be ${REASON_MIN}–${REASON_MAX} characters.`);
    const archiveKey = externalArchiveKey(ctx.installationId, key);

    // A retry after the archive committed: the document is no longer listable, so answer from its own record — only when
    // THIS key archived it and its owner is still one the installation can see.
    const replay = await archiveReplay(supabase, ctx, documentId, archiveKey);
    if (replay === "error") return refuse(503, "archive_unavailable", "The document could not be archived.");
    if (replay) return { ok: true, status: 200, result: { document_id: documentId, archived: true, replay: true } };

    const doc = await visibleDocument(supabase, boundaryOf(ctx), documentId);
    if (doc === "error") return refuse(503, "archive_unavailable", "The document could not be archived.");
    if (!doc) return NOT_FOUND();

    const recorded = await audit({
        orgId: ctx.organizationId,
        actorUserId: null,
        actorPrincipal: principalOf(ctx),
        event: "document_archived",
        subject: { type: "documents", id: documentId },
        route: "api/v1/document-archives",
        detail: { idempotency_key_sha256: keyHash(key) },
    });
    if (!recorded.ok) return refuse(503, "AUDIT_UNAVAILABLE", "The archive could not be recorded, so it was not performed.");
    const { data, error } = await supabase.rpc("document_archive", {
        p_org_id: ctx.organizationId,
        p_document_id: documentId,
        p_reason: reason,
        p_archive_key: archiveKey,
        p_actor: null,
        p_audit_event_id: recorded.eventId,
    });
    if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return refuse(503, "archive_unavailable", "Archiving is not available yet.");
        if (/document_archive_not_found/.test(error.message ?? "")) return NOT_FOUND();
        if (/document_archive_unavailable/.test(error.message ?? "")) return refuse(409, "DOCUMENT_UNAVAILABLE", "This document cannot be archived.");
        return refuse(503, "archive_unavailable", "The document could not be archived.");
    }
    return { ok: true, status: (data as { replay?: boolean } | null)?.replay ? 200 : 201, result: { document_id: documentId, archived: true, replay: Boolean((data as { replay?: boolean } | null)?.replay) } };
}

async function archiveReplay(supabase: SupabaseClient, ctx: WriteContext, documentId: string, archiveKey: string): Promise<boolean | "error"> {
    if (!UUID.test(documentId)) return false;
    const { data, error } = await supabase.from("documents").select("id, status, metadata").eq("org_id", ctx.organizationId).eq("id", documentId).maybeSingle();
    if (error) return "error";
    const row = data as { status?: string | null; metadata?: Record<string, unknown> | null } | null;
    const archive = row?.metadata?.archive as { key?: unknown } | undefined;
    if (!row || row.status !== "archived" || archive?.key !== archiveKey) return false;
    const { data: owners, error: oErr } = await supabase
        .from("document_subjects")
        .select("subject_type, subject_id")
        .eq("org_id", ctx.organizationId)
        .eq("document_id", documentId)
        .eq("association", "owner")
        .eq("is_primary", true)
        .is("ended_at", null);
    if (oErr) return "error";
    const vis = subjectVisibility(supabase, boundaryOf(ctx));
    for (const o of (owners ?? []) as Array<{ subject_type: string; subject_id: string }>) {
        if ((EXTERNAL_DOCUMENT_SUBJECT_TYPES as readonly string[]).includes(o.subject_type) && (await vis.isVisible({ type: o.subject_type as ExternalDocumentSubjectType, id: o.subject_id }))) return true;
    }
    return false;
}

// ───────────────────────────────────────────────────────────────────────────── reads (documents.read)

type PageArgs = Record<string, unknown>;
const pageOf = (args: PageArgs) => ({
    limit: Number(args.p_limit) || 1,
    cursorSort: str(args.p_cursor_sort),
    cursorId: str(args.p_cursor_id),
    updatedSince: str(args.p_updated_since),
});

/**
 * `source` for GET /api/v1/documents/{id}/reviews: every review decision and validity record of a visible document, oldest
 * first. Who acted is `staff` or `application` — never a person; reasons are not published (they are staff notes).
 */
export async function externalDocumentReviewsSource(supabase: SupabaseClient, args: PageArgs, ctx: CollectionContext): Source {
    const documentId = str(args.p_document_id);
    if (!documentId) return { data: [], error: null };
    const doc = await visibleDocument(supabase, ctx, documentId);
    if (doc === "error") return { data: null, error: new Error("documents_unreadable") };
    if (!doc) return { data: [], error: null };
    const events = await listReviewEvents(supabase, ctx.organizationId, documentId);
    if (!events) return { data: null, error: new Error("reviews_unreadable") };
    const rows = events.map((e) => ({
        id: e.id,
        sort_key: e.created_at,
        document_id: documentId,
        version_id: e.version_id,
        kind: e.kind,
        decision: e.decision,
        previous_review_status: e.previous_review_status,
        effective_on: e.effective_on,
        expires_on: e.expires_on,
        actor_kind: e.actor ? "staff" : "application",
        recorded_at: e.created_at,
    }));
    return { data: applyPage(rows, pageOf(args)) as CollectionRow[], error: null };
}

/**
 * `source` for GET /api/v1/documents/{id}/history: the staff history (`buildDocumentHistory`), projected to what happened
 * and when. Committed changes and system events only — refused attempts and link issuance are operational diagnostics —
 * and never a detail line (reasons, notes), a path or a name.
 */
export async function externalDocumentHistorySource(supabase: SupabaseClient, args: PageArgs, ctx: CollectionContext): Source {
    const documentId = str(args.p_document_id);
    if (!documentId) return { data: [], error: null };
    const doc = await visibleDocument(supabase, ctx, documentId);
    if (doc === "error") return { data: null, error: new Error("documents_unreadable") };
    if (!doc) return { data: [], error: null };
    const history = await buildDocumentHistory(supabase, ctx.organizationId, documentId);
    if (!history.ok) return { data: null, error: new Error("history_unreadable") };
    const rows = history.entries
        .filter((e) => (e.kind === "committed" || e.kind === "system") && e.at)
        .map((e, i) => ({
            id: stableUuid("alloy:documents:history", documentId, e.at, e.action, String(i)),
            sort_key: e.at,
            document_id: documentId,
            kind: e.kind,
            action: e.action,
            version_number: e.version_number,
            occurred_at: e.at,
        }));
    return { data: applyPage(rows, pageOf(args)) as CollectionRow[], error: null };
}

/**
 * `source` for GET /api/v1/document-requirements: the live requirements of ONE visible child, household or parent/guardian
 * (Q8: no organization-wide query), evaluated by the staff evaluator. A requirement whose document type is not standard is
 * reported only as its key and state (mirroring `SENSITIVE_REQUIREMENT`); evidence ids are listed only for documents the
 * installation can itself read. Waivers are read-only: a waived requirement says so, nothing more.
 */
export async function externalDocumentRequirementsSource(supabase: SupabaseClient, args: PageArgs, ctx: CollectionContext): Source {
    const type = str(args.p_subject_type);
    const id = str(args.p_subject_id);
    if (!type || !id || !(EXTERNAL_DOCUMENT_SUBJECT_TYPES as readonly string[]).includes(type) || !UUID.test(id)) return { data: [], error: null };
    const subject = { type: type as ExternalDocumentSubjectType, id };
    if (!(await subjectVisibility(supabase, ctx).isVisible(subject))) return { data: [], error: null };
    const [requirements, types, clock] = await Promise.all([loadLiveRequirements(supabase, ctx.organizationId), loadRequirementTypes(supabase, ctx.organizationId), resolveDocumentsClock(supabase, ctx.organizationId)]);
    if (!requirements || !types) return { data: null, error: new Error("requirements_unreadable") };
    const system = await evaluateSubjects(supabase, ctx.organizationId, [{ subject_type: subject.type, subject_id: subject.id }], { requirements, types, today: clock.today, clock });
    if (!system) return { data: null, error: new Error("requirements_unreadable") };

    const readable = new Map<string, boolean>();
    const canRead = async (docId: string) => {
        if (!readable.has(docId)) {
            const d = await visibleDocument(supabase, ctx, docId);
            readable.set(docId, Boolean(d && d !== "error"));
        }
        return readable.get(docId) as boolean;
    };
    const asOf = `${clock.today}T00:00:00.000Z`;
    const rows: CollectionRow[] = [];
    for (const e of system.evaluations) {
        const standard = requirementTypeClasses(types, e.document_type_key).size === 0;
        if (!standard) {
            rows.push({ id: e.requirement_id, sort_key: asOf, requirement_key: e.requirement_key, state: e.state, restricted: true });
            continue;
        }
        const ids = async (list: string[]) => {
            const out: string[] = [];
            for (const d of list.slice(0, 20)) if (await canRead(d)) out.push(d);
            return out;
        };
        rows.push({
            id: e.requirement_id,
            sort_key: asOf,
            requirement_key: e.requirement_key,
            label: e.label,
            document_type_key: e.document_type_key,
            policy: e.policy,
            state: e.state,
            blocking: e.blocking,
            due_on: e.due_on,
            valid_until: e.valid_until,
            expiring_soon: e.expiring_soon,
            evidence: { accepted: await ids(e.evidence.accepted), pending: await ids(e.evidence.pending), expired: await ids(e.evidence.expired) },
            restricted: false,
        });
    }
    return { data: applyPage(rows, pageOf(args)) as CollectionRow[], error: null };
}
