/**
 * Layout V2 — rollback to a prior published LayoutDoc.
 *
 *   POST /api/admin/entity-layouts/[id]/rollback
 *
 * Creates a new draft from the source row's doc and publishes it immediately.
 * Does not mutate the source row or any historical version.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { getLayoutById, rollbackLayoutFromVersion } from "@/lib/layout/entityLayoutsRepo";

function notFound() {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isLayoutV2ConfigEnabledServer()) return notFound();

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    try {
        const supabase = createAdminClient();
        const source = await getLayoutById(supabase, id);
        if (!source || source.orgId !== ctx.orgId) {
            return notFound();
        }
        if (source.status !== "published") {
            return NextResponse.json({ error: "Rollback source must be a published layout version" }, { status: 400 });
        }

        const parsed = parseLayoutDoc(source.doc, { inferSurfaceKey: true });
        if (!parsed.ok || !parsed.doc) {
            return NextResponse.json(
                { error: "Source layout doc is invalid", details: parsed.errors },
                { status: 400 },
            );
        }

        const result = await rollbackLayoutFromVersion(supabase, {
            source: { ...source, doc: parsed.doc },
            orgId: ctx.orgId,
            createdBy: ctx.userId,
        });

        logAdminAudit({
            entity: "entity_layouts",
            id: result.published.id,
            changed_fields: ["rollback", `from:${source.id}`, `v${result.published.version}`],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });

        return NextResponse.json({
            rolled_back_from: { id: source.id, version: source.version },
            published: result.published,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
}
