import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { hydrateActionLinkDisplay } from "@/lib/actionLinkDisplayDetails";

/**
 * GET /api/action-links/resolve?token=...
 * Returns { valid, action_type?, entity_type?, entity_id?, expires_at?, consumed_at?, details? }.
 * valid is true only when the link exists, is not consumed, and is not expired.
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token");
    if (!token?.trim()) {
        return NextResponse.json({ valid: false }, { status: 200 });
    }

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, expires_at, consumed_at, metadata")
        .eq("token_hash", hashFormLinkToken(token.trim()))
        .single();

    if (error || !row) {
        return NextResponse.json({ valid: false }, { status: 200 });
    }

    const r = row as {
        id: string;
        action_type: string;
        entity_type: string;
        entity_id: string;
        expires_at: string;
        consumed_at: string | null;
        metadata: unknown;
    };

    const valid = !r.consumed_at && new Date(r.expires_at) > new Date();

    const details = await hydrateActionLinkDisplay(supabase, {
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        link_metadata: r.metadata,
    });

    return NextResponse.json({
        valid,
        action_type: r.action_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        expires_at: r.expires_at,
        consumed_at: r.consumed_at,
        details,
    });
}
