/**
 * Field lifecycle semantics for Settings → Data Model.
 *
 * Hidden / Archived / Deleted are operator concepts — not resolver architecture.
 * Archive state is stored in field_definitions.config.lifecycle_state (metadata).
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import type { FieldEditCapability, SettingsFieldCatalogEntry } from "@/lib/fields/fieldCatalogForSettings";

export type FieldLifecycleState = "active" | "hidden" | "archived";

export const FIELD_LIFECYCLE_CONFIG_KEY = "lifecycle_state";

export type FieldDeleteSafetySummary = {
    safe: boolean;
    blockers: ReadonlyArray<{ kind: string; label: string; count?: number }>;
    /** Dependency surfaces not yet scanned — shown in UI when delete is blocked or cautioned. */
    uncovered_checks: readonly string[];
    recommended_action: "delete" | "archive" | "hidden";
};

export type FieldLifecycleActions = {
    state: FieldLifecycleState;
    statusLabel: string;
    canHide: boolean;
    canShow: boolean;
    canArchive: boolean;
    canRestore: boolean;
    canDelete: boolean;
    hideDisabledReason?: string;
    archiveDisabledReason?: string;
    deleteDisabledReason?: string;
};

function readConfigRecord(config: FieldDef["config"]): Record<string, unknown> {
    if (config != null && typeof config === "object" && !Array.isArray(config)) {
        return config as Record<string, unknown>;
    }
    return {};
}

/** Resolve operator lifecycle state from persisted field_definition row. */
export function readFieldLifecycleState(fieldDef?: FieldDef | null): FieldLifecycleState {
    if (!fieldDef) return "active";
    const config = readConfigRecord(fieldDef.config);
    const raw = typeof config[FIELD_LIFECYCLE_CONFIG_KEY] === "string" ? config[FIELD_LIFECYCLE_CONFIG_KEY].trim() : "";
    if (raw === "archived" || config.archived === true) return "archived";

    if (fieldDef.is_system) {
        const hiddenFromBuilders =
            fieldDef.is_visible_in_form === false &&
            fieldDef.is_visible_in_drawer === false &&
            fieldDef.is_visible_in_table === false;
        return hiddenFromBuilders ? "hidden" : "active";
    }

    if (fieldDef.is_active === false) return "hidden";
    return "active";
}

export function fieldLifecycleStatusLabel(state: FieldLifecycleState): string {
    switch (state) {
        case "archived":
            return "Archived";
        case "hidden":
            return "Hidden";
        default:
            return "Active";
    }
}

/** Whether builders/forms should exclude this field from new pickers. */
export function isFieldExcludedFromPickers(state: FieldLifecycleState): boolean {
    return state === "archived" || state === "hidden";
}

export function mergeFieldLifecycleConfig(
    existing: FieldDef["config"],
    state: FieldLifecycleState,
): Record<string, unknown> {
    const base = readConfigRecord(existing);
    if (state === "archived") {
        return { ...base, [FIELD_LIFECYCLE_CONFIG_KEY]: "archived", archived: true };
    }
    if (state === "hidden") {
        const next: Record<string, unknown> = { ...base, [FIELD_LIFECYCLE_CONFIG_KEY]: "hidden" };
        delete next.archived;
        return next;
    }
    const next: Record<string, unknown> = { ...base, [FIELD_LIFECYCLE_CONFIG_KEY]: "active" };
    delete next.archived;
    return next;
}

export function buildFieldLifecyclePatch(state: FieldLifecycleState, existing?: FieldDef | null) {
    const config = mergeFieldLifecycleConfig(existing?.config ?? null, state);

    if (existing?.is_system) {
        const hideFromSurfaces = state === "hidden";
        return {
            is_visible_in_form: !hideFromSurfaces,
            is_visible_in_drawer: !hideFromSurfaces,
            is_visible_in_table: !hideFromSurfaces,
            config,
        };
    }

    const is_active = state === "active";
    const hideFromSurfaces = state !== "active";
    return {
        is_active,
        is_visible_in_form: !hideFromSurfaces,
        is_visible_in_drawer: !hideFromSurfaces,
        is_visible_in_table: !hideFromSurfaces,
        config,
    };
}

export function fieldLifecycleActions(
    entry: SettingsFieldCatalogEntry,
    editCapability: FieldEditCapability,
    canMutate: boolean,
    deleteSafety?: FieldDeleteSafetySummary | null,
): FieldLifecycleActions {
    const state = readFieldLifecycleState(entry.fieldDef);
    const base: FieldLifecycleActions = {
        state,
        statusLabel: fieldLifecycleStatusLabel(state),
        canHide: false,
        canShow: false,
        canArchive: false,
        canRestore: false,
        canDelete: false,
    };

    if (!canMutate) return base;

    if (entry.ownership === "computed" || editCapability.mode === "view") {
        return base;
    }

    if (editCapability.mode === "presentation") {
        return {
            ...base,
            canHide: state === "active",
            canShow: state === "hidden",
            hideDisabledReason: state === "archived" ? "Archived platform fields cannot be hidden from here." : undefined,
            archiveDisabledReason: "Platform fields cannot be archived.",
            deleteDisabledReason: "Platform fields cannot be deleted.",
        };
    }

    if (entry.ownership !== "custom" || !entry.fieldDef) return base;

    const blockers = deleteSafety?.blockers ?? [];
    const safe = deleteSafety?.safe === true && blockers.length === 0;
    const deleteReason =
        blockers.length > 0
            ? blockers.map((b) => b.label).join(" ")
            : deleteSafety && !deleteSafety.safe
              ? "Delete is blocked until dependency checks pass."
              : undefined;

    return {
        ...base,
        canHide: state === "active",
        canShow: state === "hidden" || state === "archived",
        canArchive: state !== "archived",
        canRestore: state === "archived",
        canDelete: safe,
        archiveDisabledReason: state === "archived" ? "Already archived." : undefined,
        deleteDisabledReason: safe ? undefined : deleteReason ?? "Archive or hide instead.",
    };
}
