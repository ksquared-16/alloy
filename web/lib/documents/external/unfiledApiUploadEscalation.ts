/**
 * D9.2 — an `/api/v1` upload its installation completed but never filed becomes Processing work after a grace period
 * (operator-approved 2026-11-03: "after a 24-hour grace period, make them visible to authorized staff through a
 * Processing case").
 *
 * What escalation does, and nothing more:
 *   - opens ONE Processing case per upload through the existing non-form opener (`source_kind = 'upload'`,
 *     `source_id = document id`) with `requireAtomic`: only the one-transaction `open_processing_case_with_primary_source`
 *     may open it. Where that function is not in the database yet the upload is HELD — never opened by the legacy
 *     find-then-insert sequence, whose crash or race leaves a second, orphaned case;
 *   - marks the case as a document to file (`processing_intent = store_document`) with its provenance, so it reaches the
 *     Processing documents queue. That queue is the authority on who sees it: `processing.operate` plus `documents.read`,
 *     then the canonical scope and sensitivity disclosure, and unavailable (quarantined…) documents are never listed;
 *   - records `document_unfiled_upload_escalated` as the `api_upload_escalation` system process BEFORE the case opens.
 * What it never does: write the document row, a subject, a type, a review or a filing record. An escalated upload is
 * still unfiled — it satisfies no requirement until a person (or the installation, late) files it through
 * `commitDocumentFiling`. It never changes screening: a quarantined upload is not escalated (it is the screening
 * queue's), and nothing here releases, rescans or reads bytes.
 *
 * Late filing: the installation may still file its upload after escalation. The filing route then closes the case
 * (`resolveEscalatedUploadCase`), and the wake repeats that for any case a lost call left open. A staff filing through
 * the case completes it the D5 way, and the installation's later attempt is the existing 409 `ALREADY_FILED`.
 *
 * Idempotent by construction: the case is keyed by the document (one primary source per (org, kind, id), enforced by
 * `uq_pcs_primary_source_once`); a retry finds it and only repairs a lost annotation; no audit is written for an upload
 * that already has its case.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordDocumentAudit, type DocumentAuditInput, type DocumentAuditResult } from "@/lib/documents/documentAudit";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import { openNonFormProcessingCaseFromSource } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe";
import { isAtomicProcessingOpenUnavailable } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";
import { processingIntentMetadata } from "@/lib/pos/processingImportIntent";

export const UNFILED_API_UPLOAD_GRACE_HOURS = 24;
export const UNFILED_API_UPLOAD_GRACE_MS = UNFILED_API_UPLOAD_GRACE_HOURS * 60 * 60 * 1000;
/** The marker on the case. Its presence is what makes a case an escalated API upload. */
export const API_UPLOAD_ESCALATION_KEY = "api_upload_escalation";
export const API_UPLOAD_ESCALATION_KIND = "api_v1_unfiled_upload";
const PROCESS = { kind: "system", process: "api_upload_escalation" } as const;
const ROUTE = "scheduled-work/wake#api-upload-escalation";
const SOURCE_KIND = "upload" as const;
const PAGE = 200;

type Audit = (input: DocumentAuditInput) => Promise<DocumentAuditResult>;
type UploadRow = { id: string; org_id: string; title: string | null; original_filename: string | null; status: string | null; created_at: string; metadata: Record<string, unknown> | null };
type CaseRow = { id: string; org_id: string; status: string; metadata: Record<string, unknown> | null };

export type EscalationOutcome =
    | { document_id: string; outcome: "case_opened" | "case_existing" | "annotation_repaired"; processing_case_id: string }
    | { document_id: string; outcome: "held"; reason: "processing_atomic_open_unavailable" }
    | { document_id: string; outcome: "skipped"; reason: "unavailable" | "not_api_upload" | "already_filed" }
    | { document_id: string; outcome: "failed"; reason: "audit_unavailable" | "case_open_failed" | "annotation_failed" | "lookup_failed" };

export type EscalationSummary = {
    scanned: number;
    opened: number;
    existing: number;
    repaired: number;
    held: number;
    skipped: number;
    failed: number;
    resolved: number;
    /** More candidates remained than one wake reads; the next wake continues. */
    truncated: boolean;
    outcomes: EscalationOutcome[];
};

export type EscalationDeps = {
    supabase: SupabaseClient;
    processing: ProcessingCaseDeps;
    audit?: Audit;
    nowMs?: number;
    /** Pages of {@link PAGE} uploads read per wake (newest past the grace period first). */
    maxPages?: number;
};

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The installation an `/api/v1` upload came from, as `completeDocumentUpload` recorded it. */
function receivedVia(meta: Record<string, unknown> | null): { installation_id: string; application_id: string | null } | null {
    const r = asRecord(asRecord(meta).received_via);
    return r.kind === "api_v1" && typeof r.installation_id === "string"
        ? { installation_id: r.installation_id, application_id: typeof r.application_id === "string" ? r.application_id : null }
        : null;
}

const isEscalatedCase = (meta: Record<string, unknown> | null) => asRecord(asRecord(meta)[API_UPLOAD_ESCALATION_KEY]).kind === API_UPLOAD_ESCALATION_KIND;

/** A merge: applying it twice changes nothing; a lost annotation is restored by the next wake. */
async function annotateCase(supabase: SupabaseClient, c: { orgId: string; caseId: string; doc: UploadRow; escalatedAt: string }): Promise<boolean> {
    const { data, error: readErr } = await supabase.from("processing_cases").select("metadata").eq("org_id", c.orgId).eq("id", c.caseId).maybeSingle();
    if (readErr) return false;
    const meta = asRecord((data as { metadata?: unknown } | null)?.metadata);
    if (isEscalatedCase(meta)) return true;
    const via = receivedVia(c.doc.metadata);
    const name = c.doc.title?.trim() || c.doc.original_filename?.trim() || "Partner upload";
    const { error } = await supabase
        .from("processing_cases")
        .update({
            metadata: {
                ...meta,
                ...processingIntentMetadata("store_document"),
                source_document_display_name: name,
                source_document_filename: c.doc.original_filename,
                [API_UPLOAD_ESCALATION_KEY]: {
                    kind: API_UPLOAD_ESCALATION_KIND,
                    document_id: c.doc.id,
                    installation_id: via?.installation_id ?? null,
                    application_id: via?.application_id ?? null,
                    received_at: c.doc.created_at,
                    escalated_at: c.escalatedAt,
                    grace_hours: UNFILED_API_UPLOAD_GRACE_HOURS,
                },
            },
        })
        .eq("org_id", c.orgId)
        .eq("id", c.caseId);
    return !error;
}

/** Unfiled `/api/v1` uploads older than the grace period, newest first, one page. */
async function readCandidates(supabase: SupabaseClient, cutoffIso: string, before: string | null): Promise<UploadRow[] | null> {
    const base = supabase
        .from("documents")
        .select("id, org_id, title, original_filename, status, created_at, metadata")
        .eq("metadata->>source", "api_v1_upload")
        .is("metadata->filing", null);
    // The first page is strictly past the grace period; later pages include the previous page's last timestamp, so rows
    // sharing it are not skipped (the caller de-duplicates by id).
    const bounded = before ? base.lte("created_at", before) : base.lt("created_at", cutoffIso);
    const { data, error } = await bounded.order("created_at", { ascending: false }).limit(PAGE);
    return error ? null : ((data ?? []) as UploadRow[]);
}

export async function escalateUnfiledApiUploads(deps: EscalationDeps): Promise<EscalationSummary> {
    const { supabase, processing } = deps;
    const audit = deps.audit ?? recordDocumentAudit;
    const nowMs = deps.nowMs ?? Date.now();
    const cutoffIso = new Date(nowMs - UNFILED_API_UPLOAD_GRACE_MS).toISOString();
    const escalatedAt = new Date(nowMs).toISOString();
    const sum: EscalationSummary = { scanned: 0, opened: 0, existing: 0, repaired: 0, held: 0, skipped: 0, failed: 0, resolved: 0, truncated: false, outcomes: [] };
    const push = (o: EscalationOutcome) => {
        sum.outcomes.push(o);
        if (o.outcome === "case_opened") sum.opened += 1;
        else if (o.outcome === "case_existing") sum.existing += 1;
        else if (o.outcome === "annotation_repaired") sum.repaired += 1;
        else if (o.outcome === "held") sum.held += 1;
        else if (o.outcome === "skipped") sum.skipped += 1;
        else sum.failed += 1;
    };

    const seen = new Set<string>();
    let before: string | null = null;
    for (let page = 0; page < (deps.maxPages ?? 5); page += 1) {
        const rows = await readCandidates(supabase, cutoffIso, before);
        if (!rows) {
            sum.failed += 1;
            break;
        }
        const fresh = rows.filter((r) => !seen.has(r.id));
        for (const r of fresh) seen.add(r.id);
        sum.scanned += fresh.length;
        if (fresh.length) await escalatePage(supabase, processing, audit, fresh, escalatedAt, push);
        if (rows.length < PAGE) break;
        // Keyset on created_at (inclusive, de-duplicated by id). A page of one timestamp cannot advance: stop, report.
        const last = rows[rows.length - 1].created_at;
        if (last === before || !fresh.length) {
            sum.truncated = true;
            break;
        }
        before = last;
        if (page === (deps.maxPages ?? 5) - 1) sum.truncated = true;
    }

    sum.resolved = await resolveFiledEscalations(supabase, { audit, nowMs });
    return sum;
}

async function escalatePage(
    supabase: SupabaseClient,
    processing: ProcessingCaseDeps,
    audit: Audit,
    rows: UploadRow[],
    escalatedAt: string,
    push: (o: EscalationOutcome) => void,
): Promise<void> {
    // The cases these uploads already have, in one read.
    const { data: srcs, error } = await supabase
        .from("processing_case_sources")
        .select("org_id, processing_case_id, source_id")
        .eq("source_kind", SOURCE_KIND)
        .eq("role", "primary")
        .in("source_id", rows.map((r) => r.id));
    if (error) {
        for (const r of rows) push({ document_id: r.id, outcome: "failed", reason: "lookup_failed" });
        return;
    }
    const caseOf = new Map<string, string>();
    for (const s of (srcs ?? []) as Array<{ org_id: string; processing_case_id: string; source_id: string }>) {
        const doc = rows.find((r) => r.id === s.source_id);
        if (doc && doc.org_id === s.org_id) caseOf.set(s.source_id, s.processing_case_id);
    }

    for (const doc of rows) {
        const existingCase = caseOf.get(doc.id);
        if (existingCase) {
            // Already escalated. Only a lost annotation is repaired; nothing is audited again.
            const { data } = await supabase.from("processing_cases").select("metadata").eq("org_id", doc.org_id).eq("id", existingCase).maybeSingle();
            if (isEscalatedCase(asRecord((data as { metadata?: unknown } | null)?.metadata))) {
                push({ document_id: doc.id, outcome: "case_existing", processing_case_id: existingCase });
            } else if (await annotateCase(supabase, { orgId: doc.org_id, caseId: existingCase, doc, escalatedAt })) {
                push({ document_id: doc.id, outcome: "annotation_repaired", processing_case_id: existingCase });
            } else {
                push({ document_id: doc.id, outcome: "failed", reason: "annotation_failed" });
            }
            continue;
        }
        // Re-checked per row: the query is the selection, this is the rule.
        const via = receivedVia(doc.metadata);
        if (!via) {
            push({ document_id: doc.id, outcome: "skipped", reason: "not_api_upload" });
            continue;
        }
        if ("filing" in asRecord(doc.metadata)) {
            push({ document_id: doc.id, outcome: "skipped", reason: "already_filed" });
            continue;
        }
        // Quarantined (the screening queue's), deleted, restricted or superseded: never escalated.
        if (isDocumentUnavailable(doc.status)) {
            push({ document_id: doc.id, outcome: "skipped", reason: "unavailable" });
            continue;
        }

        const recorded = await audit({
            orgId: doc.org_id,
            actorUserId: null,
            actorPrincipal: PROCESS,
            event: "document_unfiled_upload_escalated",
            subject: { type: "documents", id: doc.id },
            route: ROUTE,
            detail: { installation_id: via.installation_id, application_id: via.application_id, received_at: doc.created_at, grace_hours: UNFILED_API_UPLOAD_GRACE_HOURS },
        });
        if (!recorded.ok) {
            push({ document_id: doc.id, outcome: "failed", reason: "audit_unavailable" });
            continue;
        }

        let opened: { processingCaseId: string; created: boolean } | null = null;
        try {
            opened = await openNonFormProcessingCaseFromSource(processing, { orgId: doc.org_id, sourceKind: SOURCE_KIND, sourceId: doc.id, caseType: null, requireAtomic: true });
        } catch (e) {
            if (isAtomicProcessingOpenUnavailable(e)) {
                push({ document_id: doc.id, outcome: "held", reason: "processing_atomic_open_unavailable" });
                continue;
            }
            // A transient failure after a concurrent wake committed: a read-only re-find converges on its case.
            const found = await processing.findCaseIdByPrimarySource({ orgId: doc.org_id, sourceKind: SOURCE_KIND, sourceId: doc.id }).catch(() => null);
            if (found) opened = { processingCaseId: found, created: false };
        }
        if (!opened) {
            push({ document_id: doc.id, outcome: "failed", reason: "case_open_failed" });
            continue;
        }
        if (!(await annotateCase(supabase, { orgId: doc.org_id, caseId: opened.processingCaseId, doc, escalatedAt }))) {
            // The case exists; the next wake finds it and restores the annotation.
            push({ document_id: doc.id, outcome: "failed", reason: "annotation_failed" });
            continue;
        }
        push({ document_id: doc.id, outcome: opened.created ? "case_opened" : "case_existing", processing_case_id: opened.processingCaseId });
    }
}

// ───────────────────────────────────────────────────────────────────────────── late filing

const OPEN_FOR_RESOLUTION = (status: string) => status !== "completed" && status !== "archived";

/**
 * Close the escalation case of a document that has now been filed (by its installation, late, or by anyone through a
 * path other than the case). Answers whether a case was closed. Never files, never touches the document; a case that is
 * already completed or archived is left as it is. Audited before the case changes.
 */
export async function resolveEscalatedUploadCase(
    supabase: SupabaseClient,
    orgId: string,
    documentId: string,
    { audit = recordDocumentAudit, nowMs = Date.now() }: { audit?: Audit; nowMs?: number } = {},
): Promise<{ resolved: boolean; processing_case_id: string | null; reason?: string }> {
    const { data: src, error: srcErr } = await supabase
        .from("processing_case_sources")
        .select("processing_case_id")
        .eq("org_id", orgId)
        .eq("source_kind", SOURCE_KIND)
        .eq("source_id", documentId)
        .eq("role", "primary")
        .maybeSingle();
    if (srcErr) return { resolved: false, processing_case_id: null, reason: "lookup_failed" };
    const caseId = (src as { processing_case_id?: string } | null)?.processing_case_id ?? null;
    if (!caseId) return { resolved: false, processing_case_id: null, reason: "no_case" };
    const { data: c } = await supabase.from("processing_cases").select("id, org_id, status, metadata").eq("org_id", orgId).eq("id", caseId).maybeSingle();
    const row = c as CaseRow | null;
    if (!row || !isEscalatedCase(row.metadata)) return { resolved: false, processing_case_id: caseId, reason: "not_escalation_case" };
    if (!OPEN_FOR_RESOLUTION(row.status)) return { resolved: false, processing_case_id: caseId, reason: "case_closed" };

    const { data: d } = await supabase.from("documents").select("id, metadata").eq("org_id", orgId).eq("id", documentId).maybeSingle();
    const filing = asRecord(asRecord((d as { metadata?: unknown } | null)?.metadata).filing);
    if (typeof filing.key !== "string") return { resolved: false, processing_case_id: caseId, reason: "not_filed" };

    const newVersion = filing.mode === "new_version";
    const filedDocumentId = newVersion ? String(filing.target_document_id ?? "") : documentId;
    const recorded = await audit({
        orgId,
        actorUserId: null,
        actorPrincipal: PROCESS,
        event: "document_unfiled_upload_case_resolved",
        subject: { type: "documents", id: documentId },
        route: ROUTE,
        detail: { processing_case_id: caseId, filed_document_id: filedDocumentId, filing_audit_event_id: filing.audit_event_id ?? null, filed_through_api: filing.key.startsWith("ext:") },
    });
    if (!recorded.ok) return { resolved: false, processing_case_id: caseId, reason: "audit_unavailable" };

    const primary = asRecord(filing.primary);
    const operationalResult = {
        kind: "document_filed",
        recordType: "document",
        recordId: filedDocumentId,
        document_id: documentId,
        filed_document_id: filedDocumentId,
        mode: newVersion ? "new_version" : "new_document",
        version_id: typeof filing.version_id === "string" ? filing.version_id : null,
        version_number: typeof filing.version_number === "number" ? filing.version_number : null,
        doc_type: typeof filing.doc_type === "string" ? filing.doc_type : null,
        primary: typeof primary.subject_id === "string" ? { subject_type: String(primary.subject_type), subject_id: primary.subject_id, label: null } : null,
        contexts: Array.isArray(filing.contexts) ? filing.contexts : [],
        replay: false,
        // Filed outside the case: by the installation (an `ext:` key) or by a staff path that did not name this case.
        filed_outside_case: true,
        resolution_audit_event_id: recorded.eventId,
    };
    const { error } = await supabase
        .from("processing_cases")
        .update({ status: "completed", status_changed_at: new Date(nowMs).toISOString(), metadata: { ...asRecord(row.metadata), operational_result: operationalResult } })
        .eq("org_id", orgId)
        .eq("id", caseId)
        .neq("status", "completed");
    if (error) return { resolved: false, processing_case_id: caseId, reason: "update_failed" };
    return { resolved: true, processing_case_id: caseId };
}

/** The wake's repair pass: an escalation case still open whose document has been filed (a lost late-filing close). */
async function resolveFiledEscalations(supabase: SupabaseClient, opts: { audit: Audit; nowMs: number }): Promise<number> {
    const { data, error } = await supabase
        .from("processing_cases")
        .select("id, org_id, status, metadata")
        .eq(`metadata->${API_UPLOAD_ESCALATION_KEY}->>kind`, API_UPLOAD_ESCALATION_KIND)
        .neq("status", "completed")
        .neq("status", "archived")
        .limit(PAGE);
    if (error) return 0;
    const open = ((data ?? []) as CaseRow[]).filter((c) => OPEN_FOR_RESOLUTION(c.status));
    if (!open.length) return 0;
    const docIds = open.map((c) => String(asRecord(asRecord(c.metadata)[API_UPLOAD_ESCALATION_KEY]).document_id ?? "")).filter(Boolean);
    const { data: docs } = await supabase.from("documents").select("id, org_id, metadata").in("id", docIds);
    let resolved = 0;
    for (const d of (docs ?? []) as Array<{ id: string; org_id: string; metadata: Record<string, unknown> | null }>) {
        if (!("filing" in asRecord(d.metadata))) continue;
        const r = await resolveEscalatedUploadCase(supabase, d.org_id, d.id, opts).catch(() => ({ resolved: false }));
        if (r.resolved) resolved += 1;
    }
    return resolved;
}
