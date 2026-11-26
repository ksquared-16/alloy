import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { hydrateActionLinkDisplay } from "@/lib/actionLinkDisplayDetails";

/**
 * GET /api/action/[token] — read-only metadata for an action link.
 * Returns 404 if not found, 410 if expired, 409 if already consumed.
 * Does NOT consume or emit events.
 * Includes `metadata` (jsonb snapshot) and `details` (hydrated schedule/job/location).
 */
export async function GET(
    _request: Request,
    context: { params: Promise<{ token: string }> }
) {
    const { token } = await context.params;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("action_links")
        .select("id, org_id, action_type, entity_type, entity_id, expires_at, consumed_at, created_at, metadata")
        .eq("token_hash", hashFormLinkToken(token))
        .single();

    if (error || !row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const r = row as {
        id: string;
        org_id: string | null;
        action_type: string;
        entity_type: string;
        entity_id: string;
        expires_at: string;
        consumed_at: string | null;
        created_at: string;
        metadata: unknown;
    };

    if (r.consumed_at) {
        return NextResponse.json({ error: "Already consumed" }, { status: 409 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ error: "Expired" }, { status: 410 });
    }

    const details = await hydrateActionLinkDisplay(supabase, {
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        link_metadata: r.metadata,
    });

    return NextResponse.json({
        id: r.id,
        org_id: r.org_id,
        action_type: r.action_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        expires_at: r.expires_at,
        consumed_at: r.consumed_at,
        created_at: r.created_at,
        metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
        details,
    });
}
