import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { generateSecureFormLinkPlaintext } from "@/lib/admin/forms/formPublicLinkToken";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { fetchOpportunityForTourAdmin, assertBookingLocationMatchesOpportunity } from "@/lib/tours/admin/opportunityTourContext";

type Body = {
    opportunity_id?: string;
    location_id?: string;
    expires_at?: string | null;
};

/** POST /api/admin/tours/public-booking-links — returns plaintext token once (Card 7). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const opportunityId = String(body.opportunity_id ?? "").trim();
    const locationId = String(body.location_id ?? "").trim();
    if (!opportunityId || !locationId) {
        return NextResponse.json({ error: "opportunity_id and location_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const oppRes = await fetchOpportunityForTourAdmin(supabase, ctx.orgId, opportunityId);
    if (!oppRes.ok) return NextResponse.json({ error: oppRes.message }, { status: oppRes.status });

    const locCheck = assertBookingLocationMatchesOpportunity(oppRes.row, locationId);
    if (!locCheck.ok) return NextResponse.json({ error: locCheck.message }, { status: 400 });

    const { data: locRow } = await supabase.from("locations").select("id").eq("id", locationId).eq("org_id", ctx.orgId).maybeSingle();
    if (!locRow) return NextResponse.json({ error: "Location not found for org" }, { status: 400 });

    const plaintextToken = generateSecureFormLinkPlaintext();
    const token_hash = hashFormLinkToken(plaintextToken);
    const token_prefix = plaintextToken.length > 12 ? plaintextToken.slice(0, 12) : plaintextToken;

    const expires_at =
        body.expires_at === null || body.expires_at === undefined || body.expires_at === ""
            ? null
            : String(body.expires_at).trim() || null;

    const { data: row, error } = await supabase
        .from("tour_public_booking_links")
        .insert({
            org_id: ctx.orgId,
            token_hash,
            token_prefix,
            opportunity_id: opportunityId,
            location_id: locationId,
            expires_at,
            is_active: true,
            metadata: {},
        })
        .select("id, org_id, opportunity_id, location_id, expires_at, is_active, created_at, token_prefix")
        .single();

    if (error || !row) {
        return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 400 });
    }

    return NextResponse.json({
        ...row,
        plaintext_token: plaintextToken,
        public_path: `/tour-booking/${encodeURIComponent(plaintextToken)}`,
    });
}
