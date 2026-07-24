"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    buildTuitionRateMap,
    formatRateCents,
    parseDollarsToCents,
    tuitionRateCellKey,
    type TuitionRateRow,
} from "@/lib/commercial/tuitionRates";
import { variantDisplayLabel } from "@/lib/programs/programOfferingVariants";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";
import { clearLocationOverride, upsertTuitionPrice } from "@/lib/financials/tuitionPlans/tuitionPlanClient";
import { readTuitionLocationApplicability } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";

export function TuitionPlanLocationsPanel({
    detail,
    snapshot,
    canMutate,
    onCompare,
    onReload,
    onManageLocations,
}: {
    detail: TuitionPlanDetailVm;
    snapshot: TuitionPlansSnapshot;
    canMutate: boolean;
    onCompare: () => void;
    onReload: () => void;
    onManageLocations?: () => void;
}) {
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
    const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cadenceKey = detail.billingFrequencyKey;
    const selectedLocation = snapshot.locations.find((row) => row.id === selectedLocationId) ?? null;
    const locationApplicability = useMemo(
        () => readTuitionLocationApplicability(detail.offering.metadata),
        [detail.offering.metadata],
    );
    const offeredLocationIds = useMemo(
        () => (locationApplicability.mode === "all" ? null : new Set(locationApplicability.locationIds)),
        [locationApplicability],
    );
    const isLocationOffered = (locationId: string): boolean =>
        offeredLocationIds == null || offeredLocationIds.has(locationId);

    const locationDetailRows = useMemo(() => {
        if (!selectedLocationId || !cadenceKey) return [];
        const orgMap = buildTuitionRateMap(snapshot.rates, null);
        const locMap = buildTuitionRateMap(snapshot.rates, selectedLocationId);
        return detail.variants.map((variant) => {
            const orgRate = orgMap.get(tuitionRateCellKey(variant.id, cadenceKey)) ?? null;
            const locRate = locMap.get(tuitionRateCellKey(variant.id, cadenceKey)) ?? null;
            const hasOverride = Boolean(locRate && locRate.location_id === selectedLocationId);
            const orgLabel =
                !orgRate || orgRate.not_offered ? "Not offered" : formatRateCents(orgRate.rate_cents);
            const locLabel =
                !hasOverride ? "Organization pricing"
                : locRate!.not_offered ? "Not offered"
                : formatRateCents(locRate!.rate_cents);
            return {
                variantId: variant.id,
                commitmentLabel: variantDisplayLabel(variant),
                orgLabel,
                locLabel,
                hasOverride,
                orgRate,
                locRate: hasOverride ? locRate : null,
            };
        });
    }, [cadenceKey, detail.variants, selectedLocationId, snapshot.rates]);

    const saveOverride = async (
        variantId: string,
        orgRate: TuitionRateRow | null,
        locRate: TuitionRateRow | null,
    ) => {
        if (!cadenceKey || !selectedLocationId) return;
        const cents = parseDollarsToCents(editDraft);
        if (cents == null) {
            setError("Enter a valid price.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await upsertTuitionPrice({
                existing: locRate,
                variantId,
                cadenceKey,
                locationId: selectedLocationId,
                rateCents: cents,
                effectiveStart: locRate?.effective_start ?? orgRate?.effective_start ?? null,
            });
            setEditingVariantId(null);
            setEditDraft("");
            onReload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save override.");
        } finally {
            setBusy(false);
        }
    };

    const returnToOrg = async (rateId: string) => {
        setBusy(true);
        setError(null);
        try {
            await clearLocationOverride(rateId);
            onReload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not clear override.");
        } finally {
            setBusy(false);
        }
    };

    if (selectedLocation) {
        return (
            <div className="space-y-4" data-testid="tuition-plan-locations-detail">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <button
                            type="button"
                            className="text-sm font-medium text-alloy-bend-pine hover:underline"
                            onClick={() => {
                                setSelectedLocationId(null);
                                setEditingVariantId(null);
                                setError(null);
                            }}
                            data-testid="tuition-plan-locations-back"
                        >
                            ← All Locations
                        </button>
                        <h3 className="mt-1 text-sm font-semibold text-alloy-midnight">{selectedLocation.name}</h3>
                    </div>
                    <ConfigurationSecondaryButton onClick={onCompare} data-testid="tuition-plan-locations-compare">
                        Compare Locations
                    </ConfigurationSecondaryButton>
                </div>

                {error ?
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}

                <div className="process-config-setup-card overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                        <thead>
                            <tr className="border-b border-alloy-stone/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                <th className="px-4 py-3">Enrollment Commitment</th>
                                <th className="px-4 py-3">Organization Price</th>
                                <th className="px-4 py-3">Location Price</th>
                                <th className="px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-alloy-stone/15">
                            {locationDetailRows.map((row) => (
                                <tr key={row.variantId} data-testid={`tuition-plan-location-row-${row.variantId}`}>
                                    <td className="px-4 py-3 font-medium text-alloy-midnight">{row.commitmentLabel}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/70">{row.orgLabel}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/70">
                                        {editingVariantId === row.variantId ?
                                            <input
                                                value={editDraft}
                                                onChange={(event) => setEditDraft(event.target.value)}
                                                className="config-runtime-input w-28"
                                                placeholder="$0"
                                                data-testid={`tuition-plan-location-edit-${row.variantId}`}
                                            />
                                        :   row.locLabel}
                                    </td>
                                    <td className="px-4 py-3">
                                        {canMutate ?
                                            <div className="flex flex-wrap gap-2">
                                                {editingVariantId === row.variantId ?
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="text-sm font-medium text-alloy-bend-pine hover:underline"
                                                            disabled={busy}
                                                            onClick={() => void saveOverride(row.variantId, row.orgRate, row.locRate)}
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="text-sm text-alloy-midnight/55 hover:underline"
                                                            onClick={() => {
                                                                setEditingVariantId(null);
                                                                setEditDraft("");
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                : row.hasOverride ?
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="text-sm font-medium text-alloy-bend-pine hover:underline"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                setEditingVariantId(row.variantId);
                                                                setEditDraft(
                                                                    row.locRate && !row.locRate.not_offered
                                                                        ? String(row.locRate.rate_cents / 100)
                                                                        : "",
                                                                );
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                        {row.locRate ?
                                                            <button
                                                                type="button"
                                                                className="text-sm text-alloy-midnight/55 hover:underline"
                                                                disabled={busy}
                                                                onClick={() => void returnToOrg(row.locRate!.id)}
                                                            >
                                                                Return to Organization
                                                            </button>
                                                        :   null}
                                                    </>
                                                :   <button
                                                        type="button"
                                                        className="text-sm font-medium text-alloy-bend-pine hover:underline"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            setEditingVariantId(row.variantId);
                                                            setEditDraft(
                                                                row.orgRate && !row.orgRate.not_offered
                                                                    ? String(row.orgRate.rate_cents / 100)
                                                                    : "",
                                                            );
                                                        }}
                                                    >
                                                        Override
                                                    </button>
                                                }
                                            </div>
                                        :   null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    const summaryText =
        locationApplicability.mode === "all" ?
            "This Tuition Plan is available at all locations."
        : locationApplicability.locationIds.length === 0 ?
            "No locations currently offer this Tuition Plan."
        :   `Offered at ${locationApplicability.locationIds.length} of ${snapshot.locations.length} location${
                snapshot.locations.length === 1 ? "" : "s"
            }.`;

    return (
        <div className="space-y-4" data-testid="tuition-plan-locations-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-alloy-midnight">Locations</h3>
                <div className="flex flex-wrap gap-2">
                    {canMutate && onManageLocations ?
                        <ConfigurationSecondaryButton
                            onClick={onManageLocations}
                            data-testid="tuition-plan-locations-manage"
                        >
                            Manage Locations
                        </ConfigurationSecondaryButton>
                    :   null}
                    <ConfigurationSecondaryButton onClick={onCompare} data-testid="tuition-plan-locations-compare-all">
                        Compare Locations
                    </ConfigurationSecondaryButton>
                </div>
            </div>

            <p className="text-sm text-alloy-midnight/65" data-testid="tuition-plan-locations-summary">
                {summaryText}
            </p>

            <div className="process-config-setup-card overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm" data-testid="tuition-plan-locations-table">
                    <thead>
                        <tr className="border-b border-alloy-stone/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                            <th className="px-4 py-3">Location</th>
                            <th className="px-4 py-3">Offered</th>
                            <th className="px-4 py-3">Pricing behavior</th>
                            <th className="px-4 py-3">Overrides</th>
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-alloy-stone/15">
                        {detail.locationSummaries.length === 0 ?
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-alloy-midnight/50">
                                    No Locations configured.
                                </td>
                            </tr>
                        :   detail.locationSummaries.map((row) => {
                                const offered = isLocationOffered(row.locationId);
                                return (
                                    <tr key={row.locationId} data-testid={`tuition-plan-location-summary-${row.locationId}`}>
                                        <td className="px-4 py-3">
                                            {offered ?
                                                <button
                                                    type="button"
                                                    className="font-medium text-alloy-bend-pine hover:underline"
                                                    onClick={() => setSelectedLocationId(row.locationId)}
                                                >
                                                    {row.locationName}
                                                </button>
                                            :   <span className="font-medium text-alloy-midnight/70">
                                                    {row.locationName}
                                                </span>
                                            }
                                        </td>
                                        <td className="px-4 py-3" data-testid={`tuition-plan-location-offered-${row.locationId}`}>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                    offered
                                                        ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                                        : "bg-alloy-stone/25 text-alloy-midnight/50"
                                                }`}
                                            >
                                                {offered ? "Yes" : "No"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-alloy-midnight/70">
                                            {offered ? row.behaviorLabel : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-alloy-midnight/60">
                                            {offered ? (row.overrideCount === 0 ? "None" : row.overrideCount) : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {offered ?
                                                <button
                                                    type="button"
                                                    className="text-sm font-medium text-alloy-bend-pine hover:underline"
                                                    onClick={() => setSelectedLocationId(row.locationId)}
                                                >
                                                    Manage pricing
                                                </button>
                                            : canMutate && onManageLocations ?
                                                <button
                                                    type="button"
                                                    className="text-sm font-medium text-alloy-bend-pine hover:underline"
                                                    onClick={onManageLocations}
                                                    data-testid={`tuition-plan-location-add-${row.locationId}`}
                                                >
                                                    Add
                                                </button>
                                            :   <span className="text-sm text-alloy-midnight/40">—</span>}
                                        </td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
}
