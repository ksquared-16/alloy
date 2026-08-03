import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { parseStoredFormDraftPreview, dbStoreFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import { dbLoadDiscoveryDecisions } from "@/lib/pos/discovery/discoveryDecisionsDb";
import { fromDecisionRecords } from "@/lib/pos/discovery/discoveryDecisionBridge";
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";

export const dynamic = "force-dynamic";

const APPLICATION_METADATA_KEY = "configuration_discovery_application";

/**
 * Apply approved Configuration Discovery proposals (POS-FP16 / M5C).
 *
 * Loads the stored draft + durable decisions, applies only approved proposals (binding form
 * questions to canonical fields, projecting relationships through the canonical provider, confirming
 * requirement/static/output dispositions), persists the bound draft, and returns a STRUCTURED
 * result. Idempotent via a persisted application ledger — re-apply is a no-op.
 * PREVIEW-safe: never publishes; the reviewed form is created through the existing create path.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { caseId: raw } = await params;
    const caseId = parseUuidParam(raw, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const body = (await req.json().catch(() => ({}))) as { confirmedNewFields?: string[] };
    const confirmedNewFields = new Set(Array.isArray(body.confirmedNewFields) ? body.confirmedNewFields : []);

    const supabase = createAdminClient();
    const { data: row } = await supabase.from("processing_cases").select("metadata").eq("org_id", ctx.orgId).eq("id", caseId).maybeSingle();
    const metadata = (row as { metadata?: Record<string, unknown> } | null)?.metadata ?? null;
    if (!metadata) return jsonError("Not found", 404);

    const draft = parseStoredFormDraftPreview(metadata);
    const discovery = draft?.configuration_discovery;
    if (!draft || !discovery) return jsonError("This case has no Configuration Discovery to apply. Re-detect first.", 422);

    const decisionRecords = await dbLoadDiscoveryDecisions(supabase, { orgId: ctx.orgId, caseId });
    const decisions = fromDecisionRecords(discovery, decisionRecords);
    const priorLedger = ((metadata[APPLICATION_METADATA_KEY] as { ledger?: string[] } | undefined)?.ledger) ?? [];

    const { updatedDraft, result } = applyDiscovery({ draft, discovery, decisions, confirmedNewFields, ledger: priorLedger });

    // Persist the bound draft (field_source bindings drive the published form).
    await dbStoreFormDraftPreview(supabase, { orgId: ctx.orgId, caseId, draft: updatedDraft });

    // Persist the application ledger + summary for idempotency + explainability.
    const { data: fresh } = await supabase.from("processing_cases").select("metadata").eq("org_id", ctx.orgId).eq("id", caseId).maybeSingle();
    const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const application = { ledger: result.ledger, counts: result.counts, applied_at: new Date().toISOString(), applied_by: ctx.userId };
    await supabase.from("processing_cases").update({ metadata: { ...freshMeta, [APPLICATION_METADATA_KEY]: application } }).eq("org_id", ctx.orgId).eq("id", caseId);

    // Return the BOUND draft so the review + generate flow carries the applied field bindings
    // straight into the published form (source→discovery→binding→published lineage).
    return jsonData({ caseId, application: { counts: result.counts, results: result.results }, form_draft_preview: updatedDraft });
}
