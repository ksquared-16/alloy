import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ActionSurface } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { SupabaseClient } from "@supabase/supabase-js";

async function resolveLifecycleViewStageKeyForActions(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string | null,
    explicitStageKey: string | null,
): Promise<string | null> {
    if (explicitStageKey) return explicitStageKey;
    const wuId = workUnitId?.trim();
    if (!wuId) return null;
    const { data } = await supabase
        .from("work_units")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("id", wuId)
        // Operator runtime: don't resolve a stage / action placement from an inactive work unit.
        .eq("is_active", true)
        .maybeSingle();
    return stageKeyFromLifecycleWorkUnitMetadata((data as { metadata?: unknown } | null)?.metadata ?? null);
}

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
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = { ok: true as const, orgId: gate.orgId, userId: gate.userId };

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
    const lifecycleViewStageKeyParam = searchParams.get("lifecycle_view_stage_key")?.trim() || null;
    const hintStatusKeyRaw = searchParams.get("hint_opportunity_status_key")?.trim() || null;
    let hintOpportunityMetadata: Record<string, unknown> | null = null;
    const hintMetaRaw = searchParams.get("hint_opportunity_metadata")?.trim() || null;
    if (hintMetaRaw) {
        try {
            const parsed = JSON.parse(hintMetaRaw) as unknown;
            hintOpportunityMetadata = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
        } catch {
            hintOpportunityMetadata = null;
        }
    }

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
        const hintMetaKey = hintOpportunityMetadata ? JSON.stringify(hintOpportunityMetadata) : "-";
        const actions = await unstable_cache(
            async () => {
                const supabase = createAdminClient();
                const lifecycleViewStageKey = await resolveLifecycleViewStageKeyForActions(
                    supabase,
                    ctx.orgId,
                    workUnitId,
                    lifecycleViewStageKeyParam,
                );
                return resolveActionsForContext(supabase, {
                    orgId: ctx.orgId,
                    surface,
                    entityType,
                    entityId,
                    departmentId,
                    workUnitId,
                    sectionKey,
                    hintOpportunityStatusKey: hintStatusKeyRaw,
                    hintOpportunityMetadata,
                    lifecycleViewStageKey,
                });
            },
            [
                "admin-actions-resolve",
                ctx.orgId,
                ctx.userId,
                surface,
                entityType ?? "-",
                entityId ?? "-",
                departmentId ?? "-",
                workUnitId ?? "-",
                sectionKey ?? "-",
                lifecycleViewStageKeyParam ?? "-",
                hintStatusKeyRaw ?? "-",
                hintMetaKey,
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
                used_hint: Boolean(hintStatusKeyRaw),
            });
        }
        return NextResponse.json({ actions });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[GET /api/admin/actions]", msg);
        return NextResponse.json({ actions: emptyResolvedActionsBySlot(), error: msg }, { status: 500 });
    }
}
