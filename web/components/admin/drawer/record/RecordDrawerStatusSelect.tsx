"use client";

type StatusDefOption = {
    status_key: string;
    status_label: string | null;
    sort_order: number;
    is_active: boolean;
};

type Props = {
    entityLabel: string;
    currentStatus: string;
    statusDisplayLabel: string | null;
    statusDefs: StatusDefOption[];
    disabled?: boolean;
    onChange: (statusKey: string) => void;
};

/** Header status control — hidden when org has no configured status definitions and record has no status. */
export function RecordDrawerStatusSelect({
    entityLabel,
    currentStatus,
    statusDisplayLabel,
    statusDefs,
    disabled,
    onChange,
}: Props) {
    const activeDefs = statusDefs.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const current = String(currentStatus ?? "").trim();
    if (activeDefs.length === 0 && !current) return null;

    const label =
        statusDisplayLabel?.trim() ||
        activeDefs.find((s) => s.status_key === current)?.status_label?.trim() ||
        current ||
        "Status";

    if (activeDefs.length === 0) {
        return (
            <span
                className="inline-flex items-center rounded-full border border-alloy-stone/25 bg-alloy-stone/10 px-2 py-0.5 text-[11px] font-semibold text-alloy-midnight/75"
                data-record-drawer-header-status="badge"
            >
                {label}
            </span>
        );
    }

    return (
        <label
            className="inline-flex min-w-0 items-center gap-1.5"
            data-record-drawer-header-status="select"
            data-status-debug-owner="legacy-dropdown"
        >
            <span className="sr-only">{entityLabel} status</span>
            <select
                value={current}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className="max-w-[10rem] truncate rounded-md border border-alloy-stone/35 bg-white px-2 py-1 text-xs font-medium text-alloy-midnight/85 disabled:opacity-60"
                aria-label={`${entityLabel} status`}
            >
                {current && !activeDefs.some((s) => s.status_key === current) ? (
                    <option value={current}>{label}</option>
                ) : null}
                {activeDefs.map((s) => (
                    <option key={s.status_key} value={s.status_key}>
                        {s.status_label ?? s.status_key}
                    </option>
                ))}
            </select>
        </label>
    );
}
