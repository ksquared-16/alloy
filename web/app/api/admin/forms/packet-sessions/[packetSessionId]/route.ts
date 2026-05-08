import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/packet-sessions/[packetSessionId] — session detail + steps for AdminV2. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ packetSessionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { packetSessionId: rawId } = await params;
    const packetSessionId = parseUuidParam(rawId, "packetSessionId");
    if (packetSessionId instanceof NextResponse) return packetSessionId;

    const supabase = createAdminClient();

    const { data: session, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select(
            `
        *,
        form_packet_definitions ( id, name, key )
      `
        )
        .eq("id", packetSessionId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!session) return jsonError("Not found", 404);

    const { data: items, error: iErr } = await supabase
        .from("form_packet_session_items")
        .select("id, sequence_index, status, submitted_at, form_submission_id, packet_item_id, skip_reason")
        .eq("packet_session_id", packetSessionId)
        .eq("org_id", ctx.orgId)
        .order("sequence_index", { ascending: true });

    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    const packetItemIds = [...new Set((items ?? []).map((r: { packet_item_id: string }) => r.packet_item_id))];
    let defItems: Record<string, { form_definition_id: string }> = {};
    if (packetItemIds.length > 0) {
        const { data: di, error: dErr } = await supabase
            .from("form_packet_items")
            .select("id, form_definition_id")
            .in("id", packetItemIds)
            .eq("org_id", ctx.orgId);
        if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
        for (const row of di ?? []) {
            const r = row as { id: string; form_definition_id: string };
            defItems[r.id] = { form_definition_id: r.form_definition_id };
        }
    }

    const formIds = [...new Set(Object.values(defItems).map((d) => d.form_definition_id))];
    let formNames: Record<string, { name: string; key: string }> = {};
    if (formIds.length > 0) {
        const { data: forms, error: fErr } = await supabase
            .from("form_definitions")
            .select("id, name, key")
            .in("id", formIds)
            .eq("org_id", ctx.orgId);
        if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
        for (const row of forms ?? []) {
            const r = row as { id: string; name: string; key: string };
            formNames[r.id] = { name: r.name, key: r.key };
        }
    }

    const enriched = (items ?? []).map((it: Record<string, unknown>) => {
        const pid = it.packet_item_id as string;
        const fdid = defItems[pid]?.form_definition_id;
        const fname = fdid ? formNames[fdid] : undefined;
        return {
            ...it,
            form_definition_id: fdid ?? null,
            form_name: fname?.name ?? null,
            form_key: fname?.key ?? null,
        };
    });

    return jsonData({
        session,
        items: enriched,
    });
}
