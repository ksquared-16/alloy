"use client";

import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

type Props = {
    status: StatusControlVm;
    canMutate: boolean;
    onStatusChange?: (statusKey: string) => void;
};

/**
 * VM-only status control — no skeleton, no null branch, no status-options API.
 */
export default function VmOpportunityStatusControl({ status, canMutate, onStatusChange }: Props) {
    if (status.renderAs === "hidden") return null;

    if (status.renderAs === "readonly_pill") {
        return (
            <div
                className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
                data-opportunity-drawer-vm-status-control="true"
                data-vm-runtime-status="readonly"
            >
                <span className="sr-only">Opportunity status</span>
                <span className="inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90">
                    {status.label || "—"}
                </span>
            </div>
        );
    }

    const key = status.status_key?.trim() ?? "";
    const label = status.label?.trim() || key || "Status";
    const options = status.options?.length
        ? status.options
        : key
          ? [{ status_key: key, label, sort_order: 0 }]
          : [];

    if (!key && options.length === 0) {
        return (
            <div
                className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
                data-opportunity-drawer-vm-status-control="true"
                data-vm-runtime-status="disabled"
            >
                <span className="sr-only">Opportunity status</span>
                <select
                    value=""
                    disabled
                    className="w-full min-w-0 rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90 opacity-60"
                    aria-label="Opportunity status"
                >
                    <option value="">{label}</option>
                </select>
            </div>
        );
    }

    return (
        <div
            className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
            data-opportunity-drawer-vm-status-control="true"
            data-vm-runtime-status="dropdown"
        >
            <span className="sr-only">Opportunity status</span>
            <select
                value={key}
                disabled={!canMutate}
                onChange={(e) => onStatusChange?.(e.target.value)}
                className="w-full min-w-0 rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90 shadow-md shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 disabled:opacity-60"
                aria-label="Opportunity status"
            >
                {options.map((o) => (
                    <option key={o.status_key} value={o.status_key}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
