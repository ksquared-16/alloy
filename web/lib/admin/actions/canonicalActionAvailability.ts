/**
 * Canonical action availability — filters registry by placement, surface, BP/stage, and DB placements.
 */

import {
    canonicalActionDefinition,
    canonicalPlacementsForLayoutContext,
    CANONICAL_ACTION_REGISTRY,
    layoutContextMatchesCanonicalAction,
    type CanonicalActionDefinition,
    type CanonicalActionPlacement,
} from "@/lib/admin/actions/canonicalActionRegistry";
import {
    isMakePrimaryContactActionKey,
    isMakePrimaryContactAllowedCanonicalPlacement,
    MAKE_PRIMARY_CONTACT_BUILDER_UNAVAILABLE_MESSAGE,
} from "@/lib/admin/actions/makePrimaryContactAction";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import type { LayoutEditorActionPickerContext } from "@/lib/layout/layoutEditorActionCatalog";

export type CanonicalActionAvailabilityReason =
    | "available"
    | "hidden_surface"
    | "hidden_context"
    | "hidden_stage"
    | "hidden_business_process"
    | "not_in_db_placements"
    | "not_runtime_wired"
    | "settings_only";

export type CanonicalActionAvailabilityRow = {
    actionKey: string;
    label: string;
    description: string;
    available: boolean;
    reason: CanonicalActionAvailabilityReason;
    unavailableMessage?: string;
    definition: CanonicalActionDefinition;
};

/** Curated enrollment BP stage → action keys (MVP; DB matrix is authoritative at runtime). */
export const ENROLLMENT_STAGE_ACTION_KEYS: Record<string, readonly string[]> = {
    lead: [
        "create_lead",
        "add_child",
        "add_parent_guardian",
        "add_family_member",
        "add_emergency_contact",
        "schedule_tour",
        "ask_bos",
        "quick_message",
    ],
    new_inquiry: [
        "create_lead",
        "add_child",
        "add_parent_guardian",
        "add_family_member",
        "add_emergency_contact",
        "schedule_tour",
    ],
    waitlist: [
        "add_child",
        "add_sibling",
        "add_emergency_contact",
        "add_authorized_pickup",
        "add_billing_contact",
        "update_status_add_note",
    ],
    enrolled: ["send_enrollment_packet", "quick_message", "open_record"],
};

function normalizeStageKey(stage: string | null | undefined): string | null {
    const text = stage?.trim().toLowerCase() ?? "";
    return text || null;
}

function stageAllowsAction(stageKey: string | null, actionKey: string, entry: CanonicalActionDefinition): boolean {
    if (entry.allowedStages.length > 0) {
        if (!stageKey) return true;
        return entry.allowedStages.includes(stageKey);
    }
    if (!stageKey) return true;
    const stageList = ENROLLMENT_STAGE_ACTION_KEYS[stageKey];
    if (!stageList) return true;
    const appearsInCuratedMap = Object.values(ENROLLMENT_STAGE_ACTION_KEYS).some((list) =>
        list.includes(actionKey),
    );
    if (!appearsInCuratedMap) return true;
    return stageList.includes(actionKey);
}

function businessProcessAllowsAction(
    businessProcessKey: string | null,
    entry: CanonicalActionDefinition,
): boolean {
    if (entry.allowedBusinessProcesses.length === 0) return true;
    if (!businessProcessKey) return true;
    return entry.allowedBusinessProcesses.includes(businessProcessKey);
}

function evaluateAvailability(input: {
    entry: CanonicalActionDefinition;
    placements: CanonicalActionPlacement[];
    layoutSurface?: DrawerLayoutEditorSurfaceKey;
    layoutContext?: LayoutEditorActionPickerContext;
    lifecycleStageKey?: string | null;
    businessProcessKey?: string | null;
    dbAvailableKeys?: ReadonlySet<string> | null;
    requireDbPlacement?: boolean;
}): CanonicalActionAvailabilityRow {
    const { entry } = input;
    const base: CanonicalActionAvailabilityRow = {
        actionKey: entry.actionKey,
        label: entry.label,
        description: entry.description,
        available: false,
        reason: "available",
        definition: entry,
    };

    if (!entry.runtimeWired) {
        return {
            ...base,
            reason: "not_runtime_wired",
            unavailableMessage: "This action is preview-only until runtime wiring is complete.",
        };
    }

    if (isMakePrimaryContactActionKey(entry.actionKey)) {
        if (input.layoutSurface && input.layoutContext) {
            if (!layoutContextMatchesCanonicalAction(entry, {
                surfaceKey: input.layoutSurface,
                context: input.layoutContext,
            })) {
                return {
                    ...base,
                    reason: "hidden_context",
                    unavailableMessage: MAKE_PRIMARY_CONTACT_BUILDER_UNAVAILABLE_MESSAGE,
                };
            }
        } else if (input.placements.length > 0) {
            const placementMatch = input.placements.some((p) =>
                isMakePrimaryContactAllowedCanonicalPlacement(p),
            );
            if (!placementMatch) {
                return {
                    ...base,
                    reason: "hidden_context",
                    unavailableMessage: MAKE_PRIMARY_CONTACT_BUILDER_UNAVAILABLE_MESSAGE,
                };
            }
        }
    }

    if (input.layoutSurface && input.layoutContext) {
        if (!layoutContextMatchesCanonicalAction(entry, {
            surfaceKey: input.layoutSurface,
            context: input.layoutContext,
        })) {
            const surfaceOk = entry.allowedLayoutSurfaces.includes(input.layoutSurface);
            return {
                ...base,
                reason: surfaceOk ? "hidden_context" : "hidden_surface",
                unavailableMessage: surfaceOk ?
                    "Not available in this layout context."
                :   "Not available on this drawer surface.",
            };
        }
    } else if (input.placements.length > 0) {
        const placementMatch = input.placements.some((p) => entry.allowedPlacements.includes(p));
        if (!placementMatch) {
            return {
                ...base,
                reason: "hidden_surface",
                unavailableMessage: "Not available for this placement.",
            };
        }
    }

    const stageKey = normalizeStageKey(input.lifecycleStageKey);
    if (!stageAllowsAction(stageKey, entry.actionKey, entry)) {
        return {
            ...base,
            reason: "hidden_stage",
            unavailableMessage: stageKey ?
                `Not available in stage "${stageKey}".`
            :   "Stage context required to show this action.",
        };
    }

    if (!businessProcessAllowsAction(input.businessProcessKey ?? null, entry)) {
        return {
            ...base,
            reason: "hidden_business_process",
            unavailableMessage: "Not configured for this business process.",
        };
    }

    if (input.requireDbPlacement && input.dbAvailableKeys) {
        if (!input.dbAvailableKeys.has(entry.actionKey)) {
            return {
                ...base,
                reason: "not_in_db_placements",
                unavailableMessage:
                    "Add this action in Business Process or Settings → Actions to enable it here.",
            };
        }
    }

    return { ...base, available: true, reason: "available" };
}

/** Experience Builder — actions pickable for layout surface/context (+ optional BP stage). */
export function resolveLayoutBuilderAvailableActions(input: {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    context: LayoutEditorActionPickerContext;
    lifecycleStageKey?: string | null;
    businessProcessKey?: string | null;
    /** When set, intersect with keys returned from resolveActionsForContext for the drawer. */
    dbAvailableKeys?: readonly string[] | null;
    includeUnavailable?: boolean;
}): CanonicalActionAvailabilityRow[] {
    const placements = canonicalPlacementsForLayoutContext({
        surfaceKey: input.surfaceKey,
        context: input.context,
    });
    const dbSet =
        input.dbAvailableKeys ?
            new Set(input.dbAvailableKeys.map((key) => key.trim()).filter(Boolean))
        :   null;

    const rows = CANONICAL_ACTION_REGISTRY.filter(
        (entry) => entry.allowedLayoutSurfaces.length > 0 && entry.allowedLayoutContexts.length > 0,
    ).map((entry) =>
        evaluateAvailability({
            entry,
            placements,
            layoutSurface: input.surfaceKey,
            layoutContext: input.context,
            lifecycleStageKey: input.lifecycleStageKey,
            businessProcessKey: input.businessProcessKey,
            dbAvailableKeys: dbSet,
            requireDbPlacement: Boolean(dbSet && dbSet.size > 0),
        }),
    );

    const filtered = input.includeUnavailable ? rows : rows.filter((row) => row.available);
    return filtered.sort((a, b) => a.label.localeCompare(b.label));
}

/** Workspace / drawer header — merge DB-resolved keys with canonical metadata. */
export function enrichResolvedActionsWithCanonical(input: {
    resolvedKeys: readonly string[];
    placement: CanonicalActionPlacement;
    lifecycleStageKey?: string | null;
    businessProcessKey?: string | null;
}): CanonicalActionAvailabilityRow[] {
    const keySet = new Set(input.resolvedKeys.map((k) => k.trim()).filter(Boolean));
    return CANONICAL_ACTION_REGISTRY.filter((entry) => keySet.has(entry.actionKey)).map((entry) =>
        evaluateAvailability({
            entry,
            placements: [input.placement],
            lifecycleStageKey: input.lifecycleStageKey,
            businessProcessKey: input.businessProcessKey,
        }),
    );
}

export function canonicalActionDefinitionForKey(actionKey: string): CanonicalActionDefinition | null {
    return canonicalActionDefinition(actionKey);
}
