/**
 * Lifecycle Builder — lifecycle-level actions matrix (rows = base actions, columns = placements).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ensureOrgLifecycleActionDefinition } from "@/lib/lifecycle/ensureOrgLifecycleActionDefinition";
import { filterSaveableLifecycleBaseActions } from "@/lib/lifecycle/filterSaveableLifecycleBaseActions";
import { loadLifecycleBuilderConfiguredActions } from "@/lib/lifecycle/loadLifecycleBuilderConfiguredActions";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import {
    buildLifecycleActionConditionConfig,
    isLifecycleBuilderConfiguredPlacement,
    type LifecycleActionScope,
} from "@/lib/lifecycle/lifecycleStageActionScope";
import {
    buildLifecycleActionsMatrixOrderPatch,
    parseLifecycleActionsMatrixOrder,
    sortBaseActionKeysByMatrixOrder,
} from "@/lib/lifecycle/lifecycleActionsMatrixOrder";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import {
    lifecycleActivationBaseActionByKey,
    lifecycleActivationBaseActions,
    lifecycleActivationPlacementIdForSurfaceSlot,
    lifecyclePlacementById,
    normalizeLifecyclePlacementId,
    type LifecycleBaseActionDefinition,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";

/** Matrix row order for Lifecycle Builder UI. */
export const LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER: readonly LifecycleBaseActionKey[] = [
    "create_record",
    "quick_message",
    "waitlist_child",
    "enroll_child",
    "close_lead",
    "add_person",
    "add_child",
    "send_form",
    "schedule_tour",
    "create_task",
] as const;

export type LifecycleActionsMatrixRow = {
    base_action_key: LifecycleBaseActionKey;
    default_label: string;
    saveable: boolean;
    enabled: boolean;
    label: string;
    placement_ids: string[];
    /** Empty = all stages (lifecycle-wide visibility). */
    stage_restrictions: LifecycleOperatorStage[];
    action_definition_id: string | null;
};

export type LifecycleActionsMatrixPayload = {
    rows: LifecycleActionsMatrixRow[];
    configured_actions: LifecycleConfiguredActionRow[];
};

export type LifecycleActionsMatrixSaveRow = {
    base_action_key: string;
    enabled: boolean;
    label: string;
    placement_ids: string[];
    stage_restrictions?: string[];
    display_order?: number;
};

function baseActionKeyForDefinitionKey(
    defKey: string,
    primaryRecordLabel: string
): LifecycleBaseActionKey | null {
    const match = lifecycleActivationBaseActions(primaryRecordLabel).find((b) => b.definition_key === defKey);
    return match?.key ?? null;
}

function activationPlacementIdForSurfaceSlot(surface: string, slot: string): string | null {
    return lifecycleActivationPlacementIdForSurfaceSlot(surface, slot);
}

function normalizeStageRestrictions(raw: readonly string[] | undefined): LifecycleOperatorStage[] {
    if (!raw?.length) return [];
    const out: LifecycleOperatorStage[] = [];
    for (const s of raw) {
        const t = s.trim();
        if ((LIFECYCLE_STAGE_ORDER as readonly string[]).includes(t) && !out.includes(t as LifecycleOperatorStage)) {
            out.push(t as LifecycleOperatorStage);
        }
    }
    return out;
}

function resolveScopeAndStages(
    stageRestrictions: readonly string[],
    allStageKeys: readonly string[]
): { scope: LifecycleActionScope; operatorStages: string[] } {
    const restrictions = normalizeStageRestrictions(stageRestrictions);
    const allOperator = allStageKeys.filter((k) =>
        (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(k)
    ) as LifecycleOperatorStage[];
    if (!restrictions.length) {
        return { scope: "lifecycle", operatorStages: [] };
    }
    if (
        allOperator.length &&
        restrictions.length >= allOperator.length &&
        allOperator.every((s) => restrictions.includes(s))
    ) {
        return { scope: "lifecycle", operatorStages: [] };
    }
    return { scope: "stage", operatorStages: restrictions };
}

function configuredRowForBaseKey(
    configured: LifecycleConfiguredActionRow[],
    baseKey: LifecycleBaseActionKey,
    primaryRecordLabel: string
): LifecycleConfiguredActionRow | null {
    const base = lifecycleActivationBaseActionByKey(baseKey, primaryRecordLabel);
    if (!base) return null;
    return (
        configured.find((r) => r.key === base.definition_key) ??
        configured.find((r) => r.base_action_label === base.label) ??
        null
    );
}

/** Build matrix rows with placement ids resolved from placement records. */
export function buildLifecycleActionsMatrixRows(params: {
    baseActions: readonly LifecycleBaseActionDefinition[];
    configured: LifecycleConfiguredActionRow[];
    placementSurfaceSlots: Map<string, { surface: string; slot: string }>;
    primaryRecordLabel?: string;
    builderStageKeys?: readonly string[];
}): LifecycleActionsMatrixRow[] {
    const primaryRecordLabel = params.primaryRecordLabel?.trim() || "Lead";
    const saveableKeys = new Set(params.baseActions.map((b) => b.key));
    const rows: LifecycleActionsMatrixRow[] = [];

    for (const baseActionKey of LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER) {
        const base = lifecycleActivationBaseActionByKey(baseActionKey, primaryRecordLabel);
        if (!base) continue;
        const configuredRow = configuredRowForBaseKey(params.configured, baseActionKey, primaryRecordLabel);
        const placementIds = new Set<string>();
        if (configuredRow) {
            for (const p of configuredRow.placements) {
                if (!p.is_active || !p.placement_id) continue;
                const slots = params.placementSurfaceSlots.get(p.placement_id);
                if (!slots) continue;
                const id = activationPlacementIdForSurfaceSlot(slots.surface, slots.slot);
                if (id) placementIds.add(id);
            }
        }
        const enabled = Boolean(configuredRow?.placements.some((p) => p.is_active && p.placement_id));
        const storedLabel = configuredRow?.label?.trim() || "";
        // action_definitions may still carry the legacy "Create Task" seed label — prefer the
        // curated Process Action label until an operator sets a custom display name.
        const label =
            baseActionKey === "create_task" && (!storedLabel || storedLabel === "Create Task")
                ? base.label
                : storedLabel || base.label;
        rows.push({
            base_action_key: baseActionKey,
            default_label: base.label,
            saveable: saveableKeys.has(baseActionKey),
            enabled,
            label,
            placement_ids: [...placementIds],
            stage_restrictions:
                configuredRow?.action_scope === "stage" ? [...configuredRow.operator_stages] : [],
            action_definition_id: configuredRow?.action_definition_id ?? null,
        });
    }

    return rows;
}

export async function loadLifecycleActionsMatrix(
    supabase: SupabaseClient,
    orgId: string,
    opts?: {
        primaryRecordLabel?: string;
        builderStageKeys?: readonly string[];
        departmentMetadata?: Record<string, unknown> | null;
    }
): Promise<LifecycleActionsMatrixPayload> {
    const primaryRecordLabel = opts?.primaryRecordLabel?.trim() || "Lead";
    const baseActionCandidates = [...lifecycleActivationBaseActions(primaryRecordLabel)];
    const base_actions = await filterSaveableLifecycleBaseActions(supabase, orgId, baseActionCandidates);
    const configured = await loadLifecycleBuilderConfiguredActions(supabase, orgId);

    const { data: placementsRaw } = await supabase
        .from("action_placements")
        .select("id, surface, slot, condition_config, is_active")
        .or(`org_id.is.null,org_id.eq.${orgId}`)
        .eq("is_active", true);

    const placementSurfaceSlots = new Map<string, { surface: string; slot: string }>();
    for (const p of placementsRaw ?? []) {
        const row = p as { id: string; surface: string; slot: string; condition_config: unknown };
        if (!isLifecycleBuilderConfiguredPlacement(row.condition_config)) continue;
        placementSurfaceSlots.set(String(row.id), { surface: row.surface, slot: row.slot });
    }

    const matrixRows = buildLifecycleActionsMatrixRows({
        baseActions: base_actions,
        configured,
        placementSurfaceSlots,
        primaryRecordLabel,
        builderStageKeys: opts?.builderStageKeys,
    });
    const order = parseLifecycleActionsMatrixOrder(opts?.departmentMetadata ?? null);
    const rows = sortBaseActionKeysByMatrixOrder(matrixRows, order);

    return { rows, configured_actions: configured };
}

async function deactivateBuilderPlacementsForDefinition(
    supabase: SupabaseClient,
    orgId: string,
    definitionId: string
): Promise<void> {
    const { data: placements } = await supabase
        .from("action_placements")
        .select("id, condition_config")
        .eq("org_id", orgId)
        .eq("action_definition_id", definitionId)
        .eq("is_active", true);

    const ids: string[] = [];
    for (const p of placements ?? []) {
        const cc = (p as { condition_config?: unknown }).condition_config;
        if (!isLifecycleBuilderConfiguredPlacement(cc)) continue;
        const id = String((p as { id?: string }).id ?? "").trim();
        if (id) ids.push(id);
    }
    if (!ids.length) return;

    const { error } = await supabase
        .from("action_placements")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", ids)
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);
}

/**
 * Capability key to store in process command_set_v1 for a Process Action definition key.
 * Prefer the registry canonical (create_task → create_work_item), then intent aliases.
 */
export function processActionCapabilityKeyForDefinitionKey(definitionKey: string): string {
    const key = definitionKey.trim();
    if (!key) return key;
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status === "known") return resolved.capability.canonicalCommandKey;
    return normalizeActionRefToIntentKey(key);
}

/**
 * Ensure enabled Process Actions also appear in process command_set_v1 so Work Template Helpful
 * Actions can select them (e.g. Waitlist Child → Move to Waitlist).
 *
 * Returns null when unchanged. Callers must persist via the draft writer (`editProcessInDraft`) —
 * never by writing `departments.metadata.lifecycle_builder_v1` directly.
 */
export function upsertEnabledProcessActionsIntoCommandSet(
    process: LifecycleBuilderProcessRecord,
    enabledDefinitionKeys: readonly string[],
): LifecycleBuilderProcessRecord | null {
    const keys = [...new Set(enabledDefinitionKeys.map((k) => k.trim()).filter(Boolean))];
    if (!keys.length) return null;

    const existing = process.command_set_v1;
    const commands = existing?.commands ? [...existing.commands] : [];
    const presentCanonical = new Set(
        commands.map((c) => processActionCapabilityKeyForDefinitionKey(c.capability_key)),
    );
    let changed = false;

    for (const key of keys) {
        const capability_key = processActionCapabilityKeyForDefinitionKey(key);
        if (presentCanonical.has(capability_key)) {
            const idx = commands.findIndex(
                (c) => processActionCapabilityKeyForDefinitionKey(c.capability_key) === capability_key,
            );
            if (idx >= 0) {
                const entry = commands[idx]!;
                if (!entry.enabled || entry.capability_key.trim() !== capability_key) {
                    // Re-enable and canonicalize (e.g. create_task → create_work_item).
                    commands[idx] = { ...entry, capability_key, enabled: true };
                    changed = true;
                }
            }
            continue;
        }
        commands.push({ capability_key, enabled: true });
        presentCanonical.add(capability_key);
        changed = true;
    }

    if (!changed) return null;
    return {
        ...process,
        command_set_v1: { version: 1 as const, commands },
    };
}

export type LifecycleActionsMatrixSaveResult = {
    saved: number;
    /** Category-F only — never includes `lifecycle_builder_v1`. */
    metadata_patch: Record<string, unknown>;
    /** Enabled action definition keys to upsert into draft `command_set_v1`. */
    enabled_definition_keys: string[];
};

export async function saveLifecycleActionsMatrix(
    supabase: SupabaseClient,
    orgId: string,
    rows: LifecycleActionsMatrixSaveRow[],
    opts?: {
        primaryRecordLabel?: string;
        builderStageKeys?: readonly string[];
        existingMetadata?: Record<string, unknown> | null;
    }
): Promise<LifecycleActionsMatrixSaveResult> {
    const primaryRecordLabel = opts?.primaryRecordLabel?.trim() || "Lead";
    const allStageKeys = opts?.builderStageKeys?.length
        ? opts?.builderStageKeys
        : [...LIFECYCLE_STAGE_ORDER];

    let saved = 0;
    const orderedKeys = rows
        .map((r) => String(r.base_action_key ?? "").trim())
        .filter((k): k is LifecycleBaseActionKey =>
            (LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER as readonly string[]).includes(k)
        );

    // Resolve saveability once — per-row DB lookups made saves take tens of seconds.
    const uniqueBases = new Map<string, LifecycleBaseActionDefinition>();
    for (const row of rows) {
        const baseActionKey = String(row.base_action_key ?? "").trim() as LifecycleBaseActionKey;
        const base = lifecycleActivationBaseActionByKey(baseActionKey, primaryRecordLabel);
        if (base) uniqueBases.set(base.key, base);
    }
    const saveable = await filterSaveableLifecycleBaseActions(
        supabase,
        orgId,
        [...uniqueBases.values()],
    );
    const saveableKeys = new Set(saveable.map((b) => b.key));
    const enabledDefinitionKeys: string[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]!;
        const baseActionKey = String(row.base_action_key ?? "").trim() as LifecycleBaseActionKey;
        const base = lifecycleActivationBaseActionByKey(baseActionKey, primaryRecordLabel);
        if (!base) continue;

        if (!saveableKeys.has(base.key)) {
            if (row.enabled) {
                throw new Error(
                    `${base.label} cannot be saved — its action definition is missing for this organization.`,
                );
            }
            continue;
        }

        if (!row.enabled) {
            const { data: defs } = await supabase
                .from("action_definitions")
                .select("id")
                .eq("key", base.definition_key)
                .or(`org_id.is.null,org_id.eq.${orgId}`);
            for (const d of defs ?? []) {
                await deactivateBuilderPlacementsForDefinition(supabase, orgId, String((d as { id: string }).id));
            }
            continue;
        }

        const label = typeof row.label === "string" ? row.label.trim() : "";
        if (!label) throw new Error(`Display label is required for ${base.label}`);

        const rawPlacementIds = Array.isArray(row.placement_ids)
            ? row.placement_ids.map((p) => String(p ?? "").trim()).filter(Boolean)
            : [];
        if (!rawPlacementIds.length) {
            throw new Error(`Select at least one placement for ${base.label}`);
        }

        // Normalize legacy ids onto the canonical set (department_rail → Workspace,
        // drawer → Focus Panel Manage) and drop deprecated ones (queue_row), de-duping.
        const placementIds = [
            ...new Set(
                rawPlacementIds
                    .map((id) => normalizeLifecyclePlacementId(id))
                    .filter((id): id is string => Boolean(id))
            ),
        ];

        const placements = placementIds
            .map((id) => lifecyclePlacementById(id))
            .filter((p): p is NonNullable<typeof p> => !!p);

        if (!placements.length) throw new Error(`Select at least one placement for ${base.label}`);

        const { scope, operatorStages } = resolveScopeAndStages(row.stage_restrictions ?? [], allStageKeys);
        const displayOrder =
            typeof row.display_order === "number" && Number.isFinite(row.display_order)
                ? row.display_order
                : rowIndex;
        const conditionConfig = buildLifecycleActionConditionConfig(scope, operatorStages, displayOrder);

        const defId = await ensureOrgLifecycleActionDefinition(
            supabase,
            orgId,
            baseActionKey,
            label,
            primaryRecordLabel
        );

        await deactivateBuilderPlacementsForDefinition(supabase, orgId, defId);

        for (const placement of placements) {
            const { error: insErr } = await supabase.from("action_placements").insert({
                org_id: orgId,
                action_definition_id: defId,
                surface: placement.surface,
                slot: placement.slot,
                entity_type: "opportunity",
                order_index: displayOrder,
                condition_config: conditionConfig,
                is_active: true,
            });
            if (insErr) throw new Error(insErr.message);
        }
        enabledDefinitionKeys.push(base.definition_key);
        saved += 1;
    }

    // Category F only — order lives outside publication-owned lifecycle_builder_v1.
    // command_set_v1 upserts go through the draft writer in the route, never this patch.
    const metadata_patch = buildLifecycleActionsMatrixOrderPatch(
        orderedKeys.length ? orderedKeys : LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER,
        opts?.existingMetadata ?? null,
    );
    return { saved, metadata_patch, enabled_definition_keys: enabledDefinitionKeys };
}

export function baseActionKeyFromConfiguredRow(
    row: LifecycleConfiguredActionRow,
    primaryRecordLabel = "Lead"
): LifecycleBaseActionKey | null {
    return baseActionKeyForDefinitionKey(row.key, primaryRecordLabel);
}
