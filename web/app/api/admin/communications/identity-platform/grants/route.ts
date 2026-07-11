import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { upsertGrant } from "@/lib/communications/identity/admin/identityAdminService";
import { requireIdentityPlatformAdmin } from "@/lib/communications/identity/admin/requireIdentityPlatformAdmin";
import { loadIdentityResolutionContext } from "@/lib/communications/identity/loadIdentityContext";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const supabase = createAdminClient();
    const resolutionCtx = await loadIdentityResolutionContext(supabase, ctx.orgId);
    return NextResponse.json({
        grants: resolutionCtx.grants.filter((g) => g.status === "active"),
    });
}

export async function POST(req: Request) {
    const forbidden = await requireIdentityPlatformAdmin();
    if (forbidden) return forbidden;
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const identityId = String(body.identity_id ?? "");
    const userId = String(body.user_id ?? "");
    if (!UUID_RE.test(identityId) || !UUID_RE.test(userId)) {
        return NextResponse.json({ error: "identity_id and user_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await upsertGrant({
        supabase,
        orgId: ctx.orgId,
        identityId,
        userId,
        grants: {
            can_send: body.can_send === true,
            can_receive: body.can_receive === true,
            can_configure: body.can_configure === true,
            can_manage: body.can_manage === true,
            can_override_default: body.can_override_default === true,
            can_use_across_locations: body.can_use_across_locations === true,
        },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json({ grant: result.grant });
}

export async function DELETE(req: Request) {
    const forbidden = await requireIdentityPlatformAdmin();
    if (forbidden) return forbidden;
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const grantId = url.searchParams.get("grant_id") ?? "";
    if (!UUID_RE.test(grantId)) return NextResponse.json({ error: "grant_id required" }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
        .from("communication_identity_grants")
        .update({ status: "disabled" })
        .eq("id", grantId)
        .eq("org_id", ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ ok: true });
}
