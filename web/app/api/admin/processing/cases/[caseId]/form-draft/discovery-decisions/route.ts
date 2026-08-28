import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { dbLoadDiscoveryDecisions, dbStoreDiscoveryDecisions } from "@/lib/pos/discovery/discoveryDecisionsDb";
import { reconcileDiscovery, type DiscoveryDecisionRecord } from "@/lib/pos/discovery/reconciliation";
import { parseStoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import { dbLoadPacketIntake, dbLoadPacketReview, dbStorePacketReview, type PacketReviewDecision } from "@/lib/pos/packetIntake/packetIntakeDb";

export const dynamic = "force-dynamic";

/**
 * Configuration Discovery decision persistence (POS-FP16 / M5A). Durable operator decisions live
 * separately from detector output, so a rerun never erases them; GET reconciles the stored decisions
 * against the current draft's concepts (semantic-identity anchored).
 *
 *   GET  — load decisions + reconciliation status against the current discovery, plus the packet
 *          analysis and its review decisions when the case was analysed as a packet.
 *   PUT  — persist the operator's decisions (actor + timestamp stamped server-side). A body carrying
 *          `packet_decisions` records decisions at PACKET grain — a fact, a correlation, an
 *          obligation, a collection, an artifact name — in the same durable place, separate from
 *          detector output so a rerun never erases them.
 *
 * Neither method publishes anything. There is no path from here to a form_definition, a field
 * definition or an Enrollment configuration, and the certification asserts it.
 */

const PACKET_SUBJECTS = new Set(["fact", "correlation", "obligation", "collection", "artifact"]);
const PACKET_DECISIONS = new Set(["accepted", "rejected", "rebound", "form_only", "renamed", "confirmed"]);

/** Validate + normalize packet review decisions. Actor and time are stamped server-side. */
function parsePacketDecisions(raw: unknown, actor: string, now: string): PacketReviewDecision[] | string {
    if (!Array.isArray(raw)) return "packet_decisions must be an array";
    const out: PacketReviewDecision[] = [];
    for (const d of raw as Array<Record<string, unknown>>) {
        const subject = typeof d.subject === "string" ? d.subject : "";
        const decision = typeof d.decision === "string" ? d.decision : "";
        const subjectId = typeof d.subject_id === "string" ? d.subject_id.trim() : "";
        if (!PACKET_SUBJECTS.has(subject)) return `unknown decision subject "${subject}"`;
        if (!PACKET_DECISIONS.has(decision)) return `unknown decision "${decision}"`;
        if (!subjectId) return "each decision needs a subject_id";
        out.push({
            subject: subject as PacketReviewDecision["subject"],
            subject_id: subjectId,
            decision: decision as PacketReviewDecision["decision"],
            ...(d.field_source && typeof d.field_source === "object" ? { field_source: d.field_source as PacketReviewDecision["field_source"] } : {}),
            ...(typeof d.name === "string" && d.name.trim() ? { name: d.name.trim().slice(0, 120) } : {}),
            ...(typeof d.note === "string" && d.note.trim() ? { note: d.note.trim().slice(0, 500) } : {}),
            decided_by: actor,
            decided_at: now,
        });
    }
    return out;
}

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
    const packet = await dbLoadPacketIntake(supabase, { orgId: ctx.orgId, caseId });
    const packetDecisions = await dbLoadPacketReview(supabase, { orgId: ctx.orgId, caseId });
    return jsonData({
        caseId,
        decisions,
        reconciliation: { counts: reconciliation.counts, entries: reconciliation.entries },
        packet_intake: packet,
        packet_review_decisions: packetDecisions,
    });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { caseId: raw } = await params;
    const caseId = parseUuidParam(raw, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const body = (await req.json().catch(() => ({}))) as {
        decisions?: DiscoveryDecisionRecord[];
        packet_decisions?: unknown;
    };
    const hasPacket = body.packet_decisions !== undefined;
    if (!hasPacket && !Array.isArray(body.decisions)) return jsonError("Body must include a `decisions` array.", 400);

    const supabase = createAdminClient();
    const row = await loadCase(supabase, ctx.orgId, caseId);
    if (!row) return jsonError("Not found", 404);

    const actor = ctx.userId ?? "operator";
    const now = new Date().toISOString();

    if (hasPacket) {
        const parsed = parsePacketDecisions(body.packet_decisions, actor, now);
        if (typeof parsed === "string") return jsonError(parsed, 400);
        await dbStorePacketReview(supabase, { orgId: ctx.orgId, caseId, decisions: parsed, updatedBy: actor, now });
        if (!Array.isArray(body.decisions)) return jsonData({ caseId, packet_review_decisions: parsed });
    }
    // Stamp actor + timestamp for any decision missing them (server is the authority on provenance).
    const stamped = (body.decisions ?? []).map((d) => ({ ...d, actor: d.actor || actor, decided_at: d.decided_at || now }));
    const stored = await dbStoreDiscoveryDecisions(supabase, { orgId: ctx.orgId, caseId, decisions: stamped, actor, now });
    return jsonData({ caseId, stored });
}
