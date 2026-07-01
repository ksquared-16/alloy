import type { StatusOptionVm } from "@/lib/adminV2/viewModel/drawer/types";

/** Raw row from `/api/admin/status-options` or embedded VM status defs. */
export type StatusDropdownOptionRow = {
    value?: string;
    status_key?: string;
    label?: string;
    status_label?: string | null;
    sort_order?: number;
    is_active?: boolean;
};

/**
 * Map status definition rows to drawer menu options.
 * Display copy always prefers human labels (`label` / `status_label`) over raw `status_key`.
 */
export function mapStatusDropdownOptions(rows: StatusDropdownOptionRow[]): StatusOptionVm[] {
    return rows
        .filter((r) => r.is_active !== false)
        .map((r) => {
            const status_key = (r.status_key ?? r.value ?? "").trim();
            const label = (r.label ?? r.status_label ?? "").trim() || status_key;
            return {
                status_key,
                label,
                sort_order: r.sort_order ?? 0,
            };
        })
        .filter((o) => o.status_key.length > 0)
        .sort((a, b) =>
            a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label)
        );
}

/** True when UI shows operator-facing copy instead of the raw persisted key. */
export function statusDropdownDisplayUsesLabel(status_key: string, label: string): boolean {
    const key = status_key.trim();
    const text = label.trim();
    if (!key || !text) return false;
    return text !== key;
}
