import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleOperatorPlacementLabel } from "@/lib/lifecycle/enrollmentProcessStageActions";
import type { EnrollmentProcessActionPlacement } from "@/lib/lifecycle/enrollmentProcessStageActions";
import {
    isLifecycleProcessActionDefinitionEntityType,
    lifecycleActivationBaseActions,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import {
    isLifecycleBuilderConfiguredPlacement,
    parseLifecycleActionDisplayOrder,
    parseLifecycleActionScopeFromConditionConfig,
    parseLifecycleOperatorStagesFromConditionConfig,
    type LifecycleActionScope,
} from "@/lib/lifecycle/lifecycleStageActionScope";

export type LifecycleConfiguredActionRow = {
    action_definition_id: string;
    key: string;
    label: string;
    base_action_label: string | null;
    action_scope: LifecycleActionScope;
    /** Empty when lifecycle-wide. */
    operator_stages: LifecycleOperatorStage[];
    placements: EnrollmentProcessActionPlacement[];
    display_order: number;
};

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

function baseActionLabelForDefinitionKey(defKey: string, primaryRecordLabel = "Lead"): string | null {
    const match = lifecycleActivationBaseActions(primaryRecordLabel).find(
        (b) => b.definition_key === defKey
    );
    return match?.label ?? null;
}

export function buildLifecycleConfiguredActionRows(
    items: {
        definition: DefRow;
        placements: PlacementRow[];
    }[]
): LifecycleConfiguredActionRow[] {
    const rows: LifecycleConfiguredActionRow[] = [];

    for (const item of items) {
        if (!isLifecycleProcessActionDefinitionEntityType(item.definition.entity_type)) continue;
        const activePlacements = item.placements.filter((p) => p.is_active);
        if (!activePlacements.length) continue;

        const firstCc = activePlacements[0]?.condition_config;
        if (!isLifecycleBuilderConfiguredPlacement(firstCc)) continue;

        const action_scope = parseLifecycleActionScopeFromConditionConfig(firstCc);
        const operator_stages =
            action_scope === "stage" ? parseLifecycleOperatorStagesFromConditionConfig(firstCc) : [];
        const display_order = parseLifecycleActionDisplayOrder(firstCc) ?? 999;

        const placementViews: EnrollmentProcessActionPlacement[] = activePlacements.map((p) => ({
            placement_id: p.id,
            surface_label: lifecycleOperatorPlacementLabel(
                p.surface,
                p.slot,
                p.department_id,
                p.work_unit_id
            ),
            placement_label: lifecycleOperatorPlacementLabel(
                p.surface,
                p.slot,
                p.department_id,
                p.work_unit_id
            ),
            is_active: true,
        }));

        rows.push({
            action_definition_id: item.definition.id,
            key: item.definition.key,
            label: item.definition.label,
            base_action_label: baseActionLabelForDefinitionKey(item.definition.key),
            action_scope,
            operator_stages,
            placements: placementViews,
            display_order,
        });
    }

    return rows.sort(
        (a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label)
    );
}

export function formatConfiguredActionScopeLabel(row: LifecycleConfiguredActionRow): string {
    if (row.action_scope === "lifecycle") return "Lifecycle-wide";
    if (!row.operator_stages.length) return "Stage-specific";
    const labels = row.operator_stages.map((s) => s.replace(/_/g, " "));
    return `Stage-specific: ${labels.join(", ")}`;
}

export function isValidOperatorStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}
