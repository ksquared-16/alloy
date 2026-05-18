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

export function layoutSettingsSupportsAddSection(_entity: LayoutSettingsEntityKey): boolean {
    return false;
}

export function layoutSettingsAddSectionUnavailableCopy(): string {
    return "Adding new drawer sections is not available in Settings yet. You can reorder existing inquiry sections below. New sections require a platform release.";
}
