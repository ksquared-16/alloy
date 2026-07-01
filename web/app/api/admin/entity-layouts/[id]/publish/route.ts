/**
 * Layout V2 — publish a draft (admin only).
 *
 *   POST /api/admin/entity-layouts/[id]/publish
 *
 * Re-validates the stored doc, then flips status → published and stamps
 * published_at. Publishing does NOT cause any live runtime adoption; the live
 * renderers still ignore Layout V2 in this foundation sprint. The resolver will
 * pick the highest published version once adoption is switched on later.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getLayoutById, publishLayout } from "@/lib/layout/entityLayoutsRepo";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isLayoutV2ConfigEnabledServer()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    try {
        const supabase = createAdminClient();
        const record = await getLayoutById(supabase, id);
        if (!record || record.orgId !== ctx.orgId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (record.status === "published") {
            return NextResponse.json({ error: "Already published" }, { status: 409 });
        }

        // Validate before publishing — a published doc must be renderable.
        const parsed = parseLayoutDoc(record.doc, { inferSurfaceKey: true });
        if (!parsed.ok) {
            return NextResponse.json({ error: "Cannot publish invalid doc", details: parsed.errors }, { status: 400 });
        }

        const published = await publishLayout(supabase, id);
        logAdminAudit({
            entity: "entity_layouts",
            id,
            changed_fields: ["published", `v${published.version}`],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return NextResponse.json(published);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
}
