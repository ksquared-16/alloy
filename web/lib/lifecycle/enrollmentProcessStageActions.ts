/**
 * Map action_definitions catalog metadata → enrollment operator stages for Settings.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { settingsSlotLabel, settingsSurfaceLabel } from "@/lib/admin/actions/actionPlacementPresentation";
import { LIFECYCLE_BASE_ACTIONS, isLifecycleProcessActionDefinitionEntityType } from "@/lib/lifecycle/lifecycleStageBaseActions";
import {
    parseLifecycleActionScopeFromConditionConfig,
    type LifecycleActionScope,
} from "@/lib/lifecycle/lifecycleStageActionScope";

export type ActionCatalogMeta = {
    lifecycle_stage?: string | null;
    lifecycle_stages?: string[] | null;
    implementation_status?: string | null;
};

export type EnrollmentProcessActionPlacement = {
    placement_id: string;
    surface_label: string;
    placement_label: string;
    is_active: boolean;
};

export type EnrollmentProcessStageActionRow = {
    key: string;
    label: string;
    base_action_label: string | null;
    definition_active: boolean;
    operational_note: string | null;
    action_scope?: LifecycleActionScope;
    placements: EnrollmentProcessActionPlacement[];
};

const CATALOG_STAGE_TO_OPERATOR: Record<string, LifecycleOperatorStage | null> = {
    new_lead: "lead",
    lead: "lead",
    qualification: "qualification",
    tour: "tour",
    waitlist: "waitlist",
    enrollment: "enrollment",
    active: "enrolled",
    enrolled: "enrolled",
    success: "enrolled",
    universal: null,
    multi: null,
    platform: null,
    entry: "lead",
    lost: null,
    withdrawn: null,
};

function parseCatalog(payloadSchema: unknown): ActionCatalogMeta | null {
    if (!payloadSchema || typeof payloadSchema !== "object") return null;
    const ps = payloadSchema as { catalog?: unknown };
    if (!ps.catalog || typeof ps.catalog !== "object") return null;
    const c = ps.catalog as Record<string, unknown>;
    const lifecycle_stages = Array.isArray(c.lifecycle_stages)
        ? c.lifecycle_stages.map((x) => String(x).trim()).filter(Boolean)
        : null;
    return {
        lifecycle_stage: typeof c.lifecycle_stage === "string" ? c.lifecycle_stage.trim() : null,
        lifecycle_stages,
        implementation_status:
            typeof c.implementation_status === "string" ? c.implementation_status.trim() : null,
    };
}

export function operatorStagesForActionCatalog(catalog: ActionCatalogMeta | null): LifecycleOperatorStage[] | "all" {
    if (!catalog) return [];
    const out = new Set<LifecycleOperatorStage>();

    if (catalog.lifecycle_stage === "universal" || catalog.lifecycle_stage === "multi" || catalog.lifecycle_stage === "platform") {
        if (catalog.lifecycle_stages?.length) {
            for (const s of catalog.lifecycle_stages) {
                const mapped = CATALOG_STAGE_TO_OPERATOR[s] ?? (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s)
                    ? (s as LifecycleOperatorStage)
                    : null;
                if (mapped) out.add(mapped);
            }
        }
        if (catalog.lifecycle_stage === "universal") return "all";
        return [...out];
    }

    const primary = catalog.lifecycle_stage
        ? CATALOG_STAGE_TO_OPERATOR[catalog.lifecycle_stage] ??
          ((LIFECYCLE_STAGE_ORDER as readonly string[]).includes(catalog.lifecycle_stage)
              ? (catalog.lifecycle_stage as LifecycleOperatorStage)
              : null)
        : null;
    if (primary) out.add(primary);

    for (const s of catalog.lifecycle_stages ?? []) {
        const mapped =
            CATALOG_STAGE_TO_OPERATOR[s] ??
            ((LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s) ? (s as LifecycleOperatorStage) : null);
        if (mapped) out.add(mapped);
    }

    return [...out];
}

export function actionMatchesOperatorStage(
    stage: LifecycleOperatorStage,
    catalog: ActionCatalogMeta | null
): boolean {
    const stages = operatorStagesForActionCatalog(catalog);
    if (stages === "all") return true;
    return stages.includes(stage);
}

export function lifecycleOperatorPlacementLabel(
    surface: string,
    slot: string,
    departmentId: string | null,
    workUnitId: string | null
): string {
    if (surface === "record_header" && slot === "primary") return "Focus Panel";
    if (surface === "record_header" && slot === "secondary") return "Focus Panel";
    if (surface === "record_header" && slot === "overflow") return "Overflow Menu";
    if (surface === "queue_row" || surface === "queue_header") return "Work Unit Queue Row";
    if (surface === "work_unit" || (surface === "right_rail" && workUnitId)) return "Work Unit Right Rail";
    if (surface === "department" || (surface === "right_rail" && departmentId)) return "Department Right Rail";
    if (surface === "workspace") return "Workspace";
    if (surface === "overflow" || slot === "overflow") return "Overflow Menu";
    return placementOperatorLabel(surface, departmentId, workUnitId);
}

function baseActionLabelForDefinitionKey(defKey: string): string | null {
    const match = LIFECYCLE_BASE_ACTIONS.find((b) => b.definition_key === defKey);
    return match?.label ?? null;
}

function placementOperatorLabel(surface: string, departmentId: string | null, workUnitId: string | null): string {
    const base = settingsSurfaceLabel(surface);
    if (surface === "right_rail") {
        if (workUnitId) return "Work Unit Rail";
        if (departmentId) return "Department Rail";
        return "Workspace Rail";
    }
    if (surface === "record_drawer" || surface === "record_header" || surface === "record_section") {
        return "Record actions";
    }
    if (surface === "queue_row" || surface === "queue_header") return "Queue Row";
    return base;
}

export function buildEnrollmentProcessStageActionRows(
    stage: LifecycleOperatorStage,
    items: {
        definition: {
            key: string;
            label: string;
            is_active: boolean;
            entity_type: string | null;
            payload_schema: unknown;
        };
        placements: {
            id: string;
            surface: string;
            slot: string;
            is_active: boolean;
            department_id: string | null;
            work_unit_id: string | null;
            condition_config?: Record<string, unknown> | null;
        }[];
    }[],
    options?: { includePlacedActions?: boolean }
): EnrollmentProcessStageActionRow[] {
    const byKey = new Map<string, EnrollmentProcessStageActionRow>();

    for (const item of items) {
        if (!isLifecycleProcessActionDefinitionEntityType(item.definition.entity_type)) continue;
        const catalog = parseCatalog(item.definition.payload_schema);
        const matchesStage = actionMatchesOperatorStage(stage, catalog);
        const hasPlacements = item.placements.some((p) => p.is_active);
        if (!matchesStage && !hasPlacements) continue;

        const status = catalog?.implementation_status ?? null;
        const operational_note =
            status === "missing"
                ? "Not fully operational yet"
                : status === "partial"
                  ? "Partially operational"
                  : null;

        let row = byKey.get(item.definition.key);
        if (!row) {
            const firstCc = item.placements[0]?.condition_config;
            row = {
                key: item.definition.key,
                label: item.definition.label,
                base_action_label: baseActionLabelForDefinitionKey(item.definition.key),
                definition_active: item.definition.is_active,
                operational_note,
                action_scope: parseLifecycleActionScopeFromConditionConfig(firstCc),
                placements: [],
            };
            byKey.set(item.definition.key, row);
        }

        for (const p of item.placements) {
            if (!p.is_active) continue;
            const surface_label = lifecycleOperatorPlacementLabel(
                p.surface,
                p.slot,
                p.department_id,
                p.work_unit_id
            );
            const slot = settingsSlotLabel(p.slot);
            row.placements.push({
                placement_id: p.id,
                surface_label,
                placement_label: surface_label,
                is_active: true,
            });
        }
    }

    const rows = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
    for (const row of rows) {
        const seen = new Set<string>();
        row.placements = row.placements.filter((p) => {
            const k = p.placement_id || p.placement_label;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        if (!row.placements.length) {
            row.placements.push({
                placement_id: "",
                surface_label: "Not placed",
                placement_label: "Not placed",
                is_active: false,
            });
        }
    }
    return rows;
}
