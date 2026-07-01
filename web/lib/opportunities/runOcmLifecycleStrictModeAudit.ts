/**
 * Load org data and run strict-mode readiness audit (Card 12).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    runOcmLifecycleStrictModeAuditFromRows,
    type CandidateAuditRowInput,
    type OcmAuditRowInput,
    type OcmLifecycleStrictModeAuditResult,
} from "@/lib/opportunities/ocmLifecycleStrictModeReadiness";

function safeMeta(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

export async function loadOcmLifecycleStrictModeAuditInputs(
    supabase: SupabaseClient,
    orgId: string
): Promise<{ ocmRows: OcmAuditRowInput[]; candidateRows: CandidateAuditRowInput[] }> {
    const { data: ocmData, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select("id, opportunity_id, outcome_status_key, opportunities!inner(status_key)")
        .eq("org_id", orgId);

    if (ocmErr) throw new Error(`OCM load failed: ${ocmErr.message}`);

    type OcmJoined = {
        id: string;
        opportunity_id: string;
        outcome_status_key: string | null;
        opportunities: { status_key: string | null } | { status_key: string | null }[] | null;
    };

    const ocmById = new Map<string, string | null>();
    const ocmRows: OcmAuditRowInput[] = [];
    for (const raw of (ocmData ?? []) as OcmJoined[]) {
        const oppJoin = raw.opportunities;
        const oppObj = Array.isArray(oppJoin) ? oppJoin[0] : oppJoin;
        const outcome = raw.outcome_status_key?.trim() || null;
        ocmById.set(String(raw.id), outcome);
        ocmRows.push({
            ocm_id: String(raw.id),
            opportunity_id: String(raw.opportunity_id),
            outcome_status_key: outcome,
            opportunity_status_key: oppObj?.status_key?.trim() || null,
        });
    }

    const { data: candData, error: candErr } = await supabase
        .from("placement_candidates")
        .select(
            "id, opportunity_id, opportunity_customer_member_id, is_synthetic_fallback, metadata, opportunities!inner(status_key)"
        )
        .eq("org_id", orgId);

    if (candErr) throw new Error(`placement_candidates load failed: ${candErr.message}`);

    type CandJoined = {
        id: string;
        opportunity_id: string;
        opportunity_customer_member_id: string | null;
        is_synthetic_fallback: boolean;
        metadata: Record<string, unknown> | null;
        opportunities: { status_key: string | null } | { status_key: string | null }[] | null;
    };

    const candidateRows: CandidateAuditRowInput[] = [];
    for (const raw of (candData ?? []) as CandJoined[]) {
        const oppJoin = raw.opportunities;
        const oppObj = Array.isArray(oppJoin) ? oppJoin[0] : oppJoin;
        const ocmId = raw.opportunity_customer_member_id?.trim() || null;
        const md = safeMeta(raw.metadata);
        candidateRows.push({
            candidate_id: String(raw.id),
            opportunity_id: String(raw.opportunity_id),
            opportunity_customer_member_id: ocmId,
            is_synthetic_fallback: raw.is_synthetic_fallback === true,
            child_outcome_status_key: ocmId ? (ocmById.get(ocmId) ?? null) : null,
            opportunity_status_key: oppObj?.status_key?.trim() || null,
            eligibility_compat_opportunity_fallback: md.eligibility_compat_opportunity_fallback === true,
        });
    }

    return { ocmRows, candidateRows };
}

export async function runOcmLifecycleStrictModeAudit(
    supabase: SupabaseClient,
    orgId: string
): Promise<OcmLifecycleStrictModeAuditResult> {
    const { ocmRows, candidateRows } = await loadOcmLifecycleStrictModeAuditInputs(supabase, orgId);
    return runOcmLifecycleStrictModeAuditFromRows({ orgId, ocmRows, candidateRows });
}
