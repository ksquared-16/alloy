/**
 * Operator-facing labels and help for Settings → Action buttons.
 * Maps storage surfaces/slots to plain language (no execution changes).
 */

import type { ActionSlot, ActionSurface } from "@/lib/admin/actions/types";
import { ACTION_PLACEMENT_SLOTS } from "@/lib/admin/actions/actionPlacementMutation";

export const ACTION_BUTTON_OWNERSHIP_COPY =
    "Built-in buttons are provided by the platform. You can control placement and enablement where supported. Org-created buttons are fully editable within approved action types.";

/** Surfaces operators may assign in Settings (storage values). */
export const SETTINGS_EDITABLE_SURFACES: readonly ActionSurface[] = [
    "record_header",
    "record_section",
    "right_rail",
    "queue_row",
    "workspace",
] as const;

export type SettingsSurfaceOption = {
    value: ActionSurface;
    label: string;
    description: string;
    requiresSectionKey: boolean;
};

export const SETTINGS_SURFACE_OPTIONS: readonly SettingsSurfaceOption[] = [
    {
        value: "record_header",
        label: "Record header",
        description: "Top of the record (Focus Panel header) when viewing a record.",
        requiresSectionKey: false,
    },
    {
        value: "record_section",
        label: "Record section",
        description:
            "Inside a specific record section (Focus Panel card). Use the section key from Record layouts (for example details or inquiry_children).",
        requiresSectionKey: true,
    },
    {
        value: "right_rail",
        label: "Workspace (side panel)",
        description: "Department or work-unit workspace side panel on /workspace/dept and /workspace/work-unit routes.",
        requiresSectionKey: false,
    },
    {
        value: "queue_row",
        label: "Workspace queue row",
        description: "Inline actions on a queue row in the workspace pipeline.",
        requiresSectionKey: false,
    },
    {
        value: "workspace",
        label: "Workspace root",
        description: "Operator workspace landing (/workspace) actions rail.",
        requiresSectionKey: false,
    },
] as const;

export type SettingsSlotOption = {
    value: ActionSlot;
    label: string;
    description: string;
};

export const SETTINGS_SLOT_OPTIONS: readonly SettingsSlotOption[] = [
    { value: "primary", label: "Primary", description: "Prominent main action." },
    { value: "secondary", label: "Secondary", description: "Supporting action next to the primary control." },
    { value: "overflow", label: "Overflow", description: "More menu or overflow actions." },
    { value: "row_inline", label: "Inline", description: "Appears inline on a queue row." },
    { value: "right_rail", label: "Side rail", description: "Workspace right-rail menu position." },
    { value: "header", label: "Header strip", description: "Header strip on record or workspace chrome." },
] as const;

/** Slots commonly used per surface — all schema slots remain valid. */
const PREFERRED_SLOTS_BY_SURFACE: Partial<Record<ActionSurface, readonly ActionSlot[]>> = {
    record_header: ["primary", "secondary", "overflow", "header"],
    record_section: ["primary", "secondary", "overflow"],
    queue_row: ["row_inline", "overflow"],
    right_rail: ["right_rail", "primary", "overflow"],
    workspace: ["primary", "right_rail", "secondary", "overflow"],
};

export function operatorConfigurationSurfaceLabel(surface: string): string {
    if (surface === "queue_row") return "Queue row";
    if (surface === "record_header") return "Focus Panel header";
    if (surface === "record_section") return "Focus Panel card";
    if (surface === "right_rail") return "BOS rail";
    if (surface === "workspace") return "Workspace context";
    return settingsSurfaceLabel(surface);
}

export function operatorConfigurationSurfaceDescription(surface: string): string | undefined {
    return settingsSurfaceOption(surface)?.description;
}

export function settingsSurfaceOption(surface: string): SettingsSurfaceOption | undefined {
    return SETTINGS_SURFACE_OPTIONS.find((o) => o.value === surface);
}

export function settingsSurfaceLabel(surface: string): string {
    return settingsSurfaceOption(surface)?.label ?? surface.replace(/_/g, " ");
}

export function settingsSurfaceDescription(surface: string): string | undefined {
    return settingsSurfaceOption(surface)?.description;
}

export function settingsSlotOption(slot: string): SettingsSlotOption | undefined {
    return SETTINGS_SLOT_OPTIONS.find((o) => o.value === slot);
}

export function settingsSlotLabel(slot: string): string {
    return settingsSlotOption(slot)?.label ?? slot.replace(/_/g, " ");
}

export function settingsSlotDescription(slot: string): string | undefined {
    return settingsSlotOption(slot)?.description;
}

/** Slot choices for a surface: preferred ordering first, then any other valid slots. */
export function settingsSlotsForSurface(surface: string): SettingsSlotOption[] {
    const preferred = PREFERRED_SLOTS_BY_SURFACE[surface as ActionSurface];
    const valid = new Set<string>(ACTION_PLACEMENT_SLOTS);
    const ordered: SettingsSlotOption[] = [];
    for (const sk of preferred ?? []) {
        const opt = settingsSlotOption(sk);
        if (opt) ordered.push(opt);
    }
    for (const opt of SETTINGS_SLOT_OPTIONS) {
        if (!ordered.some((o) => o.value === opt.value) && valid.has(opt.value)) {
            ordered.push(opt);
        }
    }
    return ordered;
}

export function surfaceRequiresSectionKey(surface: string): boolean {
    return settingsSurfaceOption(surface)?.requiresSectionKey === true;
}

export const RECORD_TYPE_HELP =
    "Limits which record type this button applies to. Leave as Any only when the action supports all types.";
