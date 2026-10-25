import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requirePublicBrandOrganizationCapability } from "@/lib/access/publicBrandAuthority";
import { validatePublicBrandInput } from "@/lib/branding/publicBrand";
import { writeOrganizationPublicBrand } from "@/lib/branding/writePublicBrand";

/** PUT /api/admin/public-brand/organization — the organization's default public brand. Body: `{ brand }`. */
export async function PUT(request: NextRequest) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requirePublicBrandOrganizationCapability(access);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: { brand?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = validatePublicBrandInput(body.brand);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeOrganizationPublicBrand(createAdminClient(), ctx.orgId, parsed.values);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ brand: parsed.values });
}
