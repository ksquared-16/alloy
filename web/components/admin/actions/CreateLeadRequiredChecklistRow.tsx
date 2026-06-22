"use client";

import { Check } from "lucide-react";
import SelectFieldControl from "@/components/admin/fields/SelectFieldControl";
import type { CreateLeadRequiredChecklistItem } from "@/lib/admin/actions/createLead/resolveCreateLeadRequiredChecklist";

type LocationPickerProps = {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
};

type Props = {
    items: readonly CreateLeadRequiredChecklistItem[];
    className?: string;
    locationPicker?: LocationPickerProps;
};

function statusLabel(status: CreateLeadRequiredChecklistItem["status"]): string {
    if (status === "missing") return "Missing";
    if (status === "ambiguous") return "Ambiguous";
    return "—";
}

/** Compact required-to-create status row above commit preview. */
export function CreateLeadRequiredChecklistRow({ items, className = "", locationPicker }: Props) {
    if (!items.length) return null;

    const locationItem = items.find((item) => item.key === "location");
    const showLocationPicker =
        locationPicker &&
        locationItem &&
        (locationItem.status === "missing" || locationItem.status === "ambiguous");

    return (
        <div
            className={`rounded-lg border border-alloy-stone/10 bg-white px-2.5 py-2 ${className}`}
            data-testid="create-lead-required-checklist"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/45">
                Required to create
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {items.map((item) => (
                    <li
                        key={item.key}
                        className="flex items-center gap-1 text-[11px] text-alloy-midnight/70"
                        data-testid={`create-lead-required-item-${item.key}`}
                        data-status={item.status}
                    >
                        <span>{item.label}</span>
                        {item.status === "ok" ?
                            <span className="inline-flex items-center gap-0.5 font-semibold text-[#007A63]">
                                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            </span>
                        : item.status === "missing" || item.status === "ambiguous" ?
                            <span
                                className={`font-semibold ${
                                    item.status === "ambiguous" ? "text-amber-700" : "text-amber-800"
                                }`}
                            >
                                {statusLabel(item.status)}
                            </span>
                        :   <span className="text-alloy-midnight/40">{statusLabel(item.status)}</span>}
                    </li>
                ))}
            </ul>
            {showLocationPicker ?
                <div className="mt-2" data-testid="create-lead-household-location-picker">
                    <label className="block text-[11px] font-medium text-alloy-midnight/65">
                        Select location
                        <SelectFieldControl
                            value={locationPicker.value}
                            onChange={locationPicker.onChange}
                            options={locationPicker.options}
                            placeholder="Choose a site"
                            className="mt-1 w-full rounded-md border border-alloy-stone/12 bg-white px-2 py-1.5 text-[12px]"
                            data-testid="create-lead-household-location-select"
                            aria-label="Location"
                        />
                    </label>
                </div>
            :   null}
        </div>
    );
}
