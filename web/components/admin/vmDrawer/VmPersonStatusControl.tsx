"use client";

type Props = {
    statusLabel: string | null | undefined;
    entityLabel?: string;
};

/** VM-only person/child status — no skeleton, no status-options fetch. */
export default function VmPersonStatusControl({ statusLabel, entityLabel = "Person status" }: Props) {
    const label = statusLabel?.trim() || "—";
    return (
        <div
            className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
            data-person-drawer-vm-status-control="true"
            data-vm-runtime-status="readonly"
        >
            <span className="sr-only">{entityLabel}</span>
            <span className="inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90">
                {label}
            </span>
        </div>
    );
}
