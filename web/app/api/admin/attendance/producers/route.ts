/**
 * External attendance producer administration — inventory.
 *
 * Generic administration over a generic foundation. Listing a producer asserts
 * nothing about whether a named provider integration exists; that claim is made
 * only by `providerIntegrationNotice`, and only in the negative.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { listProducersForOrg } from "@/lib/childcareOperational/attendance/integration/producerAdministration";

export async function GET() {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    try {
        const producers = await listProducersForOrg(createAdminClient(), auth.access.orgId);
        return NextResponse.json({ producers });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to load producers" },
            { status: 500 },
        );
    }
}
