import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";

/**
 * GET: return entity labels for admin UI (e.g. customer_members → plural/singular).
 * No DB table yet; returns defaults. Later can scope by org and read from entity_labels table.
 */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const labels: Record<string, { singular?: string; plural?: string }> = {
        customer_members: { singular: "Member", plural: "Members" },
    };

    return NextResponse.json({ labels });
}

/**
 * PUT: update entity labels. Admin only. Returns 403 if org config is locked.
 */
export async function PUT(request: NextRequest) {
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
        { error: "Entity labels write not yet implemented" },
        { status: 501 }
    );
}

/**
 * DELETE: delete entity label. Admin only. Returns 403 if org config is locked.
 */
export async function DELETE(request: NextRequest) {
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

    return NextResponse.json(
        { error: "Entity labels delete not yet implemented" },
        { status: 501 }
    );
}
