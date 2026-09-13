/**
 * One trusted kiosk device — rotate its credential, or revoke it.
 *
 * Both actions go through `kioskCredentialRotation`, which is the only module
 * that mints or invalidates a kiosk secret. Rotation REPLACES the hash on the row
 * rather than adding a second valid secret, and revocation makes the credential
 * stop resolving because the device authority refuses any non-active row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import {
    revokeKioskDevice,
    rotateKioskDeviceCredential,
} from "@/lib/childcareOperational/attendance/kiosk/kioskCredentialRotation";

async function deviceInOrg(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    deviceId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("attendance_kiosk_devices")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", deviceId)
        .maybeSingle();
    return Boolean(data);
}

/** POST = rotate the credential. The new secret is returned once. */
export async function POST(_request: NextRequest, context: { params: Promise<{ deviceId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { deviceId } = await context.params;
    const id = typeof deviceId === "string" ? deviceId.trim() : "";
    if (!id) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await deviceInOrg(supabase, access.orgId, id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const outcome = await rotateKioskDeviceCredential(supabase, { orgId: access.orgId, deviceId: id });
    if (!outcome.ok) {
        // `device_not_active` is the substrate refusing to resurrect a revoked
        // device through a rotation, which is a different act entirely.
        const status = outcome.code === "device_not_active" ? 409 : 500;
        const error =
            outcome.code === "device_not_active" ?
                "This device is revoked. Register a new device instead of rotating a revoked one."
            :   "Credential rotation failed";
        return NextResponse.json({ error, code: outcome.code }, { status });
    }

    return NextResponse.json({ ok: true, credential: outcome.secret });
}

/** DELETE = revoke. The row is kept so authored facts keep their provenance. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ deviceId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { deviceId } = await context.params;
    const id = typeof deviceId === "string" ? deviceId.trim() : "";
    if (!id) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await deviceInOrg(supabase, access.orgId, id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await revokeKioskDevice(supabase, {
        orgId: access.orgId,
        deviceId: id,
        revokedBy: access.userId,
    });
    if (!result.ok) return NextResponse.json({ error: "Revoke failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
}
