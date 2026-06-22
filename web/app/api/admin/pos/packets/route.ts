import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData } from "@/lib/admin/forms/formsAdminResponses";
import { FORM_PUBLIC_LINK_SAFE_SELECT } from "@/lib/admin/forms/formsAdminDb";
import {
    buildPosPacketReadModel,
    type PosPacketDefinitionRow,
    type PosPacketItemRow,
    type PosPacketLinkRow,
    type PosPacketSessionRow,
    type PosFormNameRow,
} from "@/lib/pos/packet/posPacketReadModel";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pos/packets — POS Packet Visibility (Sprint 1B).
 *
 * Read-only list of packets created by the POS template→packet flow
 * (`metadata.created_via = "pos_packet_from_template"`), joined with source form name,
 * share-link status, and latest session status. Reuses existing forms-packet tables; no
 * new tables, no submission review, no PDF generation.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();

    const { data: defsRaw, error: defErr } = await supabase
        .from("form_packet_definitions")
        .select("id, key, name, is_active, metadata, created_at")
        .eq("org_id", ctx.orgId)
        .filter("metadata->>created_via", "eq", "pos_packet_from_template")
        .order("created_at", { ascending: false })
        .limit(200);
    if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });

    const definitions = (defsRaw ?? []) as PosPacketDefinitionRow[];
    if (definitions.length === 0) return jsonData([]);

    const packetIds = definitions.map((d) => d.id);

    const [itemsRes, linksRes, sessionsRes] = await Promise.all([
        supabase
            .from("form_packet_items")
            .select("packet_definition_id, sequence_index, form_definition_id, metadata")
            .eq("org_id", ctx.orgId)
            .in("packet_definition_id", packetIds),
        supabase
            .from("form_public_links")
            .select(FORM_PUBLIC_LINK_SAFE_SELECT)
            .eq("org_id", ctx.orgId)
            .not("metadata->>packet_definition_id", "is", null)
            .order("created_at", { ascending: false }),
        supabase
            .from("form_packet_sessions")
            .select("id, packet_definition_id, status, operator_review_status, created_at, completed_at")
            .eq("org_id", ctx.orgId)
            .in("packet_definition_id", packetIds),
    ]);

    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 });
    if (sessionsRes.error) return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 });

    const items = (itemsRes.data ?? []) as PosPacketItemRow[];
    const sessions = (sessionsRes.data ?? []) as PosPacketSessionRow[];

    // Keep only links that target one of our POS packets (filtered here since the JSON
    // key can't be used with `.in`).
    const packetIdSet = new Set(packetIds);
    const links = ((linksRes.data ?? []) as PosPacketLinkRow[]).filter((l) => {
        const pid = l.metadata?.packet_definition_id;
        return typeof pid === "string" && packetIdSet.has(pid);
    });

    // Source forms (from definition metadata) + step forms, for display names.
    const formIds = new Set<string>();
    for (const d of definitions) {
        const sid = d.metadata?.source_form_definition_id;
        if (typeof sid === "string") formIds.add(sid);
    }
    for (const it of items) formIds.add(it.form_definition_id);

    let forms: PosFormNameRow[] = [];
    if (formIds.size > 0) {
        const { data: formRows, error: formErr } = await supabase
            .from("form_definitions")
            .select("id, name")
            .eq("org_id", ctx.orgId)
            .in("id", [...formIds]);
        if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
        forms = (formRows ?? []) as PosFormNameRow[];
    }

    const summaries = buildPosPacketReadModel({ definitions, items, forms, links, sessions });
    return jsonData(summaries);
}
