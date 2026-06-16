/**
 * Surface layout registry — admin read API.
 *
 *   GET /api/admin/surface-layouts/registry
 */

import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { buildSurfaceLayoutRegistryResponse } from "@/lib/layout/surfaceLayoutRegistry";

function notFound() {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
    if (!isLayoutV2ConfigEnabledServer()) return notFound();

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    return NextResponse.json(buildSurfaceLayoutRegistryResponse());
}
