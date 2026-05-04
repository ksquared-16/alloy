import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STATUS_VALUES = new Set(["active", "disabled", "pending_verification"]);

/**
 * PATCH /api/admin/communications/bindings/[bindingId] — safe fields only (no secrets).
 * Updates: display_label, status, is_primary. Org-scoped.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ bindingId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { bindingId } = await params;
    if (!UUID_RE.test(bindingId)) {
        return NextResponse.json({ error: "Invalid binding id" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let touched = false;

    if ("display_label" in body) {
        touched = true;
        const v = body.display_label;
        if (v === null || v === undefined) {
            patch.display_label = null;
        } else if (typeof v === "string") {
            const t = v.trim();
            patch.display_label = t ? t.slice(0, 200) : null;
        } else {
            return NextResponse.json({ error: "display_label must be string or null" }, { status: 400 });
        }
    }

    if ("status" in body) {
        touched = true;
        const s = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
        if (!STATUS_VALUES.has(s)) {
            return NextResponse.json(
                { error: "status must be active, disabled, or pending_verification" },
                { status: 400 },
            );
        }
        patch.status = s;
    }

    if ("is_primary" in body) {
        touched = true;
        if (typeof body.is_primary !== "boolean") {
            return NextResponse.json({ error: "is_primary must be boolean" }, { status: 400 });
        }
        patch.is_primary = body.is_primary;
    }

    if (!touched) {
        return NextResponse.json({ error: "No updatable fields supplied" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: loadErr } = await supabase
        .from("communication_provider_bindings")
        .select("id, org_id, channel")
        .eq("id", bindingId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Binding not found" }, { status: 404 });

    const channel = String((row as { channel?: string }).channel ?? "").trim().toLowerCase();

    if (patch.is_primary === true && channel) {
        const { error: clearErr } = await supabase
            .from("communication_provider_bindings")
            .update({ is_primary: false, updated_at: new Date().toISOString() })
            .eq("org_id", ctx.orgId)
            .eq("channel", channel)
            .neq("id", bindingId);
        if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });
    }

    const { error: updErr } = await supabase
        .from("communication_provider_bindings")
        .update(patch)
        .eq("id", bindingId)
        .eq("org_id", ctx.orgId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
