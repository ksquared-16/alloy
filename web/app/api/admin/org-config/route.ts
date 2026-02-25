import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";

/** GET: return org config for admin UI (e.g. config_locked for banner and disabling writes). */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const config_locked = await getOrgConfigLocked(ctx.orgId);

    return NextResponse.json({ config_locked });
}

/** PATCH: update org config (e.g. config_locked). Admin only. */
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

    let body: { config_locked?: boolean } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.config_locked !== "boolean") {
        return NextResponse.json(
            { error: "config_locked must be a boolean" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const { error } = await supabase
        .from("orgs")
        .update({ config_locked: body.config_locked })
        .eq("id", ctx.orgId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config_locked: body.config_locked });
}
