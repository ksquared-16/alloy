import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    fetchJobDrawerEmailRecipients,
    fetchOpportunityDrawerEmailRecipients,
} from "@/lib/communications/drawerEmailRecipients";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/admin/communications/drawer-recipients — person-first email checklist for drawer composer.
 * Opportunities: opportunity_persons + primary_person_id (persons rows with email).
 * Jobs: customer_persons + optional opportunity_persons + primary_person_id.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const entityTypeRaw = request.nextUrl.searchParams.get("entity_type")?.trim().toLowerCase() ?? "";
    const entityId = request.nextUrl.searchParams.get("entity_id")?.trim() ?? "";

    const entityType = entityTypeRaw === "jobs" ? "jobs" : entityTypeRaw === "opportunities" ? "opportunities" : null;
    if (!entityType) {
        return NextResponse.json({ error: "entity_type must be opportunities or jobs" }, { status: 400 });
    }
    if (!UUID_RE.test(entityId)) {
        return NextResponse.json({ error: "entity_id must be a UUID" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const table = entityType === "jobs" ? "jobs" : "opportunities";
    if (!(await assertRowOrg(supabase, table, entityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const recipients =
        entityType === "jobs"
            ? await fetchJobDrawerEmailRecipients(supabase, ctx.orgId, entityId)
            : await fetchOpportunityDrawerEmailRecipients(supabase, ctx.orgId, entityId);

    return NextResponse.json({
        recipients,
        source_note:
            entityType === "jobs"
                ? "persons from customer_persons (job customer_id), optional opportunity_persons via job.opportunity_id, union primary_person_id; contact never used as recipient anchor"
                : "persons from opportunity_persons union primary_person_id; contact fields never used as recipient anchor",
    });
}
