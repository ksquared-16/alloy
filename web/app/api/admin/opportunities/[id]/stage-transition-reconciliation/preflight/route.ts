import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached } from "@/lib/adminAuth";
import { preflightStageTransitionReconciliation } from "@/lib/lifecycle/preflightStageTransitionReconciliation";

type RouteParams = { params: Promise<{ id: string }> };

/** POST body: { next_status_key: string } */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
    const { id } = await params;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { next_status_key?: string };
    const nextStatusKey = String(body.next_status_key ?? "").trim();
    if (!nextStatusKey) {
        return NextResponse.json({ error: "next_status_key is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, org_id, status_key")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 });
    if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const preflight = await preflightStageTransitionReconciliation({
        supabase,
        orgId: ctx.orgId,
        opportunityId: id,
        previousStatusKey: (opp as { status_key?: string | null }).status_key ?? null,
        nextStatusKey,
    });

    return NextResponse.json({ preflight });
}
