/**
 * Trusted kiosk device administration — inventory and registration.
 *
 * Authorized through the canonical users/roles gate rather than a new
 * Attendance-specific permission: a kiosk is an actor that may author attendance
 * facts, so granting one is an authority change and Access already owns those.
 *
 * The registered secret is returned EXACTLY ONCE, in the POST response. It is
 * never stored readably and no GET can recover it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { listKioskDevicesForOrg } from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAdministration";
import { registerKioskDevice } from "@/lib/childcareOperational/attendance/kiosk/kioskCredentialRotation";

export async function GET() {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;

    try {
        const devices = await listKioskDevicesForOrg(createAdminClient(), auth.access.orgId);
        return NextResponse.json({ devices });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to load devices" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const label = typeof body.label === "string" ? body.label.trim() : "";
    const siteLocationId =
        typeof body.site_location_id === "string" ? body.site_location_id.trim() : "";
    if (!label) return NextResponse.json({ error: "A device name is required" }, { status: 400 });
    if (!siteLocationId) {
        return NextResponse.json({ error: "A site is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // The site is validated against THIS org and must actually be a site. Without
    // this a caller could bind a device to another tenant's location id, and the
    // device authority reads its org from the row it lands in.
    const { data: site, error: siteErr } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", access.orgId)
        .eq("location_type", "site")
        .eq("id", siteLocationId)
        .maybeSingle();
    if (siteErr) return NextResponse.json({ error: siteErr.message }, { status: 500 });
    if (!site) {
        return NextResponse.json(
            { error: "That site is not a site location in this organization" },
            { status: 400 },
        );
    }

    const outcome = await registerKioskDevice(supabase, {
        orgId: access.orgId,
        siteLocationId,
        label,
        createdBy: access.userId,
    });
    if (!outcome.ok) {
        return NextResponse.json({ error: "Device registration failed", code: outcome.code }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        device_id: outcome.record.deviceId,
        // Shown once. There is no second chance to read it, by design.
        credential: outcome.secret,
    });
}
