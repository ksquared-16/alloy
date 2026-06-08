import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { buildEnrollmentProcessStageActionRows } from "@/lib/lifecycle/enrollmentProcessStageActions";
import { placementMatchesStageBootstrap } from "@/lib/lifecycle/lifecycleStageActionScope";

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
    payload_schema: unknown;
};

/** Loads opportunity actions visible for an operator stage (lifecycle-scoped + stage-scoped). */
export async function loadEnrollmentStageActionsForOrg(
    supabase: SupabaseClient,
    orgId: string,
    operatorStage: LifecycleOperatorStage
) {
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
    const stageScoped = placements.filter((p) =>
        placementMatchesStageBootstrap(p.condition_config, operatorStage)
    );
    const defIds = [...new Set(stageScoped.map((p) => String(p.action_definition_id)).filter(Boolean))];

    const { data: defsRaw, error: dErr } = await supabase
        .from("action_definitions")
        .select("id, key, label, entity_type, is_active, payload_schema")
        .in("id", defIds.length ? defIds : ["00000000-0000-0000-0000-000000000000"])
        .or(`org_id.is.null,org_id.eq.${orgId}`);

    if (dErr) throw new Error(dErr.message);

    const defs = (defsRaw ?? []) as unknown as DefRow[];
    const defsById = new Map(defs.map((d) => [String(d.id), d]));

    const byDefId = new Map<
        string,
        {
            definition: DefRow;
            placements: PlacementRow[];
        }
    >();

    for (const p of stageScoped) {
        const def = defsById.get(String(p.action_definition_id));
        if (!def) continue;
        const entry = byDefId.get(def.id) ?? { definition: def, placements: [] };
        entry.placements.push(p);
        byDefId.set(def.id, entry);
    }

    return buildEnrollmentProcessStageActionRows(operatorStage, [...byDefId.values()], {
        includePlacedActions: true,
    });
}
