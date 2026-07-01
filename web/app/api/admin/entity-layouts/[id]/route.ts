/**
 * Layout V2 — admin API (single record).
 *
 *   GET    /api/admin/entity-layouts/[id]   → fetch one row
 *   PATCH  /api/admin/entity-layouts/[id]   → edit a DRAFT's name/doc (admin only)
 *   DELETE /api/admin/entity-layouts/[id]   → delete a row (admin only)
 *
 * Published rows are immutable (publish a new draft version instead). Foundation
 * only — no live runtime impact.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { deleteLayout, getLayoutById, updateDraft } from "@/lib/layout/entityLayoutsRepo";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import type { SupabaseClient } from "@supabase/supabase-js";

function notFound() {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function loadOwned(
    id: string,
    orgId: string,
): Promise<{ supabase: SupabaseClient; record: EntityLayoutRecord | null }> {
    const supabase = createAdminClient();
    const record = await getLayoutById(supabase, id);
    // Org isolation: never expose another org's row. Default rows (orgId null)
    // are read-only system seeds and are not editable through this route.
    if (!record || record.orgId !== orgId) return { supabase, record: null };
    return { supabase, record };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isLayoutV2ConfigEnabledServer()) return notFound();
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const { id } = await params;
    try {
        const { record } = await loadOwned(id, ctx.orgId);
        if (!record) return notFound();
        return NextResponse.json(record);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isLayoutV2ConfigEnabledServer()) return notFound();
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const { supabase, record } = await loadOwned(id, ctx.orgId);
        if (!record) return notFound();
        if (record.status === "published") {
            return NextResponse.json(
                { error: "Published layouts are immutable. Create a new draft version to edit." },
                { status: 409 },
            );
        }

        const patch: { name?: string; doc?: LayoutDoc } = {};
        if (typeof body.name === "string") patch.name = body.name.trim();
        if (body.doc !== undefined) {
            const parsed = parseLayoutDoc(body.doc, { inferSurfaceKey: true });
            if (!parsed.ok || !parsed.doc) {
                return NextResponse.json({ error: "Invalid layout doc", details: parsed.errors }, { status: 400 });
            }
            patch.doc = parsed.doc;
        }
        if (patch.name === undefined && patch.doc === undefined) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        const updated = await updateDraft(supabase, id, patch);
        logAdminAudit({
            entity: "entity_layouts",
            id,
            changed_fields: Object.keys(patch),
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return NextResponse.json(updated);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isLayoutV2ConfigEnabledServer()) return notFound();
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    try {
        const { supabase, record } = await loadOwned(id, ctx.orgId);
        if (!record) return notFound();
        await deleteLayout(supabase, id);
        logAdminAudit({
            entity: "entity_layouts",
            id,
            changed_fields: ["deleted"],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
}
