import { NextResponse } from "next/server";

/**
 * Who may set the ORGANIZATION's public brand (name, colour, logo shown to families on every form
 * and tour page that does not override it). It is organization identity, so it is organization
 * settings authority — `settings.manage` — not Tours authority. A location's own override is Tours
 * configuration (`tours.configure`, via `requireToursCapability`).
 */
export const PUBLIC_BRAND_ORGANIZATION_CAPABILITY = "settings.manage" as const;

export function requirePublicBrandOrganizationCapability(ctx: { permissionKeys?: readonly string[] | null }): NextResponse | null {
    if ((ctx.permissionKeys ?? []).includes(PUBLIC_BRAND_ORGANIZATION_CAPABILITY)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: PUBLIC_BRAND_ORGANIZATION_CAPABILITY },
        { status: 403 },
    );
}

export function hasPublicBrandOrganizationCapability(ctx: { permissionKeys?: readonly string[] | null }): boolean {
    return (ctx.permissionKeys ?? []).includes(PUBLIC_BRAND_ORGANIZATION_CAPABILITY);
}
