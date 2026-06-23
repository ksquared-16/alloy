import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionSurface, ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { enrichResolvedActionForClient } from "@/lib/admin/actions/enrichResolvedActionWithCanonical";
import { filterOpportunityActionsForRuntimeGates } from "@/lib/admin/actions/filterOpportunityActionsForRuntimeGates";
import { stripMakePrimaryContactFromResolvedActionsBySlot } from "@/lib/admin/actions/makePrimaryContactAction";
import { lifecycleBuilderPlacementVisibleOnStage } from "@/lib/lifecycle/lifecycleBuilderActionVisibility";
import { parseLifecycleActionDisplayOrder } from "@/lib/lifecycle/lifecycleStageActionScope";

export type ResolveActionsQuery = {
    orgId: string;
    surface: ActionSurface;
    entityType?: string | null;
    entityId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Required filtering dimension for `record_section` (matches action_placements.section_key). */
    sectionKey?: string | null;
    /**
     * When opening from a record drawer, client may pass opportunity condition hints to skip a duplicate
     * `opportunities` round-trip (must match the row; wrong hints can show transiently wrong actions until refetch).
     */
    hintOpportunityStatusKey?: string | null;
    hintOpportunityMetadata?: Record<string, unknown> | null;
    /** Builder-owned work unit stage key — filters lifecycle-builder-configured stage-scoped placements. */
    lifecycleViewStageKey?: string | null;
};

type PlacementRow = {
    id: string;
    surface: string;
    slot: string;
    org_id: string | null;
    entity_type: string | null;
    department_id: string | null;
    work_unit_id: string | null;
    section_key: string | null;
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

/** Exported for unit tests — evaluates placement + definition condition_config against opportunity context. */
export function evaluateActionPlacementCondition(
    defCfg: Record<string, unknown> | null | undefined,
    placementCfg: Record<string, unknown> | null | undefined,
    statusKey: string | null,
    metadata: Record<string, unknown> | null
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

    const statusIn = cfg.status_key_in;
    if (Array.isArray(statusIn) && statusIn.length > 0) {
        const sk = (statusKey ?? "").trim();
        const allowed = statusIn.map((x) => String(x).trim()).filter(Boolean);
        if (!sk || !allowed.includes(sk)) return false;
    }

    // v1 minimal metadata existence checks (used for Enrollment tour schedule/reschedule).
    const exists = cfg.metadata_field_exists;
    if (exists != null && String(exists).trim() !== "") {
        const key = String(exists).trim();
        const v = metadata ? metadata[key] : undefined;
        if (v == null) return false;
        if (typeof v === "string" && v.trim() === "") return false;
    }
    const missing = cfg.metadata_field_missing;
    if (missing != null && String(missing).trim() !== "") {
        const key = String(missing).trim();
        const v = metadata ? metadata[key] : undefined;
        if (v != null && !(typeof v === "string" && v.trim() === "")) return false;
    }
    return true;
}

async function fetchOpportunityConditionContext(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<{ statusKey: string | null; metadata: Record<string, unknown> | null }> {
    const { data, error } = await supabase
        .from("opportunities")
        .select("status_key, metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return { statusKey: null, metadata: null };
    const statusKey = (data as { status_key?: string | null }).status_key ?? null;
    const metadataRaw = (data as { metadata?: Record<string, unknown> | null }).metadata ?? null;
    const metadata = metadataRaw && typeof metadataRaw === "object" ? metadataRaw : null;
    return { statusKey, metadata };
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
    const recordSectionKey = query.surface === "record_section" ? (query.sectionKey ?? "").trim() : "";
    if (query.surface === "record_section" && !recordSectionKey) {
        return out;
    }
    let statusKey: string | null = null;
    let oppMetadata: Record<string, unknown> | null = null;
    if (et === "opportunity" && query.entityId?.trim()) {
        const hintSk = (query.hintOpportunityStatusKey ?? "").trim();
        if (hintSk) {
            statusKey = hintSk;
            const hm = query.hintOpportunityMetadata;
            oppMetadata = hm && typeof hm === "object" ? hm : null;
        } else {
            const ctx = await fetchOpportunityConditionContext(supabase, query.orgId, query.entityId.trim());
            statusKey = ctx.statusKey;
            oppMetadata = ctx.metadata;
        }
    }

    const { data: rows, error } = await supabase
        .from("action_placements")
        .select(
            [
                "id",
                "surface",
                "slot",
                "org_id",
                "entity_type",
                "department_id",
                "work_unit_id",
                "section_key",
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

    // If an org-scoped definition exists for a key, suppress global templates for that key.
    // This prevents "schedule_tour" global template from reappearing when org-scoped schedule_tour is filtered out.
    const orgScopedKeys = new Set<string>();
    for (const row of list) {
        const d = row.action_definitions;
        if (!d || !d.is_active) continue;
        if (d.org_id != null && d.org_id === query.orgId) orgScopedKeys.add(d.key);
    }

    for (const row of list) {
        const d = row.action_definitions;
        if (!d || !d.is_active) continue;
        if (row.org_id != null && String(row.org_id) !== query.orgId) continue;
        if (d.org_id != null && d.org_id !== query.orgId) continue;
        if (d.org_id == null && orgScopedKeys.has(d.key)) continue;
        if (row.entity_type != null && String(row.entity_type).trim() !== "" && et != null) {
            if (normEt(row.entity_type) !== et) continue;
        }
        if (d.entity_type != null && String(d.entity_type).trim() !== "" && et != null) {
            if (normEt(d.entity_type) !== et) continue;
        }
        if (!passesPlacementScope(row, query)) continue;
        if (
            !lifecycleBuilderPlacementVisibleOnStage(row.condition_config, query.lifecycleViewStageKey ?? null)
        ) {
            continue;
        }
        if (query.surface === "record_section") {
            const psk = row.section_key != null ? String(row.section_key).trim() : "";
            if (!psk || psk !== recordSectionKey) continue;
        }
        if (!evaluateActionPlacementCondition(d.condition_config, row.condition_config, statusKey, oppMetadata)) continue;

        const payload = (d.payload_schema && typeof d.payload_schema === "object" ? d.payload_schema : {}) as Record<string, unknown>;
        resolved.push(
            enrichResolvedActionForClient({
                key: d.key,
                label: d.label,
                description: d.description,
                action_type: d.action_type,
                icon: d.icon,
                style: d.style,
                display_style: row.display_style ?? "button",
                payload,
                workflow_id: d.workflow_id,
                _order: parseLifecycleActionDisplayOrder(row.condition_config) ?? row.order_index,
                _slot: row.slot,
                _scope_rank: d.org_id != null ? 2 : row.org_id != null ? 1 : 0,
            } as ResolvedActionForClient & { _order: number; _slot: string }),
        );
    }

    const withMeta = resolved as (ResolvedActionForClient & { _order: number; _slot: string; _scope_rank: number })[];
    withMeta.sort((a, b) => (a._order !== b._order ? a._order - b._order : a.label.localeCompare(b.label)));

    // De-dupe by slot+key, preferring org-scoped definitions over global templates.
    const chosenBySlotKey = new Map<string, (typeof withMeta)[number]>();
    for (const a of withMeta) {
        const k = `${a._slot}::${a.key}`;
        const prev = chosenBySlotKey.get(k);
        if (!prev || a._scope_rank > prev._scope_rank) chosenBySlotKey.set(k, a);
    }

    for (const a of withMeta) {
        const k = `${a._slot}::${a.key}`;
        if (chosenBySlotKey.get(k) !== a) continue;
        const slot = a._slot as keyof ResolvedActionsBySlot;
        const { _order: _o, _slot: _s, _scope_rank: _sr, ...rest } = a;
        void _o;
        void _s;
        void _sr;
        if (out[slot]) {
            out[slot].push(rest);
        } else {
            out.overflow.push(rest);
        }
    }

    return filterOpportunityActionsForRuntimeGates(
        supabase,
        query.orgId,
        query.entityType,
        query.entityId,
        stripMakePrimaryContactFromResolvedActionsBySlot(out, query.surface),
    );
}
