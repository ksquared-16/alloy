import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import { resolveIntakeRecordResolution } from "@/lib/intake/resolve/resolveIntakeRecordResolution";

type RecordResolutionBody = {
    household?: IntakeHouseholdCandidate;
    source_kind?: string;
    source_id?: string;
    location_id?: string | null;
};

/** POST — canonical intake record resolution (source-agnostic). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: RecordResolutionBody;
    try {
        body = (await request.json()) as RecordResolutionBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const household = body.household;
    if (!household?.household_id) {
        return NextResponse.json({ error: "household is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await resolveIntakeRecordResolution(supabase, {
        orgId: ctx.orgId,
        source_kind: body.source_kind?.trim() || "create_lead",
        source_id: body.source_id?.trim() || undefined,
        household,
        location_id: body.location_id ?? household.location?.resolved_value ?? null,
    });

    return NextResponse.json({ result });
}
