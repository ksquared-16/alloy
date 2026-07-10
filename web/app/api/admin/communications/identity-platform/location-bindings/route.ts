import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { upsertLocationBinding, removeLocationBinding } from "@/lib/communications/identity/admin/identityAdminService";
import { requireIdentityPlatformAdmin } from "@/lib/communications/identity/admin/requireIdentityPlatformAdmin";

const UUID_RE = /^[0-9a-f-]{36}$/i;

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

    const locationId = String(body.location_id ?? "");
    const identityId = String(body.identity_id ?? "");
    const channel = String(body.channel ?? "").toLowerCase();
    if (!UUID_RE.test(locationId) || !UUID_RE.test(identityId)) {
        return NextResponse.json({ error: "location_id and identity_id required" }, { status: 400 });
    }
    if (channel !== "sms" && channel !== "email") {
        return NextResponse.json({ error: "channel must be sms or email" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await upsertLocationBinding({
        supabase,
        orgId: ctx.orgId,
        locationId,
        identityId,
        channel,
        isDefault: body.is_default === true,
        priority: typeof body.priority === "number" ? body.priority : undefined,
        inboundRoutingEnabled: body.inbound_routing_enabled !== false,
        outboundSendingEnabled: body.outbound_sending_enabled !== false,
        userId: ctx.userId ?? null,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json({ binding: result.binding });
}

export async function DELETE(req: Request) {
    const forbidden = await requireIdentityPlatformAdmin();
    if (forbidden) return forbidden;
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const bindingId = url.searchParams.get("binding_id") ?? "";
    if (!UUID_RE.test(bindingId)) return NextResponse.json({ error: "binding_id required" }, { status: 400 });

    const supabase = createAdminClient();
    const result = await removeLocationBinding(supabase, ctx.orgId, bindingId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
}
