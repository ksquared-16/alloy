import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { loadPublicBrandLayers } from "@/lib/branding/loadPublicBrand";
import { resolveEffectivePublicBrand } from "@/lib/branding/publicBrand";
import { hasPublicBrandOrganizationCapability } from "@/lib/access/publicBrandAuthority";
import { hasToursCapability, TOURS_CONFIGURE } from "@/lib/access/toursAuthority";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/public-brand?location_id=
 *
 * The organization brand, the location's override and the effective result with each field's source,
 * so the Tours settings can say "inherited from the organization" or "set for this location".
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const access = await getAdminAccessContextCached();

    const raw = new URL(request.url).searchParams.get("location_id");
    const locationId = raw && UUID_RE.test(raw) ? raw : null;
    if (raw && !locationId) return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });

    const layers = await loadPublicBrandLayers(createAdminClient(), { orgId: ctx.orgId, locationId });
    if (locationId && layers.location == null) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    return NextResponse.json({
        organization: layers.organization,
        location: layers.location,
        effective: resolveEffectivePublicBrand(layers),
        can_edit_organization: access.ok && hasPublicBrandOrganizationCapability(access),
        can_edit_location: access.ok && hasToursCapability(access, TOURS_CONFIGURE),
    });
}
