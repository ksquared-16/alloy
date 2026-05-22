/**
 * Sidebar / shell nav label for a work unit row.
 * Uses tenant metadata when set; aligns canonical enrollment keys with KPI/dept copy
 * so queue-definition product names (e.g. "Enrollment Pipeline") are not shown as WU titles.
 */

export type WorkspaceNavWorkUnitLabelInput = {
    name: string | null;
    key?: string | null;
    metadata?: unknown;
};

function metadataStringLabel(metadata: unknown): string | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const m = metadata as Record<string, unknown>;
    for (const field of ["nav_label", "display_name", "label"]) {
        const v = m[field];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

function humanizeKey(key: string): string {
    return key
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function resolveWorkspaceNavWorkUnitLabel(wu: WorkspaceNavWorkUnitLabelInput): string {
    const fromMeta = metadataStringLabel(wu.metadata);
    if (fromMeta) return fromMeta;

    const key = (wu.key ?? "").trim().toLowerCase();
    if (key === "enrollment_pipeline" || key === "pipeline_overview") {
        return "Active inquiries";
    }
    if (key === "needs_attention") {
        return "Needs attention";
    }

    const name = (wu.name ?? "").trim();
    if (name) return name;
    if (key) return humanizeKey(key);
    return "Untitled work unit";
}
