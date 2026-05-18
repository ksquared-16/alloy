/** Layout settings hub — entity tabs (matches effective-preview API support). */

export const LAYOUT_SETTINGS_ENTITY_ORDER = ["opportunity", "job", "schedule"] as const;

export type LayoutSettingsEntityKey = (typeof LAYOUT_SETTINGS_ENTITY_ORDER)[number];

const ALLOWED = new Set<string>(LAYOUT_SETTINGS_ENTITY_ORDER);

export function normalizeLayoutSettingsEntity(raw: string | undefined): LayoutSettingsEntityKey {
    const t = (raw ?? "").trim().toLowerCase();
    return ALLOWED.has(t) ? (t as LayoutSettingsEntityKey) : "opportunity";
}

export function layoutSettingsSupportsSectionOrder(entity: LayoutSettingsEntityKey): boolean {
    return entity === "opportunity";
}

export function layoutSettingsSupportsSectionConfig(entity: LayoutSettingsEntityKey): boolean {
    return entity === "opportunity";
}

export function layoutSettingsSupportsAddSection(entity: LayoutSettingsEntityKey): boolean {
    return entity === "opportunity";
}

export function layoutSettingsAddSectionUnavailableCopy(entity: LayoutSettingsEntityKey): string {
    if (entity === "opportunity") {
        return "Show a hidden drawer section using Add section, or reorder and rename sections below.";
    }
    return "Drawer section configuration for this record type is coming later.";
}
