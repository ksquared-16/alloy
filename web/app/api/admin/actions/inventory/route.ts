import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type InventoryRow = {
    definition: {
        id: string;
        org_id: string | null;
        key: string;
        label: string;
        action_type: string;
        entity_type: string | null;
        is_active: boolean;
        condition_config: unknown;
        payload_schema: unknown;
        workflow_id: string | null;
    };
    placement: {
        id: string;
        org_id: string | null;
        surface: string;
        slot: string;
        entity_type: string | null;
        section_key: string | null;
        department_id: string | null;
        work_unit_id: string | null;
        order_index: number;
        display_style: string;
        is_active: boolean;
        condition_config: unknown;
    };
};

/** GET /api/admin/actions/inventory — read-only registry inventory (definitions + placements). */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const surface = searchParams.get("surface")?.trim() || null;
    const entityType = searchParams.get("entity_type")?.trim() || null;

    const supabase = createAdminClient();

    let pQuery = supabase
        .from("action_placements")
        .select(
            [
                "id",
                "org_id",
                "action_definition_id",
                "surface",
                "slot",
                "entity_type",
                "section_key",
                "department_id",
                "work_unit_id",
                "order_index",
                "display_style",
                "is_active",
                "condition_config",
            ].join(",")
        )
        .or(`org_id.is.null,org_id.eq.${ctx.orgId}`)
        .order("surface", { ascending: true })
        .order("slot", { ascending: true })
        .order("order_index", { ascending: true });

    if (surface) pQuery = pQuery.eq("surface", surface);
    if (entityType) pQuery = pQuery.eq("entity_type", entityType);

    type PlacementRow = {
        id: string;
        org_id: string | null;
        action_definition_id: string;
        surface: string;
        slot: string;
        entity_type: string | null;
        section_key: string | null;
        department_id: string | null;
        work_unit_id: string | null;
        order_index: number;
        display_style: string;
        is_active: boolean;
        condition_config: unknown;
    };

    const { data: placementsRaw, error: pErr } = await pQuery;
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const placements = (placementsRaw ?? []) as unknown as PlacementRow[];
    const defIds = Array.from(new Set(placements.map((p) => String(p.action_definition_id ?? "")))).filter(Boolean);

    type DefRow = {
        id: string;
        org_id: string | null;
        key: string;
        label: string;
        action_type: string;
        entity_type: string | null;
        is_active: boolean;
        condition_config: unknown;
        payload_schema: unknown;
        workflow_id: string | null;
    };

    const { data: defsRaw, error: dErr } = await supabase
        .from("action_definitions")
        .select(
            [
                "id",
                "org_id",
                "key",
                "label",
                "action_type",
                "entity_type",
                "is_active",
                "condition_config",
                "payload_schema",
                "workflow_id",
            ].join(",")
        )
        .in("id", defIds.length ? defIds : ["00000000-0000-0000-0000-000000000000"])
        .or(`org_id.is.null,org_id.eq.${ctx.orgId}`);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

    const defs = (defsRaw ?? []) as unknown as DefRow[];
    const defsById = new Map<string, DefRow>();
    for (const d of defs) defsById.set(String(d.id), d);

    const rows: InventoryRow[] = [];
    for (const p of placements) {
        const pid = String(p.action_definition_id ?? "");
        const def = defsById.get(pid);
        if (!def) continue;
        rows.push({
            definition: {
                id: String(def.id),
                org_id: def.org_id ? String(def.org_id) : null,
                key: String(def.key),
                label: String(def.label),
                action_type: String(def.action_type),
                entity_type: def.entity_type ? String(def.entity_type) : null,
                is_active: Boolean(def.is_active),
                condition_config: def.condition_config,
                payload_schema: def.payload_schema,
                workflow_id: def.workflow_id ? String(def.workflow_id) : null,
            },
            placement: {
                id: String(p.id),
                org_id: p.org_id ? String(p.org_id) : null,
                surface: String(p.surface),
                slot: String(p.slot),
                entity_type: p.entity_type ? String(p.entity_type) : null,
                section_key: p.section_key ? String(p.section_key) : null,
                department_id: p.department_id ? String(p.department_id) : null,
                work_unit_id: p.work_unit_id ? String(p.work_unit_id) : null,
                order_index: Number(p.order_index),
                display_style: String(p.display_style),
                is_active: Boolean(p.is_active),
                condition_config: p.condition_config,
            },
        });
    }

    return NextResponse.json({ items: rows });
}

