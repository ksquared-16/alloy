/**
 * POS-FP2 — production storage deps + default source resolver registry (Supabase).
 *
 * Reads only the FP1 tables (no schema change) plus the owning source systems for
 * display labels (live-resolved, batched, never copied/persisted). Server paths use
 * an org-scoped client. All resolvers are batched per kind (≤2 queries per kind).
 */

import { disclosableDocumentIds, UNDISCLOSED_DOCUMENT_LABEL, type DocumentDisclosureActor } from "@/lib/documents/documentMetadataDisclosure";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isProcessingIntakeLink } from "@/lib/pos/processingPublicLinkMetadata";
import type {
    BatchedSourceResolver,
    ProcessingCaseCountQuery,
    ProcessingCaseQueueQuery,
    ProcessingCaseReadDeps,
    ProcessingCaseStatus,
    ReadModelCaseRow,
    ReadModelSourceRow,
    ResolvedSourceLabel,
    SourceDisplayResolverRegistry,
} from "./types";
import { deriveDocumentDisplayName } from "../formDraft/deriveDocumentTitle";

/**
 * `processing_case_subject_removed` is a computed field (migration 20261129090000): true when the case's
 * family or child no longer exists. Filtering on it in the database keeps cursor pages and exact counts
 * exact; selecting it labels the row.
 */
export const SUBJECT_REMOVED_FIELD = "processing_case_subject_removed";
const CASE_COLUMNS = `id, status, case_type, created_at, status_changed_at, updated_at, archived_at, metadata, ${SUBJECT_REMOVED_FIELD}`;
const SOURCE_COLUMNS = "processing_case_id, source_kind, source_id, role, linked_at";

const ALL_STATUSES: ProcessingCaseStatus[] = [
    "received",
    "processing",
    "needs_review",
    "needs_resolution",
    "ready",
    "completed",
    "archived",
];

async function primaryCaseIdsForKinds(
    supabase: SupabaseClient,
    orgId: string,
    sourceKinds: string[]
): Promise<string[]> {
    const { data, error } = await supabase
        .from("processing_case_sources")
        .select("processing_case_id")
        .eq("org_id", orgId)
        .eq("role", "primary")
        .in("source_kind", sourceKinds);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((r) => (r as { processing_case_id: string }).processing_case_id))];
}

export function makeProcessingCaseReadDeps(supabase: SupabaseClient): ProcessingCaseReadDeps {
    return {
        async queryCases(query: ProcessingCaseQueueQuery) {
            let allowedCaseIds: string[] | null = null;
            if (query.sourceKinds && query.sourceKinds.length > 0) {
                allowedCaseIds = await primaryCaseIdsForKinds(supabase, query.orgId, query.sourceKinds);
                if (allowedCaseIds.length === 0) return [];
            }

            const sortKey = query.sortKey ?? "created_at";
            const ascending = (query.sortDir ?? "desc") === "asc";

            if (query.caseIds && query.caseIds.length === 0) return [];

            let q = supabase.from("processing_cases").select(CASE_COLUMNS).eq("org_id", query.orgId);
            if (query.caseIds && query.caseIds.length > 0) q = q.in("id", query.caseIds);
            else q = q.eq(SUBJECT_REMOVED_FIELD, query.subjectRemoved === true);
            if (query.statuses && query.statuses.length > 0) q = q.in("status", query.statuses);
            if (query.caseTypes && query.caseTypes.length > 0) q = q.in("case_type", query.caseTypes);
            if (query.receivedFrom) q = q.gte("created_at", query.receivedFrom);
            if (query.receivedTo) q = q.lte("created_at", query.receivedTo);
            if (allowedCaseIds) q = q.in("id", allowedCaseIds);

            if (query.cursor) {
                const op = ascending ? "gt" : "lt";
                q = q.or(
                    `${sortKey}.${op}.${query.cursor.sortValue},and(${sortKey}.eq.${query.cursor.sortValue},id.${op}.${query.cursor.id})`
                );
            }

            q = q.order(sortKey, { ascending }).order("id", { ascending }).limit(query.limit);

            const { data, error } = await q;
            if (error) throw new Error(error.message);
            return (data ?? []) as ReadModelCaseRow[];
        },

        async querySourcesForCases({ orgId, caseIds }) {
            if (caseIds.length === 0) return [];
            const { data, error } = await supabase
                .from("processing_case_sources")
                .select(SOURCE_COLUMNS)
                .eq("org_id", orgId)
                .in("processing_case_id", caseIds);
            if (error) throw new Error(error.message);
            return (data ?? []) as ReadModelSourceRow[];
        },

        async countByStatus(query: ProcessingCaseCountQuery) {
            let allowedCaseIds: string[] | null = null;
            if (query.sourceKinds && query.sourceKinds.length > 0) {
                allowedCaseIds = await primaryCaseIdsForKinds(supabase, query.orgId, query.sourceKinds);
            }
            const out: Record<string, number> = {};
            // Each status counts ACTIVE work only; `subject_removed` counts the evidence-only cases.
            for (const status of [...ALL_STATUSES, "subject_removed"] as const) {
                if (allowedCaseIds && allowedCaseIds.length === 0) {
                    out[status] = 0;
                    continue;
                }
                let q = supabase
                    .from("processing_cases")
                    .select("id", { count: "exact", head: true })
                    .eq("org_id", query.orgId);
                q = status === "subject_removed" ? q.eq(SUBJECT_REMOVED_FIELD, true) : q.eq("status", status).eq(SUBJECT_REMOVED_FIELD, false);
                if (query.caseTypes && query.caseTypes.length > 0) q = q.in("case_type", query.caseTypes);
                if (query.receivedFrom) q = q.gte("created_at", query.receivedFrom);
                if (query.receivedTo) q = q.lte("created_at", query.receivedTo);
                if (allowedCaseIds) q = q.in("id", allowedCaseIds);
                const { count, error } = await q;
                if (error) throw new Error(error.message);
                out[status] = count ?? 0;
            }
            return out;
        },

        async getCase({ orgId, id }) {
            const { data, error } = await supabase
                .from("processing_cases")
                .select(CASE_COLUMNS)
                .eq("org_id", orgId)
                .eq("id", id)
                .maybeSingle();
            if (error) throw new Error(error.message);
            return (data as ReadModelCaseRow | null) ?? null;
        },

        async getSourcesForCase({ orgId, caseId }) {
            const { data, error } = await supabase
                .from("processing_case_sources")
                .select(SOURCE_COLUMNS)
                .eq("org_id", orgId)
                .eq("processing_case_id", caseId)
                .order("role", { ascending: true })
                .order("linked_at", { ascending: true });
            if (error) throw new Error(error.message);
            return (data ?? []) as ReadModelSourceRow[];
        },
    };
}

// ---------------------------------------------------------------------------
// Default source display resolver registry (batched per kind; ≤2 queries each).
// ---------------------------------------------------------------------------

function makeFormSubmissionResolver(supabase: SupabaseClient, orgId: string): BatchedSourceResolver {
    return async (ids) => {
        const out = new Map<string, ResolvedSourceLabel>();
        if (ids.length === 0) return out;
        const { data: subs } = await supabase
            .from("form_submissions")
            .select("id, form_definition_id, submitted_at, created_at, created_via_public_link_id")
            .eq("org_id", orgId)
            .in("id", ids);
        const rows = (subs ?? []) as {
            id: string;
            form_definition_id: string | null;
            submitted_at: string | null;
            created_at: string;
            created_via_public_link_id: string | null;
        }[];
        const defIds = [...new Set(rows.map((r) => r.form_definition_id).filter((x): x is string => Boolean(x)))];
        const defNames = new Map<string, string>();
        if (defIds.length > 0) {
            const { data: defs } = await supabase
                .from("form_definitions")
                .select("id, name")
                .eq("org_id", orgId)
                .in("id", defIds);
            for (const d of (defs ?? []) as { id: string; name: string }[]) defNames.set(d.id, d.name);
        }
        const linkIds = [
            ...new Set(rows.map((r) => r.created_via_public_link_id).filter((x): x is string => Boolean(x))),
        ];
        const linkMetaById = new Map<string, Record<string, unknown>>();
        if (linkIds.length > 0) {
            const { data: links } = await supabase
                .from("form_public_links")
                .select("id, metadata")
                .eq("org_id", orgId)
                .in("id", linkIds);
            for (const link of (links ?? []) as { id: string; metadata: Record<string, unknown> | null }[]) {
                linkMetaById.set(link.id, (link.metadata ?? {}) as Record<string, unknown>);
            }
        }
        for (const r of rows) {
            const label = (r.form_definition_id ? defNames.get(r.form_definition_id) : undefined) ?? "Form submission";
            const linkMeta = r.created_via_public_link_id ? linkMetaById.get(r.created_via_public_link_id) : undefined;
            const channel = isProcessingIntakeLink(linkMeta) ? "Public form" : "form";
            out.set(r.id, { label, receivedAt: r.submitted_at ?? r.created_at, channel });
        }
        return out;
    };
}

function makePacketSessionResolver(supabase: SupabaseClient, orgId: string): BatchedSourceResolver {
    return async (ids) => {
        const out = new Map<string, ResolvedSourceLabel>();
        if (ids.length === 0) return out;
        const { data: sessions } = await supabase
            .from("form_packet_sessions")
            .select("id, packet_definition_id, completed_at, created_at")
            .eq("org_id", orgId)
            .in("id", ids);
        const rows = (sessions ?? []) as {
            id: string;
            packet_definition_id: string | null;
            completed_at: string | null;
            created_at: string;
        }[];
        const defIds = [...new Set(rows.map((r) => r.packet_definition_id).filter((x): x is string => Boolean(x)))];
        const defNames = new Map<string, string>();
        if (defIds.length > 0) {
            const { data: defs } = await supabase
                .from("form_packet_definitions")
                .select("id, name")
                .eq("org_id", orgId)
                .in("id", defIds);
            for (const d of (defs ?? []) as { id: string; name: string }[]) defNames.set(d.id, d.name);
        }
        for (const r of rows) {
            const label = (r.packet_definition_id ? defNames.get(r.packet_definition_id) : undefined) ?? "Packet";
            out.set(r.id, { label, receivedAt: r.completed_at ?? r.created_at, channel: "packet" });
        }
        return out;
    };
}

function makeDocumentResolver(
    supabase: SupabaseClient,
    orgId: string,
    documentActor: DocumentDisclosureActor | null,
): BatchedSourceResolver {
    return async (ids) => {
        const out = new Map<string, ResolvedSourceLabel>();
        if (ids.length === 0) return out;
        // EN-FI-01: a source document's title and file name are shown only to an actor who may read that document
        // (documents admission, subject scope, sensitivity clearance — e.g. health.view for an immunization record).
        // Anyone else sees a neutral label; the case itself stays in their queue.
        const disclosable = await disclosableDocumentIds(supabase, orgId, documentActor, ids);
        // NOTE: the documents table has `title`, NOT `name` — selecting a non-existent
        // column made this query fail and fall back to the generic "document" label in the
        // queue/detail. Use `title` + the same cleaned display name as the Documents list.
        const { data: docs } = await supabase
            .from("documents")
            .select("id, title, original_filename, created_at, extraction_provider, metadata")
            .eq("org_id", orgId)
            .in("id", ids);
        for (const d of (docs ?? []) as {
            id: string;
            title: string | null;
            original_filename: string | null;
            created_at: string;
            extraction_provider: string | null;
            metadata: Record<string, unknown> | null;
        }[]) {
            const md = d.metadata ?? {};
            const ocrDerived = md.ocr_derived === true;
            if (!disclosable.has(d.id)) {
                out.set(d.id, { label: UNDISCLOSED_DOCUMENT_LABEL, originalFilename: null, ocr: null, receivedAt: d.created_at, channel: "document" });
                continue;
            }
            out.set(d.id, {
                label: deriveDocumentDisplayName(d.title, d.original_filename),
                originalFilename: d.original_filename,
                ocr: ocrDerived
                    ? {
                          derived: true,
                          method: typeof d.extraction_provider === "string" ? d.extraction_provider : (md.ocr_method as string) ?? "ocr",
                          confidence: typeof md.ocr_confidence === "number" ? md.ocr_confidence : 0,
                          lowConfidence: md.ocr_low_confidence === true,
                      }
                    : null,
                receivedAt: d.created_at,
                channel: "document",
            });
        }
        return out;
    };
}

export function makeDefaultSourceDisplayResolverRegistry(
    supabase: SupabaseClient,
    orgId: string,
    /** The reader. Required: a document label is disclosed only to an actor who may read the document (EN-FI-01). */
    documentActor: DocumentDisclosureActor | null,
): SourceDisplayResolverRegistry {
    return new Map([
        ["form_submission", makeFormSubmissionResolver(supabase, orgId)],
        ["form_packet_session", makePacketSessionResolver(supabase, orgId)],
        ["document", makeDocumentResolver(supabase, orgId, documentActor)],
    ]);
}
