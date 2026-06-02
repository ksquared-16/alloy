import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildLifecycleConfiguredActionRows,
    type LifecycleConfiguredActionRow,
} from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { isLifecycleBuilderConfiguredPlacement } from "@/lib/lifecycle/lifecycleStageActionScope";

type PlacementRow = {
    id: string;
    action_definition_id: string;
    surface: string;
    slot: string;
    entity_type: string | null;
    department_id: string | null;
    work_unit_id: string | null;
    is_active: boolean;
    condition_config: Record<string, unknown> | null;
};

type DefRow = {
    id: string;
    key: string;
    label: string;
    entity_type: string | null;
    is_active: boolean;
};

/**
 * Only actions explicitly saved from Lifecycle Builder (marked in condition_config).
 * Does not include catalog-inferred stage actions.
 */
export async function loadLifecycleBuilderConfiguredActions(
    supabase: SupabaseClient,
    orgId: string
): Promise<LifecycleConfiguredActionRow[]> {
    const { data: placementsRaw, error: pErr } = await supabase
        .from("action_placements")
        .select(
            [
                "id",
                "action_definition_id",
                "surface",
                "slot",
                "entity_type",
                "department_id",
                "work_unit_id",
                "is_active",
                "condition_config",
            ].join(",")
        )
        .or(`org_id.is.null,org_id.eq.${orgId}`)
        .eq("is_active", true);

    if (pErr) throw new Error(pErr.message);

    const placements = (placementsRaw ?? []) as unknown as PlacementRow[];
    const builderPlacements = placements.filter((p) =>
        isLifecycleBuilderConfiguredPlacement(p.condition_config)
    );
    const defIds = [...new Set(builderPlacements.map((p) => String(p.action_definition_id)).filter(Boolean))];

    if (!defIds.length) return [];

    const { data: defsRaw, error: dErr } = await supabase
        .from("action_definitions")
        .select("id, key, label, entity_type, is_active")
        .in("id", defIds)
        .or(`org_id.is.null,org_id.eq.${orgId}`);

    if (dErr) throw new Error(dErr.message);

    const defs = (defsRaw ?? []) as unknown as DefRow[];
    const defsById = new Map(defs.map((d) => [String(d.id), d]));

    const byDefId = new Map<string, { definition: DefRow; placements: PlacementRow[] }>();

    for (const p of builderPlacements) {
        const def = defsById.get(String(p.action_definition_id));
        if (!def) continue;
        const entry = byDefId.get(def.id) ?? { definition: def, placements: [] };
        entry.placements.push(p);
        byDefId.set(def.id, entry);
    }

    return buildLifecycleConfiguredActionRows([...byDefId.values()]);
}
