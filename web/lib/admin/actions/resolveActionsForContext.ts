import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionSurface, ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";

export type ResolveActionsQuery = {
    orgId: string;
    surface: ActionSurface;
    entityType?: string | null;
    entityId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
};

type PlacementRow = {
    id: string;
    surface: string;
    slot: string;
    entity_type: string | null;
    department_id: string | null;
    work_unit_id: string | null;
    order_index: number;
    display_style: string;
    condition_config: Record<string, unknown> | null;
    action_definitions: {
        id: string;
        org_id: string | null;
        key: string;
        label: string;
        description: string | null;
        entity_type: string | null;
        action_type: string;
        icon: string | null;
        style: string | null;
        priority: number;
        condition_config: Record<string, unknown> | null;
        payload_schema: Record<string, unknown> | null;
        workflow_id: string | null;
        is_active: boolean;
    } | null;
};

function normEt(v: string | null | undefined): string | null {
    const s = (v ?? "").trim().toLowerCase();
    return s || null;
}

function passesPlacementScope(
    p: Pick<PlacementRow, "department_id" | "work_unit_id">,
    q: ResolveActionsQuery
): boolean {
    if (p.department_id != null && String(p.department_id).trim() !== "") {
        const d = q.departmentId?.trim();
        if (!d || d !== p.department_id) return false;
    }
    if (p.work_unit_id != null && String(p.work_unit_id).trim() !== "") {
        const w = q.workUnitId?.trim();
        if (!w || w !== p.work_unit_id) return false;
    }
    return true;
}

function passesConditionConfig(
    defCfg: Record<string, unknown> | null | undefined,
    placementCfg: Record<string, unknown> | null | undefined,
    statusKey: string | null
): boolean {
    const cfg = { ...(defCfg ?? {}), ...(placementCfg ?? {}) };
    const eq = cfg.status_key_equals;
    if (eq != null && String(eq).trim() !== "") {
        if ((statusKey ?? "").trim() !== String(eq).trim()) return false;
    }
    const ne = cfg.status_key_not_equals;
    if (ne != null && String(ne).trim() !== "") {
        if ((statusKey ?? "").trim() === String(ne).trim()) return false;
    }
    return true;
}

async function fetchOpportunityStatusKey(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("opportunities")
        .select("status_key")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;
    return (data as { status_key?: string | null }).status_key ?? null;
}

/**
 * Resolve visible actions for an admin UI context (v1: org + global templates, simple conditions).
 */
export async function resolveActionsForContext(
    supabase: SupabaseClient,
    query: ResolveActionsQuery
): Promise<ResolvedActionsBySlot> {
    const out = emptyResolvedActionsBySlot();
    const et = normEt(query.entityType);
    let statusKey: string | null = null;
    if (et === "opportunity" && query.entityId?.trim()) {
        statusKey = await fetchOpportunityStatusKey(supabase, query.orgId, query.entityId.trim());
    }

    const { data: rows, error } = await supabase
        .from("action_placements")
        .select(
            [
                "id",
                "surface",
                "slot",
                "entity_type",
                "department_id",
                "work_unit_id",
                "order_index",
                "display_style",
                "condition_config",
                "action_definitions!inner(id, org_id, key, label, description, entity_type, action_type, icon, style, priority, condition_config, payload_schema, workflow_id, is_active)",
            ].join(", ")
        )
        .eq("surface", query.surface)
        .eq("is_active", true)
        .or(`org_id.is.null,org_id.eq.${query.orgId}`);

    if (error) {
        console.error("[resolveActionsForContext]", error.message);
        return out;
    }

    const list = (rows ?? []) as unknown as PlacementRow[];
    const resolved: ResolvedActionForClient[] = [];

    for (const row of list) {
        const d = row.action_definitions;
        if (!d || !d.is_active) continue;
        if (d.org_id != null && d.org_id !== query.orgId) continue;
        if (row.entity_type != null && String(row.entity_type).trim() !== "" && et != null) {
            if (normEt(row.entity_type) !== et) continue;
        }
        if (d.entity_type != null && String(d.entity_type).trim() !== "" && et != null) {
            if (normEt(d.entity_type) !== et) continue;
        }
        if (!passesPlacementScope(row, query)) continue;
        if (!passesConditionConfig(d.condition_config, row.condition_config, statusKey)) continue;

        const payload = (d.payload_schema && typeof d.payload_schema === "object" ? d.payload_schema : {}) as Record<string, unknown>;
        resolved.push({
            key: d.key,
            label: d.label,
            description: d.description,
            action_type: d.action_type,
            icon: d.icon,
            style: d.style,
            display_style: row.display_style ?? "button",
            payload,
            workflow_id: d.workflow_id,
            _order: row.order_index,
            _slot: row.slot,
        } as ResolvedActionForClient & { _order: number; _slot: string });
    }

    const withMeta = resolved as (ResolvedActionForClient & { _order: number; _slot: string })[];
    withMeta.sort((a, b) => (a._order !== b._order ? a._order - b._order : a.label.localeCompare(b.label)));

    for (const a of withMeta) {
        const slot = a._slot as keyof ResolvedActionsBySlot;
        const { _order: _o, _slot: _s, ...rest } = a;
        void _o;
        void _s;
        if (out[slot]) {
            out[slot].push(rest);
        } else {
            out.overflow.push(rest);
        }
    }

    return out;
}
