import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbListPacketDefinitionKeys } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";

const KEY_RE = /^[a-z][a-z0-9_]{1,62}$/;

/**
 * GET /api/admin/forms/packet-definitions — list packet definitions for org.
 *
 * Deactivated packets are HIDDEN by default, the same way archived Forms already are.
 *
 * A packet is never deleted here — sessions reference it and that history has to survive — so
 * "retired" is expressed as `is_active = false`. Listing those alongside live ones made Packet
 * Studio a pile of certification leftovers an operator had to sort through to find the one packet
 * that is actually theirs, which is a browse problem, not a data problem.
 *
 * `include_inactive=true` still returns them for tooling and for any surface that deliberately
 * wants to show retired packets; nothing an operator browses passes it.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_packet_definitions")
        .select("id, org_id, key, name, description, is_active, metadata, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []).filter(
        (r) => includeInactive || (r as { is_active?: boolean }).is_active !== false,
    );
    if (rows.length === 0) return jsonData([]);

    /*
     * What each packet ASKS FOR, on its card.
     *
     * "Enrollment Paperwork 2026–2027" alone does not tell an operator whether they are looking at
     * the right thing; "3 steps · Admissions Information · Family Handbook · Immunization record"
     * does. One grouped read for the whole list rather than a fetch per card.
     */
    const ids = rows.map((r) => (r as { id: string }).id);
    const { data: items } = await supabase
        .from("form_packet_items")
        .select("packet_definition_id, sequence_index, metadata")
        .eq("org_id", ctx.orgId)
        .in("packet_definition_id", ids)
        .order("sequence_index", { ascending: true });

    const stepsByPacket = new Map<string, string[]>();
    for (const raw of (items ?? []) as Array<{
        packet_definition_id: string;
        metadata?: Record<string, unknown> | null;
    }>) {
        const label = typeof raw.metadata?.step_label === "string" ? raw.metadata.step_label.trim() : "";
        const list = stepsByPacket.get(raw.packet_definition_id) ?? [];
        // An unlabelled step still counts — it is a step the family will meet.
        list.push(label);
        stepsByPacket.set(raw.packet_definition_id, list);
    }

    return jsonData(
        rows.map((r) => {
            const labels = stepsByPacket.get((r as { id: string }).id) ?? [];
            return {
                ...(r as Record<string, unknown>),
                step_count: labels.length,
                step_labels: labels.filter(Boolean),
            };
        }),
    );
}

/** POST /api/admin/forms/packet-definitions — create packet definition (admin only). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const explicitKey = typeof body.key === "string" ? body.key.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return jsonError("name is required", 400);

    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;
    const metadata =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

    const supabase = createAdminClient();

    let key = explicitKey;
    if (!key) {
        try {
            const taken = await dbListPacketDefinitionKeys(supabase, ctx.orgId);
            const base = slugKeyFromDisplayName(name);
            key = allocateUniqueKey(base, taken);
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "Key allocation failed" }, { status: 500 });
        }
    }
    if (!KEY_RE.test(key)) {
        return jsonError("key must be lowercase letters, digits, underscore; start with a letter (2–63 chars)", 400);
    }

    const { data, error } = await supabase
        .from("form_packet_definitions")
        .insert({
            org_id: ctx.orgId,
            key,
            name,
            description,
            is_active,
            metadata: { ...metadata, created_via: "adminV2_packet_definitions" },
        })
        .select("id, org_id, key, name, description, is_active, metadata, created_at, updated_at")
        .single();

    if (error) {
        if (error.code === "23505") return jsonError("A packet with this key already exists", 409);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data, { status: 201 });
}
