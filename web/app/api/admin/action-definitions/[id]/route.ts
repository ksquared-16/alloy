import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import { invalidateConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";

/** PATCH org-owned action definition label only (Settings V1). Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const { id } = await context.params;
    const defId = id.trim();
    if (!defId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const label = String((body as { label?: unknown }).label ?? "").trim();
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });
    if (label.length > 120) {
        return NextResponse.json({ error: "label must be at most 120 characters" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("action_definitions")
        .select("id, org_id")
        .eq("id", defId)
        .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const defOrgId = (existing as { org_id?: string | null }).org_id ?? null;
    if (defOrgId == null) {
        return NextResponse.json({ error: "Platform-managed action labels cannot be edited here" }, { status: 403 });
    }
    if (defOrgId !== ctx.orgId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: updated, error: upErr } = await supabase
        .from("action_definitions")
        .update({ label, updated_at: new Date().toISOString() })
        .eq("id", defId)
        .eq("org_id", ctx.orgId)
        .select("id, org_id, key, label, entity_type, action_type, is_active")
        .maybeSingle();

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch {
        /* non-fatal */
    }
    // B — bust the cached `act:` action projection so the Work Unit answer reflects the publish (see B5).
    invalidateConfigReadCache(`act:${ctx.orgId}:`);

    return NextResponse.json({ definition: updated });
}
