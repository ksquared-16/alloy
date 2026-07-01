import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";

const ACTIVE = [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS];

/** GET /api/admin/tours/opportunities/[opportunityId]/bookings */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ opportunityId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { opportunityId } = await params;
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return NextResponse.json({ error: "Missing opportunityId" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: opp, error: oErr } = await supabase
        .from("opportunities")
        .select("id")
        .eq("id", oid)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rows, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", oid)
        .order("start_at", { ascending: false })
        .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const activeSet = new Set<string>(ACTIVE);
    const active = (rows ?? []).filter((r) => activeSet.has(String((r as { status_key?: string }).status_key ?? "")));
    return NextResponse.json({ bookings: rows ?? [], active_bookings: active });
}
