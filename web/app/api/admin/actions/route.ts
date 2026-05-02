import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ActionSurface } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";

const SURFACES = new Set<ActionSurface>([
    "record_header",
    "record_section",
    "queue_row",
    "work_unit",
    "department",
    "workspace",
    "right_rail",
]);

/** GET /api/admin/actions — resolve config-driven actions for a UI surface. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const surface = (searchParams.get("surface") ?? "").trim() as ActionSurface;
    if (!surface || !SURFACES.has(surface)) {
        return NextResponse.json({ error: "Invalid or missing surface" }, { status: 400 });
    }

    const entityType = searchParams.get("entity_type")?.trim() || null;
    const entityId = searchParams.get("entity_id")?.trim() || null;
    const departmentId = searchParams.get("department_id")?.trim() || null;
    const workUnitId = searchParams.get("work_unit_id")?.trim() || null;
    const sectionKey = searchParams.get("section_key")?.trim() || null;

    if (surface === "record_section") {
        if (!entityId || !sectionKey) {
            return NextResponse.json(
                { error: "record_section requires entity_id and section_key" },
                { status: 400 }
            );
        }
    }

    const t0 = Date.now();
    try {
        const orgTag = adminActionsOrgTag(ctx.orgId);
        /** Shorter TTL when entity-specific conditions apply; longer for shared queue-row templates. */
        const revalidateSec = entityId ? 6 : 40;
        const actions = await unstable_cache(
            async () => {
                const supabase = createAdminClient();
                return resolveActionsForContext(supabase, {
                    orgId: ctx.orgId,
                    surface,
                    entityType,
                    entityId,
                    departmentId,
                    workUnitId,
                    sectionKey,
                });
            },
            [
                "admin-actions-resolve",
                ctx.orgId,
                surface,
                entityType ?? "-",
                entityId ?? "-",
                departmentId ?? "-",
                workUnitId ?? "-",
                sectionKey ?? "-",
            ],
            { revalidate: revalidateSec, tags: [orgTag] }
        )();
        const ms = Date.now() - t0;
        if (ms > 120) {
            console.warn("[admin-timing] GET /api/admin/actions", {
                ms,
                surface,
                entity_id: entityId,
                work_unit_id: workUnitId,
            });
        }
        return NextResponse.json({ actions });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[GET /api/admin/actions]", msg);
        return NextResponse.json({ actions: emptyResolvedActionsBySlot(), error: msg }, { status: 500 });
    }
}
