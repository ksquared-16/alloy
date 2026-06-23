import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData } from "@/lib/admin/forms/formsAdminResponses";
import { FORM_PUBLIC_LINK_SAFE_SELECT } from "@/lib/admin/forms/formsAdminDb";
import {
    buildPosPacketReadModel,
    isPosCreatedPacket,
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
        .not("metadata->>created_via", "is", null)
        .order("created_at", { ascending: false })
        .limit(400);
    if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });

    // Include both POS packet flows (template + composer); filter in JS since the JSON key
    // can't be matched against a set via `.in`.
    const definitions = ((defsRaw ?? []) as PosPacketDefinitionRow[]).filter((d) => isPosCreatedPacket(d.metadata)).slice(0, 200);
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
            .select("id, packet_definition_id, status, operator_review_status, created_at, completed_at, started_via_public_link_id")
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

    // Resolve child + recipient display names for share rows (from link metadata).
    const childIds = new Set<string>();
    const recipientIds = new Set<string>();
    for (const l of links) {
        const m = l.metadata ?? {};
        const c = (m.composer_child_id ?? m.selected_customer_member_id) as unknown;
        const r = (m.composer_recipient_id ?? m.recipient_person_id) as unknown;
        if (typeof c === "string") childIds.add(c);
        if (typeof r === "string") recipientIds.add(r);
    }

    const childLabels: Record<string, string> = {};
    const recipientLabels: Record<string, string> = {};
    const recipientContacts: Record<string, { email: string | null; phone: string | null }> = {};
    if (childIds.size > 0) {
        const { data: cm } = await supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name")
            .eq("org_id", ctx.orgId)
            .in("id", [...childIds]);
        for (const m of (cm ?? []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null }>) {
            childLabels[m.id] = (m.display_name ?? "").trim() || `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || `${m.id.slice(0, 8)}…`;
        }
    }
    if (recipientIds.size > 0) {
        const { data: pp } = await supabase
            .from("persons")
            .select("id, full_name, first_name, last_name, email, phone")
            .eq("org_id", ctx.orgId)
            .in("id", [...recipientIds]);
        for (const p of (pp ?? []) as Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>) {
            recipientLabels[p.id] = (p.full_name ?? "").trim() || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email ?? "").trim() || `${p.id.slice(0, 8)}…`;
            recipientContacts[p.id] = { email: p.email ?? null, phone: p.phone ?? null };
        }
    }

    const summaries = buildPosPacketReadModel({ definitions, items, forms, links, sessions, childLabels, recipientLabels, recipientContacts });
    return jsonData(summaries);
}
