import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { dbLoadDiscoveryDecisions, dbStoreDiscoveryDecisions } from "@/lib/pos/discovery/discoveryDecisionsDb";
import { reconcileDiscovery, type DiscoveryDecisionRecord } from "@/lib/pos/discovery/reconciliation";
import { parseStoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";

export const dynamic = "force-dynamic";

/**
 * Configuration Discovery decision persistence (POS-FP16 / M5A). Durable operator decisions live
 * separately from detector output, so a rerun never erases them; GET reconciles the stored decisions
 * against the current draft's concepts (semantic-identity anchored).
 *
 *   GET  — load decisions + reconciliation status against the current discovery.
 *   PUT  — persist the operator's decisions (actor + timestamp stamped server-side).
 */

async function loadCase(supabase: ReturnType<typeof createAdminClient>, orgId: string, caseId: string) {
    const { data } = await supabase.from("processing_cases").select("id, metadata").eq("org_id", orgId).eq("id", caseId).maybeSingle();
    return data as { id: string; metadata?: unknown } | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { caseId: raw } = await params;
    const caseId = parseUuidParam(raw, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();
    const row = await loadCase(supabase, ctx.orgId, caseId);
    if (!row) return jsonError("Not found", 404);

    const decisions = await dbLoadDiscoveryDecisions(supabase, { orgId: ctx.orgId, caseId });
    const draft = parseStoredFormDraftPreview(row.metadata);
    const concepts = draft?.configuration_discovery?.concepts ?? [];
    const reconciliation = reconcileDiscovery(decisions, concepts);
    return jsonData({ caseId, decisions, reconciliation: { counts: reconciliation.counts, entries: reconciliation.entries } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { caseId: raw } = await params;
    const caseId = parseUuidParam(raw, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const body = (await req.json().catch(() => ({}))) as { decisions?: DiscoveryDecisionRecord[] };
    if (!Array.isArray(body.decisions)) return jsonError("Body must include a `decisions` array.", 400);

    const supabase = createAdminClient();
    const row = await loadCase(supabase, ctx.orgId, caseId);
    if (!row) return jsonError("Not found", 404);

    const actor = ctx.userId ?? "operator";
    const now = new Date().toISOString();
    // Stamp actor + timestamp for any decision missing them (server is the authority on provenance).
    const stamped = body.decisions.map((d) => ({ ...d, actor: d.actor || actor, decided_at: d.decided_at || now }));
    const stored = await dbStoreDiscoveryDecisions(supabase, { orgId: ctx.orgId, caseId, decisions: stamped, actor, now });
    return jsonData({ caseId, stored });
}
