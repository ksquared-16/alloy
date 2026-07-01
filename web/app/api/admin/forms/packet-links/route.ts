import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";

function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host?.trim()) return null;
    const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host.trim()}`;
}

/** POST /api/admin/forms/packet-links — mint a single-recipient packet public link (first step anchors form_public_links row). */
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

    const supabase = createAdminClient();
    const result = await mintPacketPublicLinkForAdmin({
        supabase,
        orgId: ctx.orgId,
        embedBaseUrl: deriveEmbedBaseUrl(request),
        body,
    });

    if (!result.ok) {
        if (result.status === 500) return NextResponse.json({ error: result.message }, { status: 500 });
        return jsonError(result.message, result.status);
    }
    return jsonData(result.data, { status: 201 });
}
