import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { loadPublicBrandLayers } from "@/lib/branding/loadPublicBrand";
import { resolveEffectivePublicBrand } from "@/lib/branding/publicBrand";
import { hasPublicBrandOrganizationCapability } from "@/lib/access/publicBrandAuthority";
import { hasToursCapability, TOURS_CONFIGURE } from "@/lib/access/toursAuthority";
import { loadPublishedTourCalendarForm } from "@/lib/tours/publicCalendar/publishedTourCalendarBrand";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/public-brand?location_id=
 *
 * The organization brand, the location's override and the effective result with each field's source,
 * so the Tours settings can say "inherited from the organization" or "set for this location".
 *
 * At a location with a published tour calendar, `published_form` is the form that calendar opens into
 * and `effective` includes that form's own brand layer — exactly what the public tour page resolves
 * (form → location → organization → platform). `effective_without_form` is what a form that sets no
 * brand of its own would show.
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

    const supabase = createAdminClient();
    const layers = await loadPublicBrandLayers(supabase, { orgId: ctx.orgId, locationId });
    if (locationId && layers.location == null) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    const publishedForm = locationId ? await loadPublishedTourCalendarForm(supabase, { orgId: ctx.orgId, locationId }) : null;
    return NextResponse.json({
        organization: layers.organization,
        location: layers.location,
        published_form: publishedForm,
        effective: resolveEffectivePublicBrand({ form: publishedForm?.formLayer ?? null, ...layers }),
        effective_without_form: resolveEffectivePublicBrand(layers),
        can_edit_organization: access.ok && hasPublicBrandOrganizationCapability(access),
        can_edit_location: access.ok && hasToursCapability(access, TOURS_CONFIGURE),
    });
}
