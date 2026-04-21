import { NextRequest, NextResponse } from "next/server";
import { applyTenantBootstrap } from "@/lib/admin/tenantBootstrap/applyTenantBootstrap";
import { previewTenantBootstrap } from "@/lib/admin/tenantBootstrap/previewTenantBootstrap";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

type Body = {
    mode?: string;
    payload?: unknown;
};

/**
 * POST /api/admin/tenant-bootstrap
 * Body: { mode: "preview" | "apply", payload: TenantBootstrapPayloadV1 }
 *
 * Wraps vertical-bootstrap with org/growth/scaffold intent. Apply persists structural_config only.
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Body = {};
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const mode = body.mode === "apply" ? "apply" : body.mode === "preview" ? "preview" : null;
    if (!mode) {
        return NextResponse.json({ error: "mode must be preview or apply" }, { status: 400 });
    }
    if (body.payload === undefined) {
        return NextResponse.json({ error: "payload is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (mode === "preview") {
        const result = await previewTenantBootstrap(supabase, ctx.orgId, body.payload);
        return NextResponse.json(result);
    }

    const applied = await applyTenantBootstrap(supabase, ctx.orgId, body.payload);
    if (!applied.ok) {
        return NextResponse.json({ error: applied.error }, { status: 400 });
    }

    logAdminAudit({
        entity: "tenant_bootstrap",
        id: ctx.orgId,
        changed_fields: ["apply", "summary"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ ok: true, summary: applied.summary });
}
