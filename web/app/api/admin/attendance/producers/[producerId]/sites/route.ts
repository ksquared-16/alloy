/**
 * Which sites an external producer may author attendance for.
 *
 * The grant is the enforcement boundary, not a display filter: the ingest path
 * refuses an event for a site the producer holds no grant on. So adding and
 * removing rows here is a real authority change, and the site is validated
 * against THIS org before it is written.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

type Ctx = { params: Promise<{ producerId: string }> };

async function producerInOrg(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    producerId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("attendance_integration_producers")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", producerId)
        .maybeSingle();
    return Boolean(data);
}

export async function POST(request: NextRequest, context: Ctx) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { producerId } = await context.params;
    const id = typeof producerId === "string" ? producerId.trim() : "";
    if (!id) return NextResponse.json({ error: "producerId required" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const siteLocationId =
        typeof body.site_location_id === "string" ? body.site_location_id.trim() : "";
    if (!siteLocationId) return NextResponse.json({ error: "A site is required" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await producerInOrg(supabase, access.orgId, id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: site } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", access.orgId)
        .eq("location_type", "site")
        .eq("id", siteLocationId)
        .maybeSingle();
    if (!site) {
        return NextResponse.json(
            { error: "That site is not a site location in this organization" },
            { status: 400 },
        );
    }

    const { error } = await supabase.from("attendance_integration_producer_sites").insert({
        org_id: access.orgId,
        producer_id: id,
        site_location_id: siteLocationId,
        created_by: access.userId,
    });
    // The unique constraint makes a repeated grant a no-op rather than a duplicate.
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: Ctx) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { producerId } = await context.params;
    const id = typeof producerId === "string" ? producerId.trim() : "";
    const siteLocationId = (new URL(request.url).searchParams.get("site_location_id") ?? "").trim();
    if (!id || !siteLocationId) {
        return NextResponse.json({ error: "producerId and site_location_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await producerInOrg(supabase, access.orgId, id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase
        .from("attendance_integration_producer_sites")
        .delete()
        .eq("org_id", access.orgId)
        .eq("producer_id", id)
        .eq("site_location_id", siteLocationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
