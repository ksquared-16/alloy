/**
 * D5 — Processing's side of document filing: the Documents work queue, the case's filing workspace, saving the
 * operator's proposal, and the approval that FILES (calling the Documents command) and completes the case only when
 * the filing committed.
 *
 * Processing owns intake and resolution: which document, what type, which record, reviewed or not. Documents owns the
 * filing: storage, versions, associations, sensitivity and authorization (`lib/documents/filing/documentFiling.ts`).
 * Nothing here writes a document row or an association.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    assertDocumentAccess,
    documentSubjectInActorScope,
    filterDocumentRowsInActorScope,
    type DocumentActor,
} from "@/lib/documents/assertDocumentAccess";
import { filterDocumentRowsBySensitivity } from "@/lib/documents/documentSensitivity";
import { isDocumentUnavailable, QUARANTINED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";
import { legacyEntityTypeForSubject, type DocumentSubjectType } from "@/lib/documents/documentSubjects";
import {
    listPublishedDocumentTypePolicies,
    type PublishedDocumentTypePolicy,
} from "@/lib/documents/configuration/documentTypeEnforcement";
import {
    commitDocumentFiling,
    previewDocumentFiling,
    type DocumentFilingPreview,
    type DocumentFilingRequest,
    type DocumentFilingResult,
    type FilingFailure,
} from "@/lib/documents/filing/documentFiling";
import { householdForAnchor, householdSubjects } from "@/lib/documents/library/documentLibrary";
import type { LibrarySubject } from "@/lib/documents/library/documentLibraryModel";
import { dbCompleteProcessingCaseWithResult } from "@/lib/pos/processingCase/processingCaseDb";
import { parseProcessingIntentFromMetadata } from "@/lib/pos/processingImportIntent";
import {
    DOCUMENT_FILING_ACTION,
    DOCUMENT_SOURCE_KINDS,
    deriveDocumentFilingLane,
    isFilingIntent,
    processingFilingKey,
    readDocumentFilingProposal,
    type DocumentFilingLane,
    type DocumentFilingProposal,
} from "@/lib/pos/documentFiling/documentFilingModel";

const FILING_ROUTE = "admin/processing/document-filing";
const QUEUE_LIMIT = 300;
const FILED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type CaseRow = { id: string; status: string; case_type: string | null; created_at: string; status_changed_at: string | null; metadata: Record<string, unknown> | null };

export type DocumentFilingQueueRow = {
    case_id: string;
    document_id: string;
    title: string;
    received_at: string;
    case_status: string;
    intent: string | null;
    lane: DocumentFilingLane;
    required_action: string;
    proposed_type: { key: string; label: string; category: string | null } | null;
    suggested_type: { key: string; label: string; confidence: number } | null;
    proposed_subject: { subject_type: string; subject_id: string; label: string | null } | null;
    uncertainty: { classification: "none" | "suggested" | "confirmed"; subject: "unresolved" | "selected" };
    last_error: { code: string; message: string } | null;
    filed_document_id: string | null;
};

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The deterministic classifier's proposal, only when it names a PUBLISHED type of this organization. Never authority. */
export function suggestedTypeFor(caseMetadata: Record<string, unknown> | null, catalog: PublishedDocumentTypePolicy[]): { key: string; label: string; confidence: number } | null {
    const c = asRecord(caseMetadata?.classification);
    const key = typeof c.classification_key === "string" ? c.classification_key : null;
    if (!key || key === "unknown") return null;
    const t = catalog.find((p) => p.key === key);
    if (!t) return null;
    return { key: t.key, label: t.label, confidence: typeof c.confidence === "number" ? c.confidence : 0 };
}

function isFiledResult(c: CaseRow): boolean {
    return asRecord(c.metadata?.operational_result).kind === "document_filed";
}

/** The case's primary document source, org-scoped. */
async function primaryDocumentOf(supabase: SupabaseClient, orgId: string, caseId: string): Promise<string | null> {
    const { data } = await supabase
        .from("processing_case_sources")
        .select("source_kind, source_id")
        .eq("org_id", orgId)
        .eq("processing_case_id", caseId)
        .eq("role", "primary")
        .maybeSingle();
    const s = data as { source_kind?: string; source_id?: string } | null;
    return s && DOCUMENT_SOURCE_KINDS.includes(String(s.source_kind)) && typeof s.source_id === "string" ? s.source_id : null;
}

export async function loadDocumentCase(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<{ row: CaseRow; documentId: string; proposal: DocumentFilingProposal; intent: string | null } | null> {
    const { data } = await supabase
        .from("processing_cases")
        .select("id, status, case_type, created_at, status_changed_at, metadata")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (!data) return null;
    const row = data as CaseRow;
    const documentId = await primaryDocumentOf(supabase, orgId, caseId);
    if (!documentId) return null;
    return { row, documentId, proposal: readDocumentFilingProposal(row.metadata?.document_filing), intent: parseProcessingIntentFromMetadata(row.metadata) };
}

/** Does this case need a FILING to complete? (Form-template uploads keep their own handoff.) */
export function caseRequiresFiling(row: { metadata: Record<string, unknown> | null }): boolean {
    return isFilingIntent(parseProcessingIntentFromMetadata(row.metadata), Boolean(row.metadata && "document_filing" in row.metadata));
}

// ── queue ──────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listDocumentFilingQueue(supabase: SupabaseClient, actor: DocumentActor): Promise<{ ok: true; rows: DocumentFilingQueueRow[] } | { ok: false }> {
    const orgId = actor.orgId as string;
    const { data: sources, error } = await supabase
        .from("processing_case_sources")
        .select("processing_case_id, source_kind, source_id")
        .eq("org_id", orgId)
        .eq("role", "primary")
        .in("source_kind", [...DOCUMENT_SOURCE_KINDS])
        .limit(QUEUE_LIMIT * 2);
    if (error) return { ok: false };
    const docByCase = new Map<string, string>();
    for (const s of (sources ?? []) as Array<{ processing_case_id: string; source_id: string }>) docByCase.set(s.processing_case_id, s.source_id);
    if (!docByCase.size) return { ok: true, rows: [] };

    const { data: cases, error: cErr } = await supabase
        .from("processing_cases")
        .select("id, status, case_type, created_at, status_changed_at, metadata")
        .eq("org_id", orgId)
        .in("id", [...docByCase.keys()])
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(QUEUE_LIMIT);
    if (cErr) return { ok: false };
    const now = Date.now();
    const inQueue = ((cases ?? []) as CaseRow[]).filter((c) => {
        if (!caseRequiresFiling(c)) return false;
        if (c.status === "completed") return isFiledResult(c) && now - Date.parse(c.status_changed_at ?? c.created_at) < FILED_WINDOW_MS;
        return true;
    });
    if (!inQueue.length) return { ok: true, rows: [] };

    const docIds = inQueue.map((c) => docByCase.get(c.id) as string);
    const { data: docs, error: dErr } = await supabase
        .from("documents")
        .select("id, title, created_at, status, doc_type, entity_type, entity_id")
        .eq("org_id", orgId)
        .in("id", docIds);
    if (dErr) return { ok: false };
    // Disclosure is the canonical one: a document the actor may not read is not in their queue at all.
    type QueueDoc = { id: string; title: string | null; created_at: string | null; status: string | null; doc_type: string | null; entity_type: string | null; entity_id: string | null };
    // Like every document list: unavailable (quarantined, deleted, restricted, superseded) documents are never listed.
    const available = ((docs ?? []) as QueueDoc[]).filter((d) => !isDocumentUnavailable(d.status));
    const inScope = await filterDocumentRowsInActorScope<QueueDoc>(supabase, orgId, actor.scope, available);
    const disclosed = await filterDocumentRowsBySensitivity<QueueDoc>(supabase, orgId, actor, inScope);
    const docById = new Map(disclosed.map((d) => [d.id, d]));
    const catalog = (await listPublishedDocumentTypePolicies(supabase, orgId)) ?? [];
    const typeByKey = new Map(catalog.map((t) => [t.key, t]));

    const rows: DocumentFilingQueueRow[] = [];
    for (const c of inQueue) {
        const documentId = docByCase.get(c.id) as string;
        const filed = isFiledResult(c);
        const doc = docById.get(documentId);
        if (!doc && !filed) continue;
        const proposal = readDocumentFilingProposal(c.metadata?.document_filing);
        const typeKey = proposal.doc_type;
        const t = typeKey ? typeByKey.get(typeKey) ?? null : null;
        const effective = proposal;
        const lane = deriveDocumentFilingLane({ caseStatus: c.status, filed, proposal: effective, publishedType: t ? { review_required: t.review_required } : null });
        const suggested = suggestedTypeFor(c.metadata, catalog);
        const result = asRecord(c.metadata?.operational_result);
        rows.push({
            case_id: c.id,
            document_id: documentId,
            title: String(doc?.title ?? asRecord(c.metadata).source_document_display_name ?? "Document"),
            received_at: String(doc?.created_at ?? c.created_at),
            case_status: c.status,
            intent: parseProcessingIntentFromMetadata(c.metadata),
            lane,
            required_action: DOCUMENT_FILING_ACTION[lane],
            proposed_type: t ? { key: t.key, label: t.label, category: t.category_label } : null,
            suggested_type: suggested,
            proposed_subject: proposal.primary ? { subject_type: proposal.primary.subject_type, subject_id: proposal.primary.subject_id, label: proposal.primary.label ?? null } : null,
            uncertainty: {
                classification: proposal.doc_type ? (proposal.doc_type_source === "suggested" ? "suggested" : "confirmed") : suggested ? "suggested" : "none",
                subject: proposal.primary || proposal.target_document_id ? "selected" : "unresolved",
            },
            last_error: effective.last_error ? { code: effective.last_error.code, message: effective.last_error.message } : null,
            filed_document_id: filed && typeof result.filed_document_id === "string" ? result.filed_document_id : null,
        });
    }
    return { ok: true, rows };
}

// ── workspace ──────────────────────────────────────────────────────────────────────────────────────────────────
export type DocumentFilingWorkspace = {
    case: { id: string; status: string; intent: string | null; received_at: string; filed: boolean; operational_result: Record<string, unknown> | null };
    document_id: string;
    proposal: DocumentFilingProposal;
    lane: DocumentFilingLane;
    required_action: string;
    catalog: PublishedDocumentTypePolicy[];
    suggested_type: { key: string; label: string; confidence: number; method: string } | null;
    /** The household the record is chosen from, and its members (record selection, never name/email matching). */
    household: { id: string; label: string; members: LibrarySubject[] } | null;
    preview: DocumentFilingPreview | null;
    blocked: { code: string; message: string } | null;
};

export function filingRequestFromProposal(caseId: string, documentId: string, p: DocumentFilingProposal): DocumentFilingRequest {
    return {
        documentId,
        mode: p.mode,
        docType: p.doc_type,
        primary: p.primary ? { subject_type: p.primary.subject_type as DocumentSubjectType, subject_id: p.primary.subject_id } : null,
        contexts: p.contexts.map((c) => ({ subject_type: c.subject_type as DocumentSubjectType, subject_id: c.subject_id })),
        targetDocumentId: p.target_document_id,
        reviewAccepted: p.review_accepted,
        sensitivity: (p.sensitivity as DocumentFilingRequest["sensitivity"]) ?? null,
        reason: p.mode === "new_version" ? "Filed from Processing as the record's new version" : null,
        filingKey: processingFilingKey(caseId, documentId),
        processingCaseId: caseId,
    };
}

async function householdFor(
    supabase: SupabaseClient,
    actor: DocumentActor,
    householdId: string | null,
): Promise<DocumentFilingWorkspace["household"]> {
    if (!householdId) return null;
    const orgId = actor.orgId as string;
    // The household must be one the actor can see; otherwise it is simply not offered.
    if (!(await documentSubjectInActorScope(supabase, orgId, actor.scope, { entityType: legacyEntityTypeForSubject("household"), entityId: householdId }))) return null;
    const graph = await householdSubjects(supabase, orgId, householdId);
    if (!graph) return null;
    return { id: graph.household.id, label: graph.household.label, members: graph.subjects };
}

export async function buildDocumentFilingWorkspace(
    supabase: SupabaseClient,
    actor: DocumentActor,
    caseId: string,
    opts: { householdId?: string | null } = {},
): Promise<{ ok: true; workspace: DocumentFilingWorkspace } | FilingFailure> {
    const orgId = actor.orgId as string;
    const loaded = await loadDocumentCase(supabase, orgId, caseId);
    if (!loaded) return { ok: false, status: 404, code: "NOT_FOUND", message: "Document case not found." };
    const { row, documentId, proposal, intent } = loaded;
    const filed = isFiledResult(row);
    const result = filed ? asRecord(row.metadata?.operational_result) : null;
    const catalog = (await listPublishedDocumentTypePolicies(supabase, orgId)) ?? [];
    const suggestedBase = suggestedTypeFor(row.metadata, catalog);
    const suggested = suggestedBase ? { ...suggestedBase, method: "deterministic classifier (a proposal, not a filing)" } : null;

    // The received document must be readable by this actor — the same decision every document read takes.
    let blocked: DocumentFilingWorkspace["blocked"] = null;
    if (!filed) {
        const access = await assertDocumentAccess({ supabase, actor, documentId, operation: "preview" });
        if (access.outcome === "not_found" || (access.outcome === "blocked" && access.code !== "DOCUMENT_RESTRICTED")) {
            return { ok: false, status: 404, code: "NOT_FOUND", message: "Document case not found." };
        }
        if (access.outcome === "blocked") {
            const { data } = await supabase.from("documents").select("status").eq("org_id", orgId).eq("id", documentId).maybeSingle();
            const status = (data as { status?: string } | null)?.status;
            blocked = status === QUARANTINED_DOCUMENT_STATUS
                ? { code: "DOCUMENT_QUARANTINED", message: "This document is held by screening. It can be filed only after an authorized release." }
                : { code: "DOCUMENT_UNAVAILABLE", message: "This document is not available." };
        }
    } else if (typeof result?.filed_document_id === "string") {
        const access = await assertDocumentAccess({ supabase, actor, documentId: result.filed_document_id, operation: "preview" });
        if (access.outcome !== "allowed") return { ok: false, status: 404, code: "NOT_FOUND", message: "Document case not found." };
    }

    // The household to choose from: the operator's choice, else the record the document already belongs to.
    let householdId = opts.householdId ?? proposal.household_id ?? null;
    if (!householdId && !filed && !blocked) {
        const { data: owner } = await supabase
            .from("document_subjects")
            .select("subject_type, subject_id")
            .eq("org_id", orgId)
            .eq("document_id", documentId)
            .eq("is_primary", true)
            .is("ended_at", null)
            .maybeSingle();
        const o = owner as { subject_type?: string; subject_id?: string } | null;
        if (o?.subject_type && o.subject_id && o.subject_type !== "vendor") {
            const h = await householdForAnchor(supabase, orgId, { subject_type: o.subject_type as "household", subject_id: o.subject_id });
            householdId = h.ok ? h.householdId : null;
        }
    }
    const household = await householdFor(supabase, actor, householdId);

    let preview: DocumentFilingPreview | null = null;
    if (!filed && !blocked) {
        const p = await previewDocumentFiling(supabase, actor, filingRequestFromProposal(caseId, documentId, proposal));
        if (p.ok) preview = p.preview;
        else if (p.code === "SUBJECT_NOT_FOUND") blocked = { code: p.code, message: "The chosen record is not available to you. Choose another." };
        else blocked = { code: p.code, message: p.message };
    }

    const t = proposal.doc_type ? catalog.find((c) => c.key === proposal.doc_type) ?? null : null;
    const effective = blocked && !proposal.last_error ? { ...proposal, last_error: { code: blocked.code, message: blocked.message, at: "" } } : proposal;
    const lane = deriveDocumentFilingLane({ caseStatus: row.status, filed, proposal: effective, publishedType: t ? { review_required: t.review_required } : null });
    return {
        ok: true,
        workspace: {
            case: { id: row.id, status: row.status, intent, received_at: row.created_at, filed, operational_result: result },
            document_id: documentId,
            proposal,
            lane,
            required_action: DOCUMENT_FILING_ACTION[lane],
            catalog,
            suggested_type: suggested,
            household,
            preview,
            blocked,
        },
    };
}

// ── proposal ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Save the operator's proposal on the case. Every subject is re-resolved: it must be a member of the chosen household
 * graph (or the household itself) that the actor can see — a record is SELECTED, never matched from a name or email.
 * Saving clears the last filing error: the next approval is a new attempt.
 */
export async function saveDocumentFilingProposal(
    supabase: SupabaseClient,
    actor: DocumentActor,
    caseId: string,
    submitted: unknown,
): Promise<{ ok: true; proposal: DocumentFilingProposal } | FilingFailure> {
    const orgId = actor.orgId as string;
    const loaded = await loadDocumentCase(supabase, orgId, caseId);
    if (!loaded) return { ok: false, status: 404, code: "NOT_FOUND", message: "Document case not found." };
    if (loaded.row.status === "completed" || loaded.row.status === "archived") {
        return { ok: false, status: 409, code: "CASE_CLOSED", message: "This case is already closed." };
    }
    const access = await assertDocumentAccess({ supabase, actor, documentId: loaded.documentId, operation: "preview" });
    if (access.outcome === "not_found" || (access.outcome === "blocked" && access.code !== "DOCUMENT_RESTRICTED")) {
        return { ok: false, status: 404, code: "NOT_FOUND", message: "Document case not found." };
    }
    const next = readDocumentFilingProposal(submitted);

    // Subjects: members of the household graph the actor can see, labelled from the graph (never from the request).
    const household = await householdFor(supabase, actor, next.household_id);
    const memberLabel = (t: string, id: string) => household?.members.find((m) => m.subject_type === t && m.subject_id === id)?.label ?? null;
    const resolve = (s: { subject_type: string; subject_id: string } | null) => {
        if (!s) return null;
        const label = memberLabel(s.subject_type, s.subject_id);
        return label === null ? undefined : { subject_type: s.subject_type as DocumentFilingProposal["contexts"][number]["subject_type"], subject_id: s.subject_id, label };
    };
    const primary = resolve(next.primary);
    if (primary === undefined) return { ok: false, status: 404, code: "SUBJECT_NOT_FOUND", message: "Record not found." };
    const contexts: DocumentFilingProposal["contexts"] = [];
    for (const c of next.contexts) {
        const r = resolve(c);
        if (!r) return { ok: false, status: 404, code: "SUBJECT_NOT_FOUND", message: "Record not found." };
        contexts.push(r);
    }
    if (next.target_document_id) {
        const t = await assertDocumentAccess({ supabase, actor, documentId: next.target_document_id, operation: "preview" });
        if (t.outcome !== "allowed") return { ok: false, status: 404, code: "TARGET_NOT_FOUND", message: "The existing document was not found." };
    }

    const proposal: DocumentFilingProposal = {
        ...next,
        primary,
        contexts,
        household_id: household?.id ?? null,
        updated_at: new Date().toISOString(),
        updated_by: actor.userId ?? null,
        last_error: null,
        attempts: loaded.proposal.attempts,
    };
    const metadata = { ...(loaded.row.metadata ?? {}), document_filing: proposal };
    const { error } = await supabase.from("processing_cases").update({ metadata }).eq("org_id", orgId).eq("id", caseId);
    if (error) return { ok: false, status: 500, code: "PROPOSAL_NOT_SAVED", message: "The proposal could not be saved." };
    return { ok: true, proposal };
}

// ── approval: file, then complete ───────────────────────────────────────────────────────────────────────────────
export type DocumentFiledOperationalResult = {
    kind: "document_filed";
    recordType: "document";
    recordId: string;
    document_id: string;
    filed_document_id: string;
    mode: "new_document" | "new_version";
    version_id: string | null;
    version_number: number | null;
    doc_type: string | null;
    primary: { subject_type: string; subject_id: string; label: string | null } | null;
    contexts: Array<{ subject_type: string; subject_id: string }>;
    replay: boolean;
};

/**
 * Approval of a document case: FILE through the Documents command, then complete the case. A refused or failed filing
 * leaves the case open with the error recorded on its proposal (the Filing errors lane); a retry with the same case is
 * idempotent (same filing key). The case is completed only after the filing committed — and if completing fails after
 * a committed filing, the next approval replays the filing and completes it.
 */
export async function fileDocumentCase(
    supabase: SupabaseClient,
    actor: DocumentActor,
    caseId: string,
): Promise<{ ok: true; result: DocumentFilingResult; operationalResult: DocumentFiledOperationalResult } | (FilingFailure & { caseStatus: string })> {
    const orgId = actor.orgId as string;
    const loaded = await loadDocumentCase(supabase, orgId, caseId);
    if (!loaded) return { ok: false, status: 404, code: "NOT_FOUND", message: "Document case not found.", caseStatus: "unknown" };
    const { row, documentId, proposal } = loaded;

    const filed = await commitDocumentFiling(supabase, actor, filingRequestFromProposal(caseId, documentId, proposal), FILING_ROUTE);
    if (!filed.ok) {
        // Record the refusal on the case (never as completed work). An authorization refusal is recorded by code only.
        const at = new Date().toISOString();
        const next: DocumentFilingProposal = { ...proposal, last_error: { code: filed.code, message: filed.message, at }, attempts: proposal.attempts + 1 };
        await supabase
            .from("processing_cases")
            .update({ metadata: { ...(row.metadata ?? {}), document_filing: next } })
            .eq("org_id", orgId)
            .eq("id", caseId);
        return { ...filed, caseStatus: row.status };
    }
    const r = filed.result;
    const operationalResult: DocumentFiledOperationalResult = {
        kind: "document_filed",
        recordType: "document",
        recordId: r.filed_document_id,
        document_id: r.document_id,
        filed_document_id: r.filed_document_id,
        mode: r.mode,
        version_id: r.version_id,
        version_number: r.version_number,
        doc_type: r.doc_type,
        primary: r.primary
            ? { subject_type: r.primary.subject_type, subject_id: r.primary.subject_id, label: proposal.primary?.subject_id === r.primary.subject_id ? proposal.primary.label ?? null : null }
            : null,
        contexts: r.contexts,
        replay: r.replay,
    };
    const meta = { ...(row.metadata ?? {}), document_filing: { ...proposal, last_error: null, attempts: proposal.attempts + 1 } };
    await supabase.from("processing_cases").update({ metadata: meta }).eq("org_id", orgId).eq("id", caseId);
    await dbCompleteProcessingCaseWithResult(supabase, { orgId, caseId, result: operationalResult });
    return { ok: true, result: r, operationalResult };
}

