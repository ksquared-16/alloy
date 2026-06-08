"use client";

import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import RecordDrawerPremiumHeader from "@/components/admin/drawer/record/RecordDrawerPremiumHeader";
import { locationDrawerKind } from "@/lib/admin/location/locationDrawerPresentation";
import { formatLocationTypeLabel } from "@/lib/admin/locationListPresentation";

type OpenDrawer = (type: string, id: string) => void;

/** Compact location context — editable fields live in body sections only. */
export default function LocationDrawerContextPanel({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer?: OpenDrawer;
}) {
    const label = String(record.label ?? record.address1 ?? "").trim() || "Location";
    const locationType = formatLocationTypeLabel(record.location_type as string | null);
    const kind = locationDrawerKind(record.location_type as string | null);
    const parentId = String(record.parent_location_id ?? "").trim();
    const parentLabel = String(record._parent_location_label ?? "").trim();
    const isActive = record.is_active !== false;
    const childCount = Number(record._child_location_count ?? 0);

    const chips = (
        <>
            <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/70">
                {locationType}
            </span>
            {!isActive ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    Inactive
                </span>
            ) : null}
            {kind === "site" && childCount > 0 ? (
                <span className="text-[10px] font-medium text-alloy-midnight/50">{childCount} rooms</span>
            ) : null}
        </>
    );

    const contextRows =
        kind === "unit" && parentLabel ? (
            <p className="text-xs text-alloy-midnight/65">
                Parent site{" "}
                {parentId && onOpenDrawer ? (
                    <button
                        type="button"
                        onClick={() => onOpenDrawer("locations", parentId)}
                        className="font-medium text-alloy-blue hover:underline"
                    >
                        {parentLabel}
                    </button>
                ) : (
                    <span className="font-medium text-alloy-midnight/80">{parentLabel}</span>
                )}
            </p>
        ) : null;

    return (
        <RecordDrawerContextPanel data-record-drawer-context="location">
            <RecordDrawerPremiumHeader chips={chips} title={label} contextRows={contextRows} />
        </RecordDrawerContextPanel>
    );
}
