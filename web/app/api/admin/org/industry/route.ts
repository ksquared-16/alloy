import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";

/**
 * PATCH: update org industry. Admin only. Returns 403 if org config is locked.
 */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locked = await getOrgConfigLocked(ctx.orgId);
    if (locked) {
        return NextResponse.json(
            { error: "Configuration is locked. Unlock in System Settings." },
            { status: 403 }
        );
    }

    await request.json().catch(() => ({}));
    return NextResponse.json(
        { error: "Org industry update not yet implemented" },
        { status: 501 }
    );
}
