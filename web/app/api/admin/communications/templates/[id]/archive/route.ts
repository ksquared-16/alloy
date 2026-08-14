import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Communications V2 — template archive (Phase 1 / B2).
 * Soft archive: status = 'archived'. No row delete, no provider behavior.
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient; org_id scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const TEMPLATE_COLS =
    "id, org_id, name, description, category, channel, status, current_version_id, system_key, created_by, updated_by, created_at, updated_at";

/** POST /api/admin/communications/templates/[id]/archive — set status='archived'. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: existing, error: loadErr } = await supabase
        .from("communication_templates")
        .select("id, system_key")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (typeof existing.system_key === "string" && existing.system_key.trim()) {
        return NextResponse.json(
            {
                error:
                    "This is a required Tour system template. Edit the copy instead of archiving it — Tour commands depend on this template identity.",
            },
            { status: 409 },
        );
    }

    const { data: updated, error } = await supabase
        .from("communication_templates")
        .update({ status: "archived", updated_by: ctx.userId, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select(TEMPLATE_COLS)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    return NextResponse.json({ template: updated });
}
