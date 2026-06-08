"use client";

import { useState } from "react";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import { opportunityDrawerVmStatusLabelFromControl } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmStatusReconciliation";

type Props = {
    status: StatusControlVm;
    canMutate: boolean;
    onStatusChange?: (statusKey: string) => void;
};

function ReadonlyStatusPill({ label }: { label: string }) {
    return (
        <div
            className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
            data-opportunity-drawer-vm-status-control="true"
            data-vm-runtime-status="readonly"
            data-status-debug-owner="vm-readonly-pill"
        >
            <span className="sr-only">Opportunity status</span>
            <span className="inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90">
                {label || "—"}
            </span>
        </div>
    );
}

/**
 * VM-only status control — stable readonly pill on first paint; dropdown only after explicit interaction.
 */
export default function VmOpportunityStatusControl({ status, canMutate, onStatusChange }: Props) {
    const [dropdownOpen, setDropdownOpen] = useState(false);

    if (status.renderAs === "hidden") return null;

    const label = opportunityDrawerVmStatusLabelFromControl(status);

    if (status.renderAs === "readonly_pill" || !dropdownOpen) {
        const interactive = status.renderAs === "dropdown" && canMutate;
        return (
            <div
                className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
                data-opportunity-drawer-vm-status-control="true"
                data-vm-runtime-status="readonly"
                data-status-debug-owner={interactive ? "vm-dropdown" : "vm-readonly-pill"}
            >
                <span className="sr-only">Opportunity status</span>
                {interactive ?
                    <button
                        type="button"
                        onClick={() => setDropdownOpen(true)}
                        className="inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90 shadow-md shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 hover:border-alloy-blue/35 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                        aria-label={`Opportunity status: ${label}. Activate to change.`}
                    >
                        {label || "—"}
                    </button>
                :   <span className="inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90">
                        {label || "—"}
                    </span>
                }
            </div>
        );
    }

    const key = status.status_key?.trim() ?? "";
    const options = status.options?.length
        ? status.options
        : key
          ? [{ status_key: key, label, sort_order: 0 }]
          : [];

    if (!key && options.length === 0) {
        return <ReadonlyStatusPill label={label} />;
    }

    return (
        <div
            className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]"
            data-opportunity-drawer-vm-status-control="true"
            data-vm-runtime-status="dropdown"
            data-status-debug-owner="vm-dropdown"
        >
            <span className="sr-only">Opportunity status</span>
            <select
                value={key}
                disabled={!canMutate}
                autoFocus
                onChange={(e) => onStatusChange?.(e.target.value)}
                onBlur={() => setDropdownOpen(false)}
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
