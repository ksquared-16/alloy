import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";
import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";

/**
 * The origin these public/embed links are built on.
 *
 * It is read from the ONE canonical public-origin authority and NOT from the request.
 * These links are copied into emails, texts and third-party pages, so their origin has to
 * be a property of the environment rather than of whichever host the operator's browser
 * happened to reach — and a `Host` / `X-Forwarded-Host` header is caller-supplied, so
 * deriving from it let a spoofed header choose where a recipient's link points.
 */
function deriveEmbedBaseUrl(): string | null {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : null;
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
        embedBaseUrl: deriveEmbedBaseUrl(),
        body,
    });

    if (!result.ok) {
        if (result.status === 500) return NextResponse.json({ error: result.message }, { status: 500 });
        return jsonError(result.message, result.status);
    }
    return jsonData(result.data, { status: 201 });
}
