/**
 * D5 — the canonical document FILING command, owned by Documents.
 *
 * Filing makes a received document part of a customer record: it gets a published Studio type, a primary owner, any
 * context associations, its review (when the type needs one) and a durable filing record — or, when the type keeps one
 * document per subject (`new_version`), its bytes become the next version of the record's existing document. Processing
 * is the caller (the Documents queue's approval); it never writes a document association itself.
 *
 * Order, every time (preview runs the same checks without the effect):
 *  1. `documents.write`, and the full access decision on the received document (org, admission, scope, sensitivity,
 *     availability — a quarantined file is refused here, and again by the database).
 *  2. Every destination subject inside the actor's scope (404 otherwise: no oracle for records they cannot see), and
 *     related to the primary owner (same household).
 *  3. The published type's policy: subject type, format, review, replacement (`documentTypeEnforcement.ts`).
 *  4. Clearance for the class the document WILL have (raise-only: type default, medical floor, explicit request). An
 *     operator never files a document they could not open afterwards.
 *  5. `document_filing_authorized` recorded BEFORE the effect; 503 when it cannot be.
 *  6. ONE transaction (`public.document_file` / `public.document_file_as_version`). Idempotent on the filing key: a
 *     retry after success replays; a different filing of a filed document is refused.
 *  7. `document_filed` recorded after the commit (best-effort; the committed fact is `documents.metadata.filing`).
 *
 * Transaction semantics. Everything durable is one Postgres transaction, except the object copy a new-version filing
 * needs (the version store holds one object per version). That copy happens first, at a deterministic path; if the
 * transaction then fails, the copy is removed — unless a version already references it (the commit landed and only its
 * answer was lost), which the next retry replays.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    assertDocumentAccess,
    DOCUMENT_WRITE_PERMISSION,
    documentAccessHttp,
    documentSubjectInActorScope,
    type DocumentActor,
} from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { QUARANTINED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";
import {
    actorMayReadSensitivity,
    classForDeclaredSensitivity,
    MEDICAL_DOCUMENT_TYPES,
    type DeclaredDocumentSensitivity,
    type DocumentSensitivityClass,
} from "@/lib/documents/documentSensitivity";
import { isDocumentOwnerSubjectType, legacyEntityTypeForSubject, type DocumentSubjectType } from "@/lib/documents/documentSubjects";
import { raiseSensitivity } from "@/lib/documents/configuration/documentTypePolicy";
import {
    documentFormatForMime,
    documentTypePolicyProblems,
    resolveDocumentTypePolicy,
    type PublishedDocumentTypePolicy,
} from "@/lib/documents/configuration/documentTypeEnforcement";
import { householdForAnchor } from "@/lib/documents/library/documentLibrary";

export type FilingSubjectRef = { subject_type: DocumentSubjectType; subject_id: string };

export type DocumentFilingRequest = {
    documentId: string;
    /** `new_document`: file the received document itself. `new_version`: its bytes become the next version of `targetDocumentId`. */
    mode: "new_document" | "new_version";
    docType: string | null;
    primary: FilingSubjectRef | null;
    contexts: FilingSubjectRef[];
    targetDocumentId?: string | null;
    reviewAccepted: boolean;
    /** Raise the class above the type default. Never lowers. */
    sensitivity?: DeclaredDocumentSensitivity | null;
    reason?: string | null;
    filingKey: string;
    processingCaseId?: string | null;
};

export type FilingProblem = { code: string; message: string };

export type DocumentFilingPreview = {
    document: {
        id: string;
        title: string | null;
        mime_type: string | null;
        format: string | null;
        byte_size: number | null;
        received_at: string | null;
        status: string | null;
        doc_type: string | null;
        sensitivity: DeclaredDocumentSensitivity | null;
        filed: boolean;
    };
    policy: PublishedDocumentTypePolicy | null;
    resulting_sensitivity: DeclaredDocumentSensitivity | null;
    /** Documents of this type the primary owner already holds — what `new_version` / `not_allowed` decide over. */
    existing_of_type: Array<{ id: string; title: string | null; created_at: string | null }>;
    problems: FilingProblem[];
    can_file: boolean;
};

export type DocumentFilingResult = {
    replay: boolean;
    mode: "new_document" | "new_version";
    document_id: string;
    /** The document the filed content now lives in — the received document, or the target for `new_version`. */
    filed_document_id: string;
    version_id: string | null;
    version_number: number | null;
    doc_type: string | null;
    sensitivity: DeclaredDocumentSensitivity | null;
    primary: FilingSubjectRef | null;
    contexts: FilingSubjectRef[];
};

export type FilingFailure = { ok: false; status: number; code: string; message: string; problems?: FilingProblem[] };

type DocRow = {
    id: string;
    title: string | null;
    mime_type: string | null;
    byte_size: number | null;
    created_at: string | null;
    status: string | null;
    doc_type: string | null;
    sensitivity: DeclaredDocumentSensitivity | null;
    bucket: string | null;
    storage_path: string | null;
    original_filename: string | null;
    metadata: Record<string, unknown> | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILING_ROUTE = "documents/filing";

/** A problem the operator can resolve → the status a commit refuses with. */
const PROBLEM_STATUS: Record<string, number> = {
    TYPE_REQUIRED: 400,
    SUBJECT_REQUIRED: 400,
    TARGET_REQUIRED: 400,
    REVIEW_REQUIRED: 409,
    NEW_VERSION_REQUIRED: 409,
    TYPE_REPLACEMENT_NOT_ALLOWED: 409,
    TYPE_NEW_DOCUMENT_REQUIRED: 409,
};

const fail = (status: number, code: string, message: string, problems?: FilingProblem[]): FilingFailure => ({ ok: false, status, code, message, problems });

/** The database's refusals → a stable code, an HTTP status and an operator-readable message. */
const REFUSALS: Array<[RegExp, number, string, string]> = [
    [/document_filing_unavailable|document_unavailable/, 409, "DOCUMENT_UNAVAILABLE", "This document is not available to file."],
    [/document_filing_already_filed|document_filing_owner_conflict/, 409, "ALREADY_FILED", "This document has already been filed."],
    [/document_filing_type_unpublished/, 422, "TYPE_UNAVAILABLE", "The document type is not published."],
    [/document_filing_subject_type_not_applicable/, 422, "TYPE_SUBJECT_NOT_APPLICABLE", "This document type does not apply to that record."],
    [/document_filing_format_not_allowed/, 422, "TYPE_FORMAT_NOT_ALLOWED", "This file's format is not allowed for the document type."],
    [/document_filing_review_required/, 409, "REVIEW_REQUIRED", "This document type needs a review before filing."],
    [/document_filing_replacement_not_allowed/, 409, "TYPE_REPLACEMENT_NOT_ALLOWED", "The record already holds this document and it cannot be replaced."],
    [/document_filing_new_version_required/, 409, "NEW_VERSION_REQUIRED", "The record already holds this document; file it as a new version."],
    [/document_filing_new_version_not_allowed/, 409, "TYPE_NEW_DOCUMENT_REQUIRED", "This document type is not filed as a new version."],
    [/document_filing_context_unrelated/, 422, "SUBJECT_NOT_RELATED", "A linked record is not related to the record the document is filed under."],
    [/document_filing_context_invalid|document_filing_target_invalid|document_filing_review_status_invalid|document_filing_sensitivity_unknown|document_subject_not_owner_type/, 400, "BAD_FILING", "The filing request is not valid."],
    [/document_subject_unresolved/, 404, "SUBJECT_NOT_FOUND", "Record not found."],
    [/document_filing_target_not_found|document_not_found/, 404, "NOT_FOUND", "Document not found."],
    [/document_filing_target_unavailable|document_filing_target_unfiled/, 409, "TARGET_UNAVAILABLE", "The existing document cannot take a new version."],
];

function refusal(error: { message?: string } | null | undefined): FilingFailure {
    const message = error?.message ?? "";
    for (const [re, status, code, text] of REFUSALS) if (re.test(message)) return fail(status, code, text);
    return fail(500, "FILING_FAILED", "The document could not be filed.");
}

async function readDocument(supabase: SupabaseClient, orgId: string, id: string): Promise<DocRow | null> {
    const { data } = await supabase
        .from("documents")
        .select("id, title, mime_type, byte_size, created_at, status, doc_type, sensitivity, bucket, storage_path, original_filename, metadata")
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    return (data as DocRow | null) ?? null;
}

function sensitivityClasses(value: DeclaredDocumentSensitivity | null, docType: string | null): Set<DocumentSensitivityClass> {
    const out = new Set<DocumentSensitivityClass>();
    const cls = classForDeclaredSensitivity(value ?? "standard");
    if (cls) out.add(cls);
    if (docType && MEDICAL_DOCUMENT_TYPES.includes(docType)) out.add("medical");
    return out;
}

/** The class the document will carry after filing: current, medical floor, type default, request — raise-only. */
export function resultingSensitivity(
    current: DeclaredDocumentSensitivity | null,
    policy: PublishedDocumentTypePolicy | null,
    requested: DeclaredDocumentSensitivity | null | undefined,
): DeclaredDocumentSensitivity {
    let s: DeclaredDocumentSensitivity = current ?? "standard";
    if (policy && MEDICAL_DOCUMENT_TYPES.includes(policy.key)) s = raiseSensitivity(s, "medical");
    if (policy) s = raiseSensitivity(s, policy.default_sensitivity);
    if (requested) s = raiseSensitivity(s, requested);
    return s;
}

function isUuid(v: unknown): v is string {
    return typeof v === "string" && UUID_RE.test(v);
}

/** The household a filing subject belongs to (null for a vendor or a record outside any household). */
async function householdOf(supabase: SupabaseClient, orgId: string, s: FilingSubjectRef): Promise<string | null> {
    if (s.subject_type === "vendor") return null;
    const r = await householdForAnchor(supabase, orgId, { subject_type: s.subject_type as "household" | "person" | "child" | "opportunity", subject_id: s.subject_id });
    return r.ok ? r.householdId : null;
}

/** The existing, available documents of this type the subject holds as PRIMARY owner. */
async function existingOfType(supabase: SupabaseClient, orgId: string, docType: string, primary: FilingSubjectRef, except: string) {
    const { data: links } = await supabase
        .from("document_subjects")
        .select("document_id")
        .eq("org_id", orgId)
        .eq("subject_type", primary.subject_type)
        .eq("subject_id", primary.subject_id)
        .eq("is_primary", true)
        .is("ended_at", null);
    const ids = ((links ?? []) as Array<{ document_id: string }>).map((l) => l.document_id).filter((id) => id !== except);
    if (!ids.length) return [];
    const { data: docs } = await supabase
        .from("documents")
        .select("id, title, created_at, status, doc_type")
        .eq("org_id", orgId)
        .eq("doc_type", docType)
        .in("id", ids);
    return ((docs ?? []) as Array<{ id: string; title: string | null; created_at: string | null; status: string | null }>)
        .filter((d) => !["deleted", "quarantined", "restricted", "superseded"].includes(String(d.status ?? "")))
        .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
        .map(({ id, title, created_at }) => ({ id, title, created_at }));
}

type Evaluated = {
    doc: DocRow;
    policy: PublishedDocumentTypePolicy | null;
    target: DocRow | null;
    resulting: DeclaredDocumentSensitivity | null;
    existing: Array<{ id: string; title: string | null; created_at: string | null }>;
    problems: FilingProblem[];
};

/**
 * Steps 1–4. Authorization failures return a FilingFailure (they are not "problems" an operator can fix in the form);
 * policy and completeness issues are returned as `problems`.
 */
async function evaluate(supabase: SupabaseClient, actor: DocumentActor, req: DocumentFilingRequest): Promise<Evaluated | FilingFailure> {
    if (!actor.ok || !actor.orgId) return fail(401, "UNAUTHENTICATED", "Sign in to file documents.");
    if (!(actor.permissionKeys ?? []).includes(DOCUMENT_WRITE_PERMISSION)) {
        return fail(403, "DOCUMENTS_WRITE_REQUIRED", "You do not have permission to file documents.");
    }
    const orgId = actor.orgId;
    if (!isUuid(req.documentId)) return fail(404, "NOT_FOUND", "Document not found.");

    // 1. The received document, through the one access decision.
    const decision = await assertDocumentAccess({ supabase, actor, documentId: req.documentId, operation: "download" });
    if (decision.outcome !== "allowed") {
        if (decision.outcome === "blocked" && decision.code === "DOCUMENT_RESTRICTED") {
            const row = await readDocument(supabase, orgId, req.documentId);
            if (row?.status === QUARANTINED_DOCUMENT_STATUS) {
                return fail(409, "DOCUMENT_QUARANTINED", "This document is held by screening and cannot be filed until it is released.");
            }
            return fail(409, "DOCUMENT_UNAVAILABLE", "This document is not available to file.");
        }
        const http = documentAccessHttp(decision);
        return fail(http.status, String(http.body.code ?? "NOT_FOUND"), String(http.body.error ?? "Document not found."));
    }
    const doc = await readDocument(supabase, orgId, req.documentId);
    if (!doc) return fail(404, "NOT_FOUND", "Document not found.");

    const problems: FilingProblem[] = [];
    const scope = actor.scope;
    const visible = async (s: FilingSubjectRef) =>
        isDocumentOwnerSubjectType(s.subject_type) &&
        isUuid(s.subject_id) &&
        documentSubjectInActorScope(supabase, orgId, scope, { entityType: legacyEntityTypeForSubject(s.subject_type), entityId: s.subject_id });

    if (req.mode === "new_version") {
        if (!isUuid(req.targetDocumentId)) {
            problems.push({ code: "TARGET_REQUIRED", message: "Choose the existing document this becomes a new version of." });
            return { doc, policy: null, target: null, resulting: null, existing: [], problems };
        }
        const t = await assertDocumentAccess({ supabase, actor, documentId: req.targetDocumentId, operation: "download" });
        if (t.outcome !== "allowed") return fail(404, "TARGET_NOT_FOUND", "The existing document was not found.");
        const target = await readDocument(supabase, orgId, req.targetDocumentId);
        if (!target) return fail(404, "TARGET_NOT_FOUND", "The existing document was not found.");
        const resolved = await resolveDocumentTypePolicy(supabase, orgId, target.doc_type);
        if (resolved.status === "error") return fail(503, "TYPE_POLICY_UNAVAILABLE", "The document type could not be checked.");
        const policy = resolved.status === "published" ? resolved.policy : null;
        if (!policy) problems.push({ code: "TYPE_UNAVAILABLE", message: "The existing document's type is not published." });
        else {
            if (policy.replacement_policy !== "new_version") {
                problems.push({ code: "TYPE_NEW_DOCUMENT_REQUIRED", message: `${policy.label} is not filed as a new version.` });
            }
            problems.push(...documentTypePolicyProblems(policy, { format: documentFormatForMime(doc.mime_type) }));
            if (policy.review_required && !req.reviewAccepted) problems.push({ code: "REVIEW_REQUIRED", message: `${policy.label} needs a review before filing.` });
        }
        const resulting = resultingSensitivity(target.sensitivity, policy, null);
        if (!actorMayReadSensitivity(actor, sensitivityClasses(resulting, target.doc_type))) {
            return fail(403, "SENSITIVITY_CLEARANCE_REQUIRED", "You are not cleared for this document's sensitivity.");
        }
        return { doc, policy, target, resulting, existing: [], problems };
    }

    // new_document
    if (!req.docType) problems.push({ code: "TYPE_REQUIRED", message: "Choose the document type." });
    if (!req.primary) problems.push({ code: "SUBJECT_REQUIRED", message: "Choose the record the document belongs to." });

    // 2. Destination subjects: visible (else 404, indistinguishable from absent), then related to the primary.
    if (req.primary) {
        if (!(await visible(req.primary))) return fail(404, "SUBJECT_NOT_FOUND", "Record not found.");
        for (const c of req.contexts) {
            if (c.subject_type === "vendor" || !(await visible(c))) return fail(404, "SUBJECT_NOT_FOUND", "Record not found.");
        }
        if (req.contexts.length) {
            const home = await householdOf(supabase, orgId, req.primary);
            for (const c of req.contexts) {
                const h = await householdOf(supabase, orgId, c);
                if (!home || !h || h !== home) {
                    problems.push({ code: "SUBJECT_NOT_RELATED", message: "A linked record is not in the same household as the record the document is filed under." });
                    break;
                }
            }
        }
    }

    // 3. The published type's policy.
    let policy: PublishedDocumentTypePolicy | null = null;
    if (req.docType) {
        const resolved = await resolveDocumentTypePolicy(supabase, orgId, req.docType);
        if (resolved.status === "error") return fail(503, "TYPE_POLICY_UNAVAILABLE", "The document type could not be checked.");
        if (resolved.status !== "published") problems.push({ code: "TYPE_UNAVAILABLE", message: "Choose a published document type." });
        else policy = resolved.policy;
    }
    let existing: Evaluated["existing"] = [];
    if (policy) {
        problems.push(
            ...documentTypePolicyProblems(policy, { subjectType: req.primary?.subject_type ?? null, format: documentFormatForMime(doc.mime_type) }),
        );
        if (policy.review_required && !req.reviewAccepted) problems.push({ code: "REVIEW_REQUIRED", message: `${policy.label} needs a review before filing.` });
        if (req.primary && policy.replacement_policy !== "new_document") {
            existing = await existingOfType(supabase, orgId, policy.key, req.primary, doc.id);
            if (existing.length && policy.replacement_policy === "not_allowed") {
                problems.push({ code: "TYPE_REPLACEMENT_NOT_ALLOWED", message: `The record already holds ${policy.label} and it cannot be replaced.` });
            } else if (existing.length) {
                problems.push({ code: "NEW_VERSION_REQUIRED", message: `The record already holds ${policy.label}; file this as its new version.` });
            }
        }
    }

    // 4. Clearance for the class the document will have.
    const resulting = resultingSensitivity(doc.sensitivity, policy, req.sensitivity ?? null);
    if (!actorMayReadSensitivity(actor, sensitivityClasses(resulting, policy?.key ?? doc.doc_type))) {
        return fail(403, "SENSITIVITY_CLEARANCE_REQUIRED", "You are not cleared for this document's sensitivity.");
    }
    return { doc, policy, target: null, resulting, existing, problems };
}

function filedAlready(doc: DocRow): boolean {
    return Boolean(doc.metadata && typeof doc.metadata === "object" && "filing" in doc.metadata);
}

/** What filing would do, with every problem the operator still has to resolve. Writes nothing. */
export async function previewDocumentFiling(
    supabase: SupabaseClient,
    actor: DocumentActor,
    req: DocumentFilingRequest,
): Promise<{ ok: true; preview: DocumentFilingPreview } | FilingFailure> {
    const ev = await evaluate(supabase, actor, req);
    if ("ok" in ev) return ev;
    const filed = filedAlready(ev.doc);
    const problems = filed ? [{ code: "ALREADY_FILED", message: "This document has already been filed." }, ...ev.problems] : ev.problems;
    return {
        ok: true,
        preview: {
            document: {
                id: ev.doc.id,
                title: ev.doc.title,
                mime_type: ev.doc.mime_type,
                format: documentFormatForMime(ev.doc.mime_type),
                byte_size: ev.doc.byte_size,
                received_at: ev.doc.created_at,
                status: ev.doc.status,
                doc_type: ev.doc.doc_type,
                sensitivity: ev.doc.sensitivity,
                filed,
            },
            policy: ev.policy,
            resulting_sensitivity: ev.resulting,
            existing_of_type: ev.existing,
            problems,
            can_file: problems.length === 0,
        },
    };
}

function filedPath(orgId: string, targetId: string, doc: DocRow): string {
    const base = (doc.original_filename || doc.storage_path?.split("/").pop() || "document").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
    return `${orgId}/filed/${targetId}/${doc.id}-${base}`;
}

/**
 * File the document. Returns the committed result (also on an idempotent replay), or a refusal that changed nothing.
 * `route` names the caller in the audit trail.
 */
export async function commitDocumentFiling(
    supabase: SupabaseClient,
    actor: DocumentActor,
    req: DocumentFilingRequest,
    route: string = FILING_ROUTE,
): Promise<{ ok: true; result: DocumentFilingResult } | FilingFailure> {
    if (typeof req.filingKey !== "string" || req.filingKey.length < 8 || req.filingKey.length > 200) {
        return fail(400, "BAD_FILING", "The filing request is not valid.");
    }
    const ev = await evaluate(supabase, actor, req);
    if ("ok" in ev) {
        // A retry of a filing that already committed is answered from the committed record, even though the document is
        // now `superseded` (new_version) and therefore refused by the access decision.
        const replay = await replayFromRecord(supabase, actor, req);
        if (replay) return { ok: true, result: replay };
        return ev;
    }
    const doc = ev.doc;
    const existingKey = (doc.metadata?.filing as { key?: unknown } | undefined)?.key;
    if (existingKey === req.filingKey) {
        // Already committed under this key: answer from the record, write nothing, record nothing new.
        const replay = await replayFromRecord(supabase, actor, req);
        if (replay) return { ok: true, result: replay };
    }
    if (filedAlready(doc)) return fail(409, "ALREADY_FILED", "This document has already been filed.");
    if (ev.problems.length) {
        const first = ev.problems[0];
        return fail(PROBLEM_STATUS[first.code] ?? 422, first.code, first.message, ev.problems);
    }
    const orgId = actor.orgId as string;
    const userId = actor.userId as string;

    // 5. Recorded before the effect.
    const detail = {
        mode: req.mode,
        filing_key: req.filingKey,
        processing_case_id: req.processingCaseId ?? null,
        doc_type: req.mode === "new_version" ? ev.target?.doc_type ?? null : req.docType,
        primary: req.mode === "new_document" ? req.primary : null,
        contexts: req.mode === "new_document" ? req.contexts : [],
        target_document_id: req.mode === "new_version" ? req.targetDocumentId : null,
        review_accepted: req.reviewAccepted,
        resulting_sensitivity: ev.resulting,
    };
    const audit = await recordDocumentAudit({ orgId, actorUserId: userId, event: "document_filing_authorized", subject: { type: "documents", id: doc.id }, route, detail });
    if (!audit.ok) return fail(DOCUMENT_AUDIT_UNAVAILABLE.status, "AUDIT_UNAVAILABLE", "Filing is unavailable because the audit could not be recorded.");

    // 6. The transaction.
    let result: DocumentFilingResult;
    if (req.mode === "new_version") {
        const target = ev.target as DocRow;
        const bucket = doc.bucket || "org_documents";
        const path = filedPath(orgId, target.id, doc);
        const { error: copyErr } = await supabase.storage.from(bucket).copy(doc.storage_path as string, path);
        if (copyErr && !/exists|duplicate/i.test(copyErr.message ?? "")) {
            return fail(502, "STORAGE_COPY_FAILED", "The document could not be filed: its file could not be copied.");
        }
        // A copy left by an earlier attempt whose transaction failed is reused, and removed again if this one fails too.
        const { data, error } = await supabase.rpc("document_file_as_version", {
            p_org_id: orgId,
            p_document_id: doc.id,
            p_target_document_id: target.id,
            p_bucket: bucket,
            p_storage_path: path,
            p_reason: req.reason ?? null,
            p_review_status: req.reviewAccepted ? "accepted" : null,
            p_filing_key: req.filingKey,
            p_actor: userId,
            p_case_id: req.processingCaseId ?? null,
            p_audit_event_id: audit.eventId,
        });
        if (error) {
            await compensateCopy(supabase, orgId, bucket, path);
            return refusal(error);
        }
        const r = data as { replay?: boolean; version_id?: string; version_number?: number; filing?: { primary?: FilingSubjectRef } };
        result = {
            replay: Boolean(r.replay),
            mode: "new_version",
            document_id: doc.id,
            filed_document_id: target.id,
            version_id: r.version_id ?? null,
            version_number: typeof r.version_number === "number" ? r.version_number : Number(r.version_number ?? 0) || null,
            doc_type: target.doc_type,
            sensitivity: target.sensitivity,
            primary: r.filing?.primary ?? null,
            contexts: [],
        };
    } else {
        const { data, error } = await supabase.rpc("document_file", {
            p_org_id: orgId,
            p_document_id: doc.id,
            p_doc_type: req.docType,
            p_primary_type: req.primary?.subject_type,
            p_primary_id: req.primary?.subject_id,
            p_contexts: req.contexts,
            p_review_status: req.reviewAccepted ? "accepted" : null,
            p_sensitivity: req.sensitivity ?? null,
            p_filing_key: req.filingKey,
            p_actor: userId,
            p_case_id: req.processingCaseId ?? null,
            p_audit_event_id: audit.eventId,
        });
        if (error) return refusal(error);
        const r = data as { replay?: boolean; version_id?: string | null; doc_type?: string; sensitivity?: DeclaredDocumentSensitivity; filing?: { primary?: FilingSubjectRef; contexts?: FilingSubjectRef[] } };
        result = {
            replay: Boolean(r.replay),
            mode: "new_document",
            document_id: doc.id,
            filed_document_id: doc.id,
            version_id: r.version_id ?? null,
            version_number: null,
            doc_type: r.doc_type ?? req.docType,
            sensitivity: r.sensitivity ?? ev.resulting,
            primary: r.filing?.primary ?? req.primary,
            contexts: r.filing?.contexts ?? req.contexts,
        };
    }

    // 7. The committed activity (best-effort; the committed record is the filing metadata).
    if (!result.replay) {
        await recordDocumentAudit({
            orgId,
            actorUserId: userId,
            event: "document_filed",
            subject: { type: "documents", id: result.filed_document_id },
            route,
            detail: { ...detail, document_id: doc.id, filed_document_id: result.filed_document_id, version_id: result.version_id, authorized_event_id: audit.eventId },
        }).catch(() => undefined);
    }
    return { ok: true, result };
}

async function compensateCopy(supabase: SupabaseClient, orgId: string, bucket: string, path: string): Promise<void> {
    // Remove the copy only when no version references it: if the commit landed and only its answer was lost, the copy
    // IS the new version's file, and the next retry replays.
    const { data } = await supabase.from("document_versions").select("id").eq("org_id", orgId).eq("bucket", bucket).eq("storage_path", path).limit(1);
    if ((data ?? []).length) return;
    await supabase.storage.from(bucket).remove([path]).catch(() => undefined);
}

/** A committed filing with this key, read from the received document's filing record (org-scoped, write-authorized). */
async function replayFromRecord(supabase: SupabaseClient, actor: DocumentActor, req: DocumentFilingRequest): Promise<DocumentFilingResult | null> {
    if (!actor.ok || !actor.orgId || !(actor.permissionKeys ?? []).includes(DOCUMENT_WRITE_PERMISSION) || !isUuid(req.documentId)) return null;
    const doc = await readDocument(supabase, actor.orgId, req.documentId);
    const filing = doc?.metadata?.filing as Record<string, unknown> | undefined;
    if (!doc || !filing || filing.key !== req.filingKey) return null;
    const filedId = filing.mode === "new_version" ? String(filing.target_document_id ?? "") : doc.id;
    // The filed document must still be one the actor may open; otherwise the replay is not theirs to see.
    const access = await assertDocumentAccess({ supabase, actor, documentId: filedId, operation: "preview" });
    if (access.outcome !== "allowed") return null;
    return {
        replay: true,
        mode: filing.mode === "new_version" ? "new_version" : "new_document",
        document_id: doc.id,
        filed_document_id: filedId,
        version_id: typeof filing.version_id === "string" ? filing.version_id : null,
        version_number: typeof filing.version_number === "number" ? filing.version_number : null,
        doc_type: typeof filing.doc_type === "string" ? filing.doc_type : null,
        sensitivity: null,
        primary: (filing.primary as FilingSubjectRef | undefined) ?? null,
        contexts: Array.isArray(filing.contexts) ? (filing.contexts as FilingSubjectRef[]) : [],
    };
}
