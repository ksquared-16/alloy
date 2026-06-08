"use client";

type Props = {
    statusLabel: string | null | undefined;
    entityLabel?: string;
};

/** VM-only person/child status — readonly pill from VM header; unset shows neutral dash. */
export default function VmPersonStatusControl({ statusLabel, entityLabel = "Person status" }: Props) {
    const trimmed = statusLabel?.trim() ?? "";
    const unset = !trimmed;
    const label = unset ? "—" : trimmed;
    return (
        <div
            className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
            data-person-drawer-vm-status-control="true"
            data-vm-runtime-status="readonly"
            data-vm-status-unset={unset ? "true" : undefined}
        >
            <span className="sr-only">{entityLabel}</span>
            <span
                className={`inline-flex rounded-full border px-3 py-2 text-[12px] font-semibold ${
                    unset ?
                        "border-alloy-stone/20 bg-alloy-stone/5 text-alloy-midnight/45"
                    :   "border-alloy-stone/30 bg-white text-alloy-midnight/90"
                }`}
            >
                {label}
            </span>
        </div>
    );
}
