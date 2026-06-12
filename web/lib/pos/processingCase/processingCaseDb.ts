/**
 * POS-FP1 — Processing Case storage (Supabase implementation of ProcessingCaseDeps).
 *
 * Thin DB helpers over the two additive tables (processing_cases,
 * processing_case_sources). Adds no source data; references only. Server paths
 * use the service-role admin client, which bypasses RLS for best-effort creation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    ProcessingCaseDeps,
    ProcessingCaseSourceKind,
    ProcessingCaseSourceRole,
    ProcessingCaseStatus,
} from "./types";

/** Build the injected deps the envelope service depends on, backed by Supabase. */
export function makeProcessingCaseDbDeps(supabase: SupabaseClient): ProcessingCaseDeps {
    return {
        async findCaseIdByPrimarySource({ orgId, sourceKind, sourceId }) {
            const { data, error } = await supabase
                .from("processing_case_sources")
                .select("processing_case_id")
                .eq("org_id", orgId)
                .eq("source_kind", sourceKind)
                .eq("source_id", sourceId)
                .eq("role", "primary")
                .maybeSingle();
            if (error) throw new Error(error.message);
            return (data as { processing_case_id?: string } | null)?.processing_case_id ?? null;
        },

        async insertCase({ orgId, status, caseType }) {
            const { data, error } = await supabase
                .from("processing_cases")
                .insert({ org_id: orgId, status, case_type: caseType })
                .select("id")
                .single();
            if (error) throw new Error(error.message);
            return { id: (data as { id: string }).id };
        },

        async insertSource({ orgId, processingCaseId, sourceKind, sourceId, role }) {
            const { error } = await supabase.from("processing_case_sources").insert({
                org_id: orgId,
                processing_case_id: processingCaseId,
                source_kind: sourceKind,
                source_id: sourceId,
                role,
            });
            if (error) throw new Error(error.message);
        },
    };
}

export interface ProcessingCaseRow {
    id: string;
    org_id: string;
    status: ProcessingCaseStatus;
    case_type: string | null;
    created_at: string;
    updated_at: string | null;
    archived_at: string | null;
}

export interface ProcessingCaseSourceRow {
    id: string;
    processing_case_id: string;
    source_kind: ProcessingCaseSourceKind;
    source_id: string;
    role: ProcessingCaseSourceRole;
}

/** Read a case and its source references (org-scoped). For tests / later read models. */
export async function dbGetProcessingCaseWithSources(
    supabase: SupabaseClient,
    orgId: string,
    processingCaseId: string
): Promise<{ case: ProcessingCaseRow | null; sources: ProcessingCaseSourceRow[] }> {
    const { data: caseRow, error: caseErr } = await supabase
        .from("processing_cases")
        .select("id, org_id, status, case_type, created_at, updated_at, archived_at")
        .eq("org_id", orgId)
        .eq("id", processingCaseId)
        .maybeSingle();
    if (caseErr) throw new Error(caseErr.message);
    if (!caseRow) return { case: null, sources: [] };

    const { data: sourceRows, error: srcErr } = await supabase
        .from("processing_case_sources")
        .select("id, processing_case_id, source_kind, source_id, role")
        .eq("org_id", orgId)
        .eq("processing_case_id", processingCaseId)
        .order("linked_at", { ascending: true });
    if (srcErr) throw new Error(srcErr.message);

    return {
        case: caseRow as ProcessingCaseRow,
        sources: (sourceRows ?? []) as ProcessingCaseSourceRow[],
    };
}
