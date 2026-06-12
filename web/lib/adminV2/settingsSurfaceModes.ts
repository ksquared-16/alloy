/** Operator-facing settings surface classification (Card 1 — truthfulness, no runtime effect). */

export type SettingsSurfaceMode = "editable" | "read_only" | "partial" | "related_hub";

const PREFIX: Record<SettingsSurfaceMode, string> = {
    editable: "Editable",
    read_only: "Read-only",
    partial: "Partial",
    related_hub: "Related hub",
};

/** Short prefix for settings tile descriptions, e.g. "Editable · …" */
export function settingsSurfacePrefix(mode: SettingsSurfaceMode): string {
    return `${PREFIX[mode]} · `;
}
