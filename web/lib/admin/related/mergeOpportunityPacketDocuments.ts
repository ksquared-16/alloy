import type { SupabaseClient } from "@supabase/supabase-js";
import { dbListSubmissionLinkedDocumentsForSubmissionIds } from "@/lib/admin/forms/formsAdminDb";
import { normalizeDocumentRows, type NormalizedDocumentRow } from "@/lib/admin/normalizeDocumentRow";
import { buildPacketReviewRollupV1 } from "@/lib/forms/packets/buildPacketReviewRollupV1";
import {
    enrichPacketPdfRowFromIndexEntry,
    packetDocumentIndexEntryToRow,
} from "@/lib/forms/packets/documentProvenanceDisplay";
import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const DOC_SELECT =
    "id, org_id, title, original_filename, doc_type, status, created_at, mime_type, bucket, storage_path, owner_contact_id, entity_type, entity_id";

/** Session ids for packet sessions tied to an opportunity (crm_snapshot or public link fallback). */
export async function listOpportunityPacketSessionIds(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<string[]> {
    const { data: bySnap } = await supabase
        .from("form_packet_sessions")
        .select("id")
        .eq("org_id", orgId)
        .filter("crm_snapshot->>opportunity_id", "eq", opportunityId)
        .limit(40);
    let sessionIds = (bySnap ?? []).map((s: { id: string }) => s.id);
    if (sessionIds.length === 0) {
        const { data: links } = await supabase
            .from("form_public_links")
            .select("id")
            .eq("org_id", orgId)
            .filter("metadata->>form_context_mode", "eq", "packet")
            .filter("metadata->>source_entity_type", "eq", "opportunity")
            .filter("metadata->>source_entity_id", "eq", opportunityId)
            .limit(80);
        const linkIds = (links ?? []).map((r: { id: string }) => r.id).filter(Boolean);
        if (linkIds.length > 0) {
            const { data: byLink } = await supabase
                .from("form_packet_sessions")
                .select("id")
                .eq("org_id", orgId)
                .in("started_via_public_link_id", linkIds)
                .limit(40);
            sessionIds = (byLink ?? []).map((s: { id: string }) => s.id);
        }
    }
    return sessionIds;
}

/** Load PDF rows linked via packet step submissions (existing Phase 1 path). */
export async function loadPacketSubmissionDocumentRowsForOpportunity(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<Record<string, unknown>[]> {
    const sessionIds = await listOpportunityPacketSessionIds(supabase, orgId, opportunityId);
    if (sessionIds.length === 0) return [];

    const { data: items } = await supabase
        .from("form_packet_session_items")
        .select("packet_session_id, form_submission_id")
        .eq("org_id", orgId)
        .in("packet_session_id", sessionIds)
        .not("form_submission_id", "is", null);
    const submissionIds = [
        ...new Set((items ?? []).map((r: { form_submission_id: string }) => r.form_submission_id).filter(Boolean)),
    ];
    const submissionToPacketSession = new Map<string, string>();
    for (const it of items ?? []) {
        const r = it as { form_submission_id?: string | null; packet_session_id?: string | null };
        if (r.form_submission_id && r.packet_session_id) {
            submissionToPacketSession.set(r.form_submission_id, r.packet_session_id);
        }
    }
    if (submissionIds.length === 0) return [];

    const batch = await dbListSubmissionLinkedDocumentsForSubmissionIds(supabase, orgId, submissionIds);
    if (batch.error || !batch.data) return [];

    const allIds = new Set<string>();
    for (const list of Object.values(batch.data)) {
        for (const e of list) {
            allIds.add(e.document.id);
        }
    }
    if (allIds.size === 0) return [];

    const docToSubmission = new Map<string, string>();
    for (const [sid, list] of Object.entries(batch.data)) {
        for (const e of list) {
            const did = e.document.id;
            if (!docToSubmission.has(did)) docToSubmission.set(did, sid);
        }
    }

    const pathBySubmission = new Map<string, string>();
    const { data: subs } = await supabase
        .from("form_submissions")
        .select("id, form_definition_id")
        .eq("org_id", orgId)
        .in("id", submissionIds);
    for (const s of subs ?? []) {
        const r = s as { id: string; form_definition_id: string };
        if (r.id && r.form_definition_id) {
            pathBySubmission.set(
                r.id,
                `/admin/forms/${encodeURIComponent(r.form_definition_id)}/submissions/${encodeURIComponent(r.id)}`
            );
        }
    }

    const { data: fullDocs, error } = await supabase
        .from("documents")
        .select(DOC_SELECT)
        .eq("org_id", orgId)
        .in("id", [...allIds]);
    if (error) return [];

    return (fullDocs ?? []).map((doc) => {
        const id = String((doc as { id: string }).id);
        const sid = docToSubmission.get(id) ?? null;
        const path = sid ? pathBySubmission.get(sid) ?? null : null;
        const packetSessionId = sid ? submissionToPacketSession.get(sid) ?? null : null;
        const packetPath =
            packetSessionId != null && String(packetSessionId).length > 0
                ? `/adminV2/forms/packets/${encodeURIComponent(String(packetSessionId))}`
                : null;
        return {
            ...(doc as Record<string, unknown>),
            ...(sid && path
                ? {
                      source_form_submission_id: sid,
                      source_form_submission_admin_path: path,
                      ...(packetPath ? { source_packet_session_admin_path: packetPath } : {}),
                  }
                : {}),
        };
    });
}

/** Collect `documents_index` from rollups for all opportunity packet sessions. */
export async function loadPacketDocumentsIndexForOpportunity(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<PacketReviewDocumentIndexEntryV1[]> {
    const sessionIds = await listOpportunityPacketSessionIds(supabase, orgId, opportunityId);
    const entries: PacketReviewDocumentIndexEntryV1[] = [];
    for (const sessionId of sessionIds) {
        const built = await buildPacketReviewRollupV1(supabase, orgId, sessionId);
        if (built.ok) entries.push(...built.rollup.documents_index);
    }
    return entries;
}

function sortMergedDocuments(rows: NormalizedDocumentRow[]): NormalizedDocumentRow[] {
    return [...rows].sort((a, b) => {
        const ta = a.uploaded_at || a.created_at || "";
        const tb = b.uploaded_at || b.created_at || "";
        return tb.localeCompare(ta);
    });
}

/**
 * Merge opportunity uploads, packet-linked PDFs (with provenance), and synthetic submitted_record rows.
 * Does not dedupe PDF vs submitted_record for the same step (both shown for transparency).
 */
export function mergeOpportunityPacketDocumentRows(
    opportunityUploadRows: Record<string, unknown>[] | null | undefined,
    packetPdfRows: Record<string, unknown>[],
    indexEntries: PacketReviewDocumentIndexEntryV1[],
    limit: number
): NormalizedDocumentRow[] {
    const indexByDocId = new Map<string, PacketReviewDocumentIndexEntryV1>();
    const syntheticInputs: Record<string, unknown>[] = [];

    for (const entry of indexEntries) {
        if (entry.kind === "generated_pdf" && entry.document_id) {
            indexByDocId.set(entry.document_id, entry);
        } else if (entry.kind === "submitted_record") {
            syntheticInputs.push(packetDocumentIndexEntryToRow(entry));
        }
    }

    const enrichedPdfRows = packetPdfRows.map((row) => {
        const id = row.id != null ? String(row.id) : "";
        const idx = id ? indexByDocId.get(id) : undefined;
        return idx ? enrichPacketPdfRowFromIndexEntry(row, idx) : row;
    });

    const byId = new Map<string, NormalizedDocumentRow>();
    const ingest = (list: Record<string, unknown>[] | null | undefined) => {
        for (const row of list ?? []) {
            if (row?.id == null) continue;
            const n = normalizeDocumentRows([row])[0];
            if (n) byId.set(n.id, n);
        }
    };

    ingest(opportunityUploadRows);
    ingest(enrichedPdfRows);
    ingest(syntheticInputs);

    return sortMergedDocuments([...byId.values()]).slice(0, limit);
}

/** Full opportunity Documents merge for `/api/admin/related/opportunity/:id`. */
export async function mergeOpportunityPacketDocumentsForRelated(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    opportunityUploadRows: Record<string, unknown>[] | null | undefined,
    limit: number
): Promise<NormalizedDocumentRow[]> {
    const [packetPdfRows, indexEntries] = await Promise.all([
        loadPacketSubmissionDocumentRowsForOpportunity(supabase, orgId, opportunityId),
        loadPacketDocumentsIndexForOpportunity(supabase, orgId, opportunityId),
    ]);
    return mergeOpportunityPacketDocumentRows(opportunityUploadRows, packetPdfRows, indexEntries, limit);
}
