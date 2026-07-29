"use client";

import { useEffect, useMemo, useState } from "react";

import { ActionModalStatusMessage } from "@/components/admin/opportunity/actions/ActionModalStatusMessage";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    childDisplayNameFromInquiryRow,
    listInheritingInquiryChildren,
    type InquiryChildLocationRow,
} from "@/lib/admin/actions/changeLeadLocationContract";
import { submitChangeLeadLocation } from "@/lib/admin/actions/submitChangeLeadLocation";
import { useOperationalPlacementOptions } from "@/lib/childcareOperational/useOperationalPlacementOptions";
import { resolveOpportunityLeadLocationFields } from "@/lib/opportunities/resolveOpportunityDisplayLocation";

const SUCCESS_DISMISS_MS = 1600;

type Props = {
    open: boolean;
    opportunityId: string;
    record: Record<string, unknown> | null | undefined;
    onClose: () => void;
    onSuccess?: (nextRecord: Record<string, unknown> | null) => void;
};

export function ChangeLeadLocationModal({
    open,
    opportunityId,
    record,
    onClose,
    onSuccess,
}: Props) {
    const lead = useMemo(
        () => resolveOpportunityLeadLocationFields(record ?? {}),
        [record],
    );
    const inquiryChildren = useMemo((): InquiryChildLocationRow[] => {
        const raw = Array.isArray(record?._inquiry_children) ? record!._inquiry_children : [];
        return mapRawInquiryChildrenToDrawerRows(raw).map((row) => ({
            id: row.id,
            ocm_id: row.ocm_id,
            customer_member_id: row.customer_member_id,
            location_id: row.location_id,
            location_label: row.location_label,
            display_name: row.display_name,
            first_name: row.first_name,
            last_name: row.last_name,
        }));
    }, [record]);
    const inheriting = useMemo(
        () => listInheritingInquiryChildren(inquiryChildren),
        [inquiryChildren],
    );

    const [locationId, setLocationId] = useState(lead.locationId);
    const [applyToInheriting, setApplyToInheriting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const placement = useOperationalPlacementOptions(locationId, "");

    useEffect(() => {
        if (!open) return;
        setLocationId(lead.locationId);
        setApplyToInheriting(false);
        setBusy(false);
        setError(null);
        setSuccessMessage(null);
    }, [open, lead.locationId, opportunityId]);

    const selectedLabel = useMemo(() => {
        const match = (placement.siteOptions ?? []).find((o) => o.value === locationId.trim());
        return match?.label?.trim() || lead.locationLabel || "";
    }, [placement.siteOptions, locationId, lead.locationLabel]);

    const canSubmit = useMemo(() => {
        if (busy || successMessage) return false;
        const next = locationId.trim();
        if (!next) return false;
        return next !== lead.locationId.trim() || applyToInheriting;
    }, [busy, successMessage, locationId, lead.locationId, applyToInheriting]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy && !successMessage ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label="Change lead location">
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">Change lead location</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Updates the family default site. Children keep their own sites unless you
                            choose to update those still inheriting.
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                    {successMessage ?
                        <ActionModalStatusMessage type="success" message={successMessage} />
                    :   <>
                            <div>
                                <div className={label}>Lead location</div>
                                <div className="mt-1.5">
                                    <AlloySelect
                                        value={locationId}
                                        onChange={setLocationId}
                                        options={placement.siteOptions ?? []}
                                        disabled={busy}
                                        aria-label="Lead location"
                                        testId="change-lead-location-select"
                                    />
                                </div>
                            </div>
                            {inheriting.length > 0 ?
                                <label className="flex items-start gap-2 text-[13px] text-alloy-midnight/80">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={applyToInheriting}
                                        disabled={busy}
                                        onChange={(e) => setApplyToInheriting(e.target.checked)}
                                        data-testid="change-lead-location-apply-inheriting"
                                    />
                                    <span>
                                        Also set location for {inheriting.length === 1 ? "child" : "children"}{" "}
                                        without their own site
                                        <span className="block text-[12px] text-alloy-midnight/55">
                                            {inheriting
                                                .map((row) => childDisplayNameFromInquiryRow(row))
                                                .join(", ")}
                                        </span>
                                    </span>
                                </label>
                            :   <p className="text-[12px] text-alloy-midnight/55">
                                    Every child already has their own site — only the lead default will
                                    change.
                                </p>
                            }
                        </>
                    }
                    {error ?
                        <ActionModalStatusMessage type="error" message={error} />
                    :   null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        {successMessage ? "Done" : "Cancel"}
                    </button>
                    {!successMessage ?
                        <button
                            type="button"
                            disabled={!canSubmit}
                            data-testid="change-lead-location-save"
                            onClick={async () => {
                                setBusy(true);
                                setError(null);
                                try {
                                    const result = await submitChangeLeadLocation({
                                        opportunityId,
                                        locationId,
                                        locationLabel: selectedLabel,
                                        applyToInheritingChildren: applyToInheriting,
                                        inquiryChildren,
                                        record,
                                    });
                                    const suffix =
                                        result.updatedChildCount > 0
                                            ? ` Updated ${result.updatedChildCount} ${result.updatedChildCount === 1 ? "child" : "children"}.`
                                            : "";
                                    setSuccessMessage(`Lead location saved.${suffix}`);
                                    onSuccess?.(result.nextRecord);
                                    window.setTimeout(() => onClose(), SUCCESS_DISMISS_MS);
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : "Could not save location");
                                } finally {
                                    setBusy(false);
                                }
                            }}
                            className="rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-semibold text-white hover:bg-alloy-midnight/90 disabled:opacity-50"
                        >
                            {busy ? "Saving…" : "Save"}
                        </button>
                    :   null}
                </div>
            </div>
        </>
    );
}
