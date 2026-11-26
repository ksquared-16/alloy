import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { TOURS_CONFIGURE, requireToursCapability } from "@/lib/access/toursAuthority";
import { validatePublicBrandInput } from "@/lib/branding/publicBrand";
import { writeLocationPublicBrand } from "@/lib/branding/writePublicBrand";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/admin/public-brand/locations/[locationId] — a location's override of the organization
 * brand, edited with its tour settings. Empty fields inherit. Body: `{ brand }`.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ locationId: string }> }) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_CONFIGURE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { locationId } = await params;
    if (!UUID_RE.test(String(locationId ?? ""))) return NextResponse.json({ error: "Invalid location id" }, { status: 400 });
    let body: { brand?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = validatePublicBrandInput(body.brand);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeLocationPublicBrand(createAdminClient(), ctx.orgId, locationId, parsed.values);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ brand: parsed.values });
}
