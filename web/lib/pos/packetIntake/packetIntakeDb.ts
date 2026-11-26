/**
 * Durable storage for the packet analysis and the operator's decisions about it.
 *
 * Same ownership decision the discovery layer already made: both live on
 * `processing_cases.metadata`, alongside `form_draft_preview` and
 * `configuration_discovery_decisions`. Analysis and decisions are stored SEPARATELY so re-running
 * the readers can never overwrite what an operator decided.
 *
 * The decision list is deliberately shaped as a flat table of rows, so promoting it to a
 * first-class table later is a mechanical migration rather than a rewrite.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeForJsonb } from "@/lib/pos/processingCase/formDraft/sanitizeForJsonb";
import type { PacketIntakeResult } from "./contracts";

export const PACKET_INTAKE_METADATA_KEY = "packet_intake";
export const PACKET_REVIEW_METADATA_KEY = "packet_intake_review";

/** What an operator decided about ONE proposal, correlation, obligation or artifact. */
export interface PacketReviewDecision {
    /** What is being decided about: a fact proposal, a correlation, an obligation, an artifact. */
    subject: "fact" | "correlation" | "obligation" | "collection" | "artifact";
    /** The subject's stable id (proposal id / correlation id / obligation id / artifact id). */
    subject_id: string;
    decision: "accepted" | "rejected" | "rebound" | "form_only" | "renamed" | "confirmed";
    /** For `rebound`: the canonical field the operator chose instead. */
    field_source?: { entity_type: string; field_key: string; shared_value_key?: string };
    /** For `renamed`: the operator's name for the artifact. */
    name?: string;
    decided_by: string;
    decided_at: string;
    note?: string;
}

export interface StoredPacketReview {
    decisions: PacketReviewDecision[];
    updated_at: string;
    updated_by: string;
}

async function readMetadata(supabase: SupabaseClient, orgId: string, caseId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
}

async function writeMetadata(supabase: SupabaseClient, orgId: string, caseId: string, metadata: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from("processing_cases").update({ metadata }).eq("org_id", orgId).eq("id", caseId);
    if (error) throw new Error(error.message);
}

export async function dbStorePacketIntake(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; packet: PacketIntakeResult }
): Promise<void> {
    const base = await readMetadata(supabase, args.orgId, args.caseId);
    // Same jsonb hazard the draft path hit: a PDF's text layer can carry NULs and lone surrogates,
    // and one of them fails the whole write with an opaque error.
    await writeMetadata(supabase, args.orgId, args.caseId, {
        ...base,
        [PACKET_INTAKE_METADATA_KEY]: sanitizeForJsonb(args.packet),
    });
}

export async function dbLoadPacketIntake(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string }
): Promise<PacketIntakeResult | null> {
    const meta = await readMetadata(supabase, args.orgId, args.caseId);
    const raw = meta[PACKET_INTAKE_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as PacketIntakeResult;
}

export async function dbLoadPacketReview(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string }
): Promise<PacketReviewDecision[]> {
    const meta = await readMetadata(supabase, args.orgId, args.caseId);
    const raw = meta[PACKET_REVIEW_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const decisions = (raw as { decisions?: unknown }).decisions;
    return Array.isArray(decisions) ? (decisions as PacketReviewDecision[]) : [];
}

export async function dbStorePacketReview(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; decisions: PacketReviewDecision[]; updatedBy: string; now: string }
): Promise<void> {
    const base = await readMetadata(supabase, args.orgId, args.caseId);
    const stored: StoredPacketReview = { decisions: args.decisions, updated_at: args.now, updated_by: args.updatedBy };
    await writeMetadata(supabase, args.orgId, args.caseId, { ...base, [PACKET_REVIEW_METADATA_KEY]: sanitizeForJsonb(stored) });
}
