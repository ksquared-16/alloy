"use client";

type Props = {
    label: string;
    /** Screen-reader prefix, e.g. "Opportunity status". */
    entityLabel?: string;
};

/**
 * Pure readonly status pill for VM drawer first paint — no hooks, no fetch, no mutation.
 */
export default function VmReadonlyStatusPill({ label, entityLabel = "Status" }: Props) {
    const text = label.trim() || "Status unavailable";

    return (
        <div
            className="flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[15rem]"
            data-vm-readonly-status-pill="true"
            data-opportunity-drawer-vm-status="true"
            data-status-debug-owner="vm-readonly-pill"
        >
            <span className="sr-only">{entityLabel}</span>
            <span className="inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90">
                {text}
            </span>
        </div>
    );
}
