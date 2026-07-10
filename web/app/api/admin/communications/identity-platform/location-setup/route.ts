import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    getLocationSetup,
    listSanitizedIdentities,
    listSanitizedProviderAccounts,
} from "@/lib/communications/identity/admin/identityAdminService";

export async function GET(req: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const locationId = url.searchParams.get("location_id");
    const supabase = createAdminClient();

    if (locationId) {
        const setup = await getLocationSetup(supabase, ctx.orgId, locationId);
        return NextResponse.json(setup);
    }

    const { data: locations } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", ctx.orgId)
        .eq("location_type", "site")
        .order("label");

    return NextResponse.json({
        locations: locations ?? [],
        identities: await listSanitizedIdentities(supabase, ctx.orgId),
        provider_accounts: await listSanitizedProviderAccounts(supabase, ctx.orgId),
    });
}
