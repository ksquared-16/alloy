/**
 * POS-FP16 / M5A — durable persistence of Configuration Discovery decisions.
 *
 * OWNERSHIP DECISION. Operator decisions persist at `processing_cases.metadata.
 * configuration_discovery_decisions` — case-scoped, alongside `form_draft_preview` and
 * `form_draft_detection`. This is durable across sessions, reloads, and operators (it is a server
 * row, not React state), which satisfies the V1 durability requirements. It is deliberately shaped
 * as a flat record list (a table's rows) so promotion to a first-class `configuration_discovery_*`
 * table is a mechanical migration — NOT a schema rewrite. A first-class table is the right long-term
 * owner (cross-case queryability, per-decision history); it is deferred here only because this
 * environment cannot apply/verify migrations, so metadata is the honest, verifiable V1 owner.
 *
 * Decisions are stored SEPARATELY from detector output (`configuration_discovery`) so a detector
 * rerun never overwrites them — reconciliation (`reconcileDiscovery`) merges the two.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryDecisionRecord } from "./reconciliation";

export const DISCOVERY_DECISIONS_METADATA_KEY = "configuration_discovery_decisions";

export interface StoredDiscoveryDecisions {
    decisions: DiscoveryDecisionRecord[];
    updated_at: string;
    updated_by: string;
}

function parseStored(metadata: unknown): StoredDiscoveryDecisions | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>)[DISCOVERY_DECISIONS_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.decisions)) return null;
    return {
        decisions: r.decisions as DiscoveryDecisionRecord[],
        updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
        updated_by: typeof r.updated_by === "string" ? r.updated_by : "",
    };
}

export async function dbLoadDiscoveryDecisions(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string },
): Promise<DiscoveryDecisionRecord[]> {
    const { data } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    return parseStored((data as { metadata?: unknown } | null)?.metadata)?.decisions ?? [];
}

export async function dbStoreDiscoveryDecisions(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; decisions: DiscoveryDecisionRecord[]; actor: string; now: string },
): Promise<StoredDiscoveryDecisions> {
    const { data: existing, error: readErr } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const baseMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const record: StoredDiscoveryDecisions = { decisions: args.decisions, updated_at: args.now, updated_by: args.actor };
    const metadata = { ...baseMeta, [DISCOVERY_DECISIONS_METADATA_KEY]: record };

    const { error } = await supabase.from("processing_cases").update({ metadata }).eq("org_id", args.orgId).eq("id", args.caseId);
    if (error) throw new Error(error.message);
    return record;
}
