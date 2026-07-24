"use client";

import { useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    LocationMultiSelect,
    type LocationApplicabilityMode,
} from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";
import { GlCodeSelect } from "@/components/adminV2/settings/configurationRuntime/GlCodeSelect";
import { ATTENDANCE_TYPE_LABELS, type AttendanceType } from "@/lib/programs/programOfferings";
import { cadenceLabel, type BillingCadence } from "@/lib/commercial/billingCadences";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

const CARE_FORMATS = Object.entries(ATTENDANCE_TYPE_LABELS) as [AttendanceType, string][];

export function TuitionPlanEditDialog({
    detail,
    cadences,
    revenueCategories,
    locations,
    initialLocationMode = "all",
    initialLocationIds = [],
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    detail: TuitionPlanDetailVm;
    cadences: BillingCadence[];
    revenueCategories?: { id: string; label: string }[];
    locations: { id: string; name: string }[];
    initialLocationMode?: LocationApplicabilityMode;
    initialLocationIds?: string[];
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: {
        name: string;
        careFormat: AttendanceType;
        billingFrequencyKey: string;
        revenueCategoryId: string | null;
        status: "active" | "draft" | "archived";
        locationMode: LocationApplicabilityMode;
        locationIds: string[];
    }) => void;
}) {
    const [name, setName] = useState(detail.name);
    const [careFormat, setCareFormat] = useState(detail.careFormat);
    const [billingFrequencyKey, setBillingFrequencyKey] = useState(detail.billingFrequencyKey ?? cadences[0]?.item_key ?? "monthly");
    const [revenueCategoryId, setRevenueCategoryId] = useState(detail.revenueCategoryId ?? "");
    const [status, setStatus] = useState<"active" | "draft" | "archived">(
        detail.status === "archived" ? "archived" : detail.status === "draft" ? "draft" : "active",
    );
    const [frequencyWarning, setFrequencyWarning] = useState(false);
    const [locationMode, setLocationMode] = useState<LocationApplicabilityMode>(initialLocationMode);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(initialLocationIds);

    const billingChanged = billingFrequencyKey !== (detail.billingFrequencyKey ?? "");

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-edit-title"
            data-testid="tuition-plan-edit-dialog"
        >
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="tuition-edit-title" className="text-lg font-semibold text-alloy-midnight">
                        Edit Tuition Plan
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">Update plan details — prices are managed separately.</p>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}

                    <label>
                        <span className="config-typo-field-label">Plan name *</span>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="config-runtime-input mt-1"
                            data-testid="tuition-edit-name"
                            autoFocus
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">Care format</span>
                        <select
                            value={careFormat}
                            onChange={(event) => setCareFormat(event.target.value as AttendanceType)}
                            className="config-runtime-select mt-1"
                            data-testid="tuition-edit-care-format"
                        >
                            {CARE_FORMATS.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="config-typo-field-label">Billing Frequency</span>
                        <select
                            value={billingFrequencyKey}
                            onChange={(event) => {
                                setBillingFrequencyKey(event.target.value);
                                setFrequencyWarning(true);
                            }}
                            className="config-runtime-select mt-1"
                            data-testid="tuition-edit-frequency"
                        >
                            {cadences.map((cadence) => (
                                <option key={cadence.item_key} value={cadence.item_key}>
                                    {cadenceLabel(cadence.item_key, cadences)}
                                </option>
                            ))}
                        </select>
                    </label>
                    {billingChanged && frequencyWarning ?
                        <p className="rounded-lg border border-alloy-stone/30 bg-alloy-stone/10 px-3 py-2 text-sm text-alloy-midnight/70">
                            Changing Billing Frequency affects how existing prices are interpreted. Review Tuition Options after saving.
                        </p>
                    :   null}
                    <GlCodeSelect
                        value={revenueCategoryId || null}
                        onChange={(nextRevenueCategoryId) => setRevenueCategoryId(nextRevenueCategoryId ?? "")}
                        testId="tuition-edit-gl"
                        label="Revenue GL"
                    />
                    <label>
                        <span className="config-typo-field-label">Status</span>
                        <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value as "active" | "draft" | "archived")}
                            className="config-runtime-select mt-1"
                            data-testid="tuition-edit-status"
                        >
                            <option value="active">Active</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Archived</option>
                        </select>
                    </label>
                    <LocationMultiSelect
                        locations={locations}
                        mode={locationMode}
                        selectedIds={selectedLocationIds}
                        onModeChange={setLocationMode}
                        onSelectedIdsChange={setSelectedLocationIds}
                        testId="tuition-edit-locations"
                    />
                </div>

                <div className="flex justify-end gap-2 border-t border-alloy-stone/20 px-5 py-4">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={busy || !name.trim()}
                        onClick={() =>
                            onSubmit({
                                name: name.trim(),
                                careFormat,
                                billingFrequencyKey,
                                revenueCategoryId: revenueCategoryId.trim() || null,
                                status,
                                locationMode,
                                locationIds: selectedLocationIds,
                            })
                        }
                        data-testid="tuition-edit-submit"
                    >
                        {busy ? "Saving…" : "Save Changes"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}
