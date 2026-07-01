/**
 * Layout V2 — duplicate a layout as a new draft.
 *
 *   POST /api/admin/entity-layouts/[id]/duplicate
 *
 * Copies doc (+ metadata lineage) into a new draft at the next version for the org.
 * Source may be an org row or a system default (org_id NULL).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { duplicateLayoutAsDraft, getLayoutById } from "@/lib/layout/entityLayoutsRepo";

function notFound() {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isLayoutV2ConfigEnabledServer()) return notFound();

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }

    const { id } = await params;
    try {
        const supabase = createAdminClient();
        const source = await getLayoutById(supabase, id);
        if (!source) return notFound();
        if (source.orgId !== null && source.orgId !== ctx.orgId) {
            return notFound();
        }

        const parsed = parseLayoutDoc(source.doc, { inferSurfaceKey: true });
        if (!parsed.ok || !parsed.doc) {
            return NextResponse.json(
                { error: "Source layout doc is invalid", details: parsed.errors },
                { status: 400 },
            );
        }

        const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
        const created = await duplicateLayoutAsDraft(supabase, {
            source: { ...source, doc: parsed.doc },
            orgId: ctx.orgId,
            createdBy: ctx.userId,
            name,
            lineage: {
                duplicated_from_layout_id: source.id,
                based_on_layout_id: source.id,
            },
        });

        logAdminAudit({
            entity: "entity_layouts",
            id: created.id,
            changed_fields: ["duplicated", `from:${source.id}`, `v${created.version}`],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });

        return NextResponse.json(created, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
}
