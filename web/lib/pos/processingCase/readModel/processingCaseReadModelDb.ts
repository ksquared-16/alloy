/**
 * POS-FP2 — production storage deps + default source resolver registry (Supabase).
 *
 * Reads only the FP1 tables (no schema change) plus the owning source systems for
 * display labels (live-resolved, batched, never copied/persisted). Server paths use
 * an org-scoped client. All resolvers are batched per kind (≤2 queries per kind).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
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

const CASE_COLUMNS = "id, status, case_type, created_at, status_changed_at, updated_at, archived_at";
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

            let q = supabase.from("processing_cases").select(CASE_COLUMNS).eq("org_id", query.orgId);
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
            for (const status of ALL_STATUSES) {
                if (allowedCaseIds && allowedCaseIds.length === 0) {
                    out[status] = 0;
                    continue;
                }
                let q = supabase
                    .from("processing_cases")
                    .select("id", { count: "exact", head: true })
                    .eq("org_id", query.orgId)
                    .eq("status", status);
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
            // Detail read also pulls `metadata` (carries FP9 `metadata.classification`).
            const { data, error } = await supabase
                .from("processing_cases")
                .select(`${CASE_COLUMNS}, metadata`)
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
            .select("id, form_definition_id, submitted_at, created_at")
            .eq("org_id", orgId)
            .in("id", ids);
        const rows = (subs ?? []) as {
            id: string;
            form_definition_id: string | null;
            submitted_at: string | null;
            created_at: string;
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
        for (const r of rows) {
            const label = (r.form_definition_id ? defNames.get(r.form_definition_id) : undefined) ?? "Form submission";
            out.set(r.id, { label, receivedAt: r.submitted_at ?? r.created_at, channel: "form" });
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

function makeDocumentResolver(supabase: SupabaseClient, orgId: string): BatchedSourceResolver {
    return async (ids) => {
        const out = new Map<string, ResolvedSourceLabel>();
        if (ids.length === 0) return out;
        // NOTE: the documents table has `title`, NOT `name` — selecting a non-existent
        // column made this query fail and fall back to the generic "document" label in the
        // queue/detail. Use `title` + the same cleaned display name as the Documents list.
        const { data: docs } = await supabase
            .from("documents")
            .select("id, title, original_filename, created_at")
            .eq("org_id", orgId)
            .in("id", ids);
        for (const d of (docs ?? []) as {
            id: string;
            title: string | null;
            original_filename: string | null;
            created_at: string;
        }[]) {
            out.set(d.id, {
                label: deriveDocumentDisplayName(d.title, d.original_filename),
                receivedAt: d.created_at,
                channel: "document",
            });
        }
        return out;
    };
}

export function makeDefaultSourceDisplayResolverRegistry(
    supabase: SupabaseClient,
    orgId: string
): SourceDisplayResolverRegistry {
    return new Map([
        ["form_submission", makeFormSubmissionResolver(supabase, orgId)],
        ["form_packet_session", makePacketSessionResolver(supabase, orgId)],
        ["document", makeDocumentResolver(supabase, orgId)],
    ]);
}
