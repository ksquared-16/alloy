import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { patchIdentity } from "@/lib/communications/identity/admin/identityAdminService";
import { requireIdentityPlatformAdmin } from "@/lib/communications/identity/admin/requireIdentityPlatformAdmin";

export async function PATCH(req: Request, { params }: { params: Promise<{ identityId: string }> }) {
    const forbidden = await requireIdentityPlatformAdmin();
    if (forbidden) return forbidden;
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const { identityId } = await params;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await patchIdentity({
        supabase,
        orgId: ctx.orgId,
        identityId,
        patch: {
            display_name: typeof body.display_name === "string" ? body.display_name : body.display_name === null ? null : undefined,
            status: body.status === "active" || body.status === "disabled" ? body.status : undefined,
            inbound_enabled: typeof body.inbound_enabled === "boolean" ? body.inbound_enabled : undefined,
            outbound_enabled: typeof body.outbound_enabled === "boolean" ? body.outbound_enabled : undefined,
            default_access_mode:
                body.default_access_mode === "explicit_grants_required" || body.default_access_mode === "open_until_restricted"
                    ? body.default_access_mode
                    : undefined,
        },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ identity: result.identity });
}
