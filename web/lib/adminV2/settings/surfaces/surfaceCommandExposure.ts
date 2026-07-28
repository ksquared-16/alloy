/**
 * Surface Command Exposure — presentation ownership for process-selected Commands.
 *
 * Surfaces choose where operators encounter Commands. They do not invent Commands,
 * write command_set_v1, or define executors.
 */

import type { ActionSlot, ActionSurface } from "@/lib/admin/actions/types";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

/** Operator-facing exposure targets owned by Surfaces. */
export type SurfaceCommandExposureKind =
    | "focus_panel_manage"
    | "queue_row_inline"
    | "workspace_primary"
    | "work_unit_rail";

export type SurfaceCommandExposureTarget = {
    kind: SurfaceCommandExposureKind;
    /** Human label — never raw storage keys. */
    label: string;
    description: string;
    surface: ActionSurface;
    slot: ActionSlot;
    /** Surfaces categories that may configure this exposure. */
    sections: readonly SurfaceConfigSectionKey[];
    /** When true, order_index affects operator presentation. */
    orderingMeaningful: boolean;
};

export const SURFACE_COMMAND_EXPOSURE_TARGETS: readonly SurfaceCommandExposureTarget[] = [
    {
        kind: "focus_panel_manage",
        label: "Focus Panel · More Commands",
        description: "Commands in the Focus Panel Manage / overflow menu while working a record.",
        surface: "record_header",
        slot: "overflow",
        sections: ["focus-panels"],
        orderingMeaningful: true,
    },
    {
        kind: "queue_row_inline",
        label: "Queue row · Inline",
        description: "Commands shown inline on this process’s queue rows.",
        surface: "queue_row",
        slot: "row_inline",
        sections: ["queue-rows"],
        orderingMeaningful: true,
    },
    {
        kind: "workspace_primary",
        label: "Workspace · Command bar",
        description: "Commands on the workspace actions rail for this process context.",
        surface: "workspace",
        slot: "primary",
        sections: ["workspaces"],
        orderingMeaningful: true,
    },
    {
        kind: "work_unit_rail",
        label: "Work Unit · Actions rail",
        description: "Commands on the Work Unit right-hand actions rail.",
        surface: "work_unit",
        slot: "primary",
        sections: ["work-units"],
        orderingMeaningful: true,
    },
] as const;

export function surfaceCommandExposureTarget(
    kind: SurfaceCommandExposureKind
): SurfaceCommandExposureTarget | null {
    return SURFACE_COMMAND_EXPOSURE_TARGETS.find((t) => t.kind === kind) ?? null;
}

export function surfaceCommandExposureTargetsForSection(
    section: SurfaceConfigSectionKey
): readonly SurfaceCommandExposureTarget[] {
    return SURFACE_COMMAND_EXPOSURE_TARGETS.filter((t) => t.sections.includes(section));
}

export function surfaceCommandExposureKindForSurfaceSlot(
    surface: string,
    slot: string
): SurfaceCommandExposureKind | null {
    const hit = SURFACE_COMMAND_EXPOSURE_TARGETS.find(
        (t) => t.surface === surface && t.slot === slot
    );
    return hit?.kind ?? null;
}

/** Marker on condition_config — Surfaces-owned placement (not Process Actions builder). */
export const SURFACE_COMMAND_EXPOSURE_CONDITION_KEY = "surface_command_exposure_v1" as const;

export function buildSurfaceCommandExposureConditionConfig(
    orderIndex: number
): Record<string, unknown> {
    return {
        [SURFACE_COMMAND_EXPOSURE_CONDITION_KEY]: true,
        display_order: orderIndex,
    };
}

export function isSurfaceCommandExposurePlacement(
    conditionConfig: Record<string, unknown> | null | undefined
): boolean {
    if (!conditionConfig || typeof conditionConfig !== "object") return false;
    return conditionConfig[SURFACE_COMMAND_EXPOSURE_CONDITION_KEY] === true;
}

export type SurfaceCommandExposureCandidate = {
    capabilityKey: string;
    label: string;
    purpose: string;
    /** True when Capability Registry marks the Command runnable. */
    supported: boolean;
    /** True when included in the process command_set_v1 / legacy selection. */
    processSelected: boolean;
    /** Why the Command cannot be exposed, when blocked. */
    blockedReason: string | null;
};

export type SurfaceCommandExposureRow = SurfaceCommandExposureCandidate & {
    exposureKind: SurfaceCommandExposureKind;
    exposureLabel: string;
    /** Aggregated presentation: shown on this Surface. */
    enabled: boolean;
    /** Organization owns at least one editable placement row for this group. */
    orgOwned: boolean;
    /** Platform default is active and no org override exists. */
    platformDefault: boolean;
    orderIndex: number;
    /** Collapsed duplicate org placement ids (toggle applies to all). */
    orgPlacementIds: string[];
};

export type SurfaceCommandExposureEmptyState =
    | "no_process"
    | "no_selected_commands"
    | "none_valid_for_surface"
    | "ok";

/**
 * Build editor rows for one exposure target from process-selected candidates + placement state.
 * Does not invent capability keys outside `candidates`.
 */
export function buildSurfaceCommandExposureRows(input: {
    exposure: SurfaceCommandExposureTarget;
    candidates: readonly SurfaceCommandExposureCandidate[];
    placements: readonly {
        id: string;
        orgOwned: boolean;
        capabilityKey: string;
        surface: string;
        slot: string;
        isActive: boolean;
        orderIndex: number;
    }[];
}): { rows: SurfaceCommandExposureRow[]; emptyState: SurfaceCommandExposureEmptyState } {
    const matching = input.placements.filter(
        (p) => p.surface === input.exposure.surface && p.slot === input.exposure.slot
    );

    const byKey = new Map<string, typeof matching>();
    for (const p of matching) {
        const list = byKey.get(p.capabilityKey) ?? [];
        list.push(p);
        byKey.set(p.capabilityKey, list);
    }

    const rows: SurfaceCommandExposureRow[] = [];
    for (const candidate of input.candidates) {
        if (!candidate.processSelected) continue;
        const group = byKey.get(candidate.capabilityKey) ?? [];
        const orgRows = group.filter((p) => p.orgOwned);
        const platformActive = group.some((p) => !p.orgOwned && p.isActive);
        const orgActive = orgRows.some((p) => p.isActive);
        const enabled = orgRows.length > 0 ? orgActive : platformActive;
        const orderIndex =
            orgRows.find((p) => p.isActive)?.orderIndex ??
            orgRows[0]?.orderIndex ??
            group.find((p) => p.isActive)?.orderIndex ??
            0;

        rows.push({
            ...candidate,
            exposureKind: input.exposure.kind,
            exposureLabel: input.exposure.label,
            enabled,
            orgOwned: orgRows.length > 0,
            platformDefault: orgRows.length === 0 && platformActive,
            orderIndex,
            orgPlacementIds: orgRows.map((p) => p.id),
            blockedReason: candidate.blockedReason,
        });
    }

    rows.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        return a.label.localeCompare(b.label);
    });

    let emptyState: SurfaceCommandExposureEmptyState = "ok";
    if (input.candidates.length === 0) emptyState = "no_selected_commands";
    else if (rows.length === 0) emptyState = "none_valid_for_surface";

    return { rows, emptyState };
}

/** Reject Surface attempts to expose Commands outside the process-selected set. */
export function assertSurfaceMayExposeCommand(input: {
    capabilityKey: string;
    processSelectedKeys: ReadonlySet<string>;
    supported: boolean;
}): { ok: true } | { ok: false; reason: string } {
    const key = input.capabilityKey.trim();
    if (!key) return { ok: false, reason: "Command is required." };
    if (!input.processSelectedKeys.has(key)) {
        return {
            ok: false,
            reason: "This Command is not selected by the Business Process. Configure selection in Processes.",
        };
    }
    if (!input.supported) {
        return {
            ok: false,
            reason: "Alloy does not run this Command yet. Surfaces cannot make it runnable.",
        };
    }
    return { ok: true };
}
