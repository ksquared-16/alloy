import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityCandidate } from "@/lib/identity";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";

export type ProcessingResolutionRow = {
    id: string;
    org_id: string;
    case_id: string;
    generation_id: string;
    input_facts_hash: string;
    subject_ref: string;
    subject_role: string;
    provisional: Record<string, unknown>;
    candidates: IdentityCandidate[];
    decision_action: string | null;
    selected_candidate_id: string | null;
    decided_by: string;
    operator_id: string | null;
    policy_version: string | null;
    resolver_version: string;
    stale_at: string | null;
    superseded_by: string | null;
    retention_class: string;
    created_at: string;
};

export async function findResolutionByCaseSubjectGeneration(
    supabase: SupabaseClient,
    input: { caseId: string; subjectRef: string; generationId: string },
): Promise<ProcessingResolutionRow | null> {
    const { data, error } = await supabase
        .from("processing_resolutions")
        .select("*")
        .eq("case_id", input.caseId)
        .eq("subject_ref", input.subjectRef)
        .eq("generation_id", input.generationId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProcessingResolutionRow | null) ?? null;
}

/**
 * One resolution row by id, org-scoped.
 *
 * Exists so a caller can re-read the DURABLE row rather than trusting an
 * in-memory copy — the difference between "we asked for a decision" and "the
 * decision committed".
 */
export async function findResolutionById(
    supabase: SupabaseClient,
    input: { orgId: string; caseId: string; resolutionId: string },
): Promise<ProcessingResolutionRow | null> {
    const { data, error } = await supabase
        .from("processing_resolutions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("case_id", input.caseId)
        .eq("id", input.resolutionId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProcessingResolutionRow | null) ?? null;
}

export async function insertProcessingResolution(
    supabase: SupabaseClient,
    row: Omit<ProcessingResolutionRow, "id" | "created_at" | "stale_at" | "superseded_by">,
): Promise<ProcessingResolutionRow> {
    const { data, error } = await supabase
        .from("processing_resolutions")
        .insert(row)
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    return data as ProcessingResolutionRow;
}

export async function markResolutionSuperseded(
    supabase: SupabaseClient,
    input: { resolutionId: string; supersededById: string },
): Promise<void> {
    const { error } = await supabase
        .from("processing_resolutions")
        .update({
            stale_at: new Date().toISOString(),
            superseded_by: input.supersededById,
        })
        .eq("id", input.resolutionId);
    if (error) throw new Error(error.message);
}

export async function listProcessingResolutionsByCase(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<ProcessingResolutionRow[]> {
    const { data, error } = await supabase
        .from("processing_resolutions")
        .select("*")
        .eq("org_id", orgId)
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProcessingResolutionRow[];
}

export function resolutionRowFromSubject(input: {
    orgId: string;
    caseId: string;
    generationId: string;
    inputFactsHash: string;
    subjectRef: string;
    subjectRole: string;
    provisional?: Record<string, unknown>;
    candidates: IdentityCandidate[];
    decisionAction?: string | null;
    selectedCandidateId?: string | null;
    decidedBy?: string;
    retentionClass?: string;
}): Omit<ProcessingResolutionRow, "id" | "created_at" | "stale_at" | "superseded_by"> {
    return {
        org_id: input.orgId,
        case_id: input.caseId,
        generation_id: input.generationId,
        input_facts_hash: input.inputFactsHash,
        subject_ref: input.subjectRef,
        subject_role: input.subjectRole,
        provisional: input.provisional ?? {},
        candidates: input.candidates,
        decision_action: input.decisionAction ?? null,
        selected_candidate_id: input.selectedCandidateId ?? null,
        decided_by: input.decidedBy ?? "engine",
        operator_id: null,
        policy_version: null,
        resolver_version: IDENTITY_RESOLVER_VERSION,
        retention_class: input.retentionClass ?? "uncommitted_submission",
    };
}
