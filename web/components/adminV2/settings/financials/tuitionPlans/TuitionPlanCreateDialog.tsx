"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    LocationMultiSelect,
    type LocationApplicabilityMode,
} from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";
import { GlCodeSelect } from "@/components/adminV2/settings/configurationRuntime/GlCodeSelect";
import { ATTENDANCE_TYPE_LABELS, type AttendanceType, type ProgramOffering } from "@/lib/programs/programOfferings";
import type { ProgramOfferingVariant } from "@/lib/programs/programOfferingVariants";
import { autoVariantLabel } from "@/lib/programs/programOfferingVariants";
import { cadenceLabel, type BillingCadence } from "@/lib/commercial/billingCadences";
import { formatRateCents, parseDollarsToCents } from "@/lib/commercial/tuitionRates";
import { todayIso } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import type { CreateTuitionPlanInput } from "@/lib/financials/tuitionPlans/tuitionPlanClient";
import { occupiedCareFormatsForProgram } from "@/lib/financials/tuitionPlans/occupiedCareFormats";

const CARE_FORMATS = Object.entries(ATTENDANCE_TYPE_LABELS) as [AttendanceType, string][];

const STEPS = ["Define Plan", "Enrollment Commitments", "Starting Tuition", "Review & Create"] as const;

function deriveDefaultDayCounts(variants: ProgramOfferingVariant[], configuredDays: number[]): number[] {
    const values = new Set<number>();
    for (const variant of variants) {
        if (
            variant.quantity_type === "days" &&
            variant.quantity_value != null &&
            variant.quantity_value >= 1 &&
            variant.quantity_value <= 7
        ) {
            values.add(variant.quantity_value);
        }
    }
    if (values.size > 0) return [...values].sort((a, b) => a - b);
    return configuredDays.length > 0 ? configuredDays : [1, 2, 3, 4, 5];
}

export function TuitionPlanCreateDialog({
    programs,
    cadences,
    revenueCategories,
    existingVariants,
    dayCommitments,
    locations,
    offerings,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    programs: { key: string; label: string }[];
    cadences: BillingCadence[];
    revenueCategories?: { id: string; label: string }[];
    existingVariants: ProgramOfferingVariant[];
    dayCommitments: number[];
    locations: { id: string; name: string }[];
    offerings?: ProgramOffering[];
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: CreateTuitionPlanInput) => void;
}) {
    const [step, setStep] = useState(0);
    const [name, setName] = useState("");
    const [programKey, setProgramKey] = useState(programs[0]?.key ?? "");
    const [careFormat, setCareFormat] = useState<AttendanceType>("full_time");
    const [billingFrequencyKey, setBillingFrequencyKey] = useState(cadences[0]?.item_key ?? "monthly");
    const [revenueCategoryId, setRevenueCategoryId] = useState<string>("");
    const [status, setStatus] = useState<"active" | "draft">("active");
    const [effectiveDate, setEffectiveDate] = useState(todayIso());
    const [locationMode, setLocationMode] = useState<LocationApplicabilityMode>("all");
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

    const occupiedCareFormats = useMemo(
        () => occupiedCareFormatsForProgram(offerings ?? [], programKey),
        [offerings, programKey],
    );

    useEffect(() => {
        if (!occupiedCareFormats.has(careFormat)) return;
        const next = CARE_FORMATS.find(([value]) => !occupiedCareFormats.has(value))?.[0];
        if (next) setCareFormat(next);
    }, [careFormat, occupiedCareFormats]);

    const suggestedDays = useMemo(
        () => deriveDefaultDayCounts(existingVariants, dayCommitments),
        [existingVariants, dayCommitments],
    );
    const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set(suggestedDays));
    const [prices, setPrices] = useState<Record<number, string>>(() =>
        Object.fromEntries(suggestedDays.map((day) => [day, ""])),
    );

    const toggleDay = (day: number) => {
        setSelectedDays((prev) => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            return next;
        });
        setPrices((prev) => (day in prev ? prev : { ...prev, [day]: "" }));
    };

    const canAdvance = (): boolean => {
        if (step === 0) {
            return (
                name.trim().length > 0
                && programKey.trim().length > 0
                && billingFrequencyKey.trim().length > 0
                && !occupiedCareFormats.has(careFormat)
            );
        }
        if (step === 1) return selectedDays.size > 0;
        if (step === 2) {
            return [...selectedDays].every((day) => parseDollarsToCents(prices[day] ?? "") != null);
        }
        return true;
    };

    const buildInput = (): CreateTuitionPlanInput => ({
        name: name.trim(),
        programKey,
        careFormat,
        billingFrequencyKey,
        revenueCategoryId: revenueCategoryId.trim() || null,
        status,
        effectiveDate,
        locationMode,
        locationIds: selectedLocationIds,
        commitments: [...selectedDays]
            .sort((a, b) => a - b)
            .map((day) => ({
                quantityType: "days" as const,
                quantityValue: day,
                label: autoVariantLabel(day, "days"),
                rateCents: parseDollarsToCents(prices[day] ?? "") ?? 0,
            })),
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-create-title"
            data-testid="tuition-plan-create-dialog"
        >
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="tuition-create-title" className="text-lg font-semibold text-alloy-midnight">
                        New Tuition Plan
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">{STEPS[step]}</p>
                    <ol className="mt-3 flex gap-2" aria-label="Progress">
                        {STEPS.map((label, index) => (
                            <li
                                key={label}
                                className={`h-1 flex-1 rounded-full ${
                                    index <= step ? "bg-alloy-bend-pine" : "bg-alloy-stone/30"
                                }`}
                                aria-hidden
                            />
                        ))}
                    </ol>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}

                    {step === 0 ?
                        <div className="space-y-4">
                            <section className="space-y-3 border-b border-alloy-stone/15 pb-4">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Identity</h3>
                                <label>
                                    <span className="config-typo-field-label">Plan name *</span>
                                    <input
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        className="config-runtime-input mt-1"
                                        data-testid="tuition-create-name"
                                        autoFocus
                                    />
                                </label>
                            </section>
                            <section className="space-y-3 border-b border-alloy-stone/15 pb-4">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Program</h3>
                                <label>
                                    <span className="config-typo-field-label">Program *</span>
                                    <select
                                        value={programKey}
                                        onChange={(event) => setProgramKey(event.target.value)}
                                        className="config-runtime-select mt-1"
                                        data-testid="tuition-create-program"
                                    >
                                        {programs.map((program) => (
                                            <option key={program.key} value={program.key}>
                                                {program.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </section>
                            <section className="space-y-3 border-b border-alloy-stone/15 pb-4">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Care Format</h3>
                                <p className="text-xs text-alloy-midnight/50">
                                    One Tuition Plan per care format within a program.
                                </p>
                                <label>
                                    <span className="config-typo-field-label">Care format</span>
                                    <select
                                        value={careFormat}
                                        onChange={(event) => setCareFormat(event.target.value as AttendanceType)}
                                        className="config-runtime-select mt-1"
                                        data-testid="tuition-create-care-format"
                                    >
                                        {CARE_FORMATS.map(([value, label]) => {
                                            const taken = occupiedCareFormats.has(value);
                                            return (
                                                <option key={value} value={value} disabled={taken}>
                                                    {taken ? `${label} (already used)` : label}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                            </section>
                            <section className="space-y-3 border-b border-alloy-stone/15 pb-4">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Billing Frequency</h3>
                                <label>
                                    <span className="config-typo-field-label">Billing Frequency *</span>
                                    <select
                                        value={billingFrequencyKey}
                                        onChange={(event) => setBillingFrequencyKey(event.target.value)}
                                        className="config-runtime-select mt-1"
                                        data-testid="tuition-create-frequency"
                                    >
                                        {cadences.map((cadence) => (
                                            <option key={cadence.item_key} value={cadence.item_key}>
                                                {cadenceLabel(cadence.item_key, cadences)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </section>
                            <section className="space-y-3 border-b border-alloy-stone/15 pb-4">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Revenue Mapping</h3>
                                <GlCodeSelect
                                    value={revenueCategoryId || null}
                                    onChange={(nextRevenueCategoryId) =>
                                        setRevenueCategoryId(nextRevenueCategoryId ?? "")
                                    }
                                    testId="tuition-create-gl"
                                    label="Revenue GL"
                                />
                            </section>
                            <section className="space-y-3 border-b border-alloy-stone/15 pb-4">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Location Scope</h3>
                                <LocationMultiSelect
                                    locations={locations}
                                    mode={locationMode}
                                    selectedIds={selectedLocationIds}
                                    onModeChange={setLocationMode}
                                    onSelectedIdsChange={setSelectedLocationIds}
                                    testId="tuition-create-locations"
                                />
                            </section>
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold text-alloy-midnight">Status</h3>
                                <label>
                                    <span className="config-typo-field-label">Status</span>
                                    <select
                                        value={status}
                                        onChange={(event) => setStatus(event.target.value as "active" | "draft")}
                                        className="config-runtime-select mt-1"
                                        data-testid="tuition-create-status"
                                    >
                                        <option value="active">Active</option>
                                        <option value="draft">Draft</option>
                                    </select>
                                </label>
                                <label>
                                    <span className="config-typo-field-label">Effective date</span>
                                    <input
                                        type="date"
                                        value={effectiveDate}
                                        onChange={(event) => setEffectiveDate(event.target.value)}
                                        className="config-runtime-input mt-1"
                                        data-testid="tuition-create-effective-date"
                                    />
                                </label>
                            </section>
                        </div>
                    : step === 1 ?
                        <div>
                            <p className="text-sm text-alloy-midnight/60">
                                Select Enrollment Commitments (days per week).
                            </p>
                            <ul className="mt-3 space-y-2">
                                {dayCommitments.map((day) => (
                                    <li key={day}>
                                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-alloy-stone/10">
                                            <input
                                                type="checkbox"
                                                checked={selectedDays.has(day)}
                                                onChange={() => toggleDay(day)}
                                                data-testid={`tuition-create-day-${day}`}
                                            />
                                            <span>{autoVariantLabel(day, "days")}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    : step === 2 ?
                        <div className="space-y-3">
                            <p className="text-sm text-alloy-midnight/60">
                                Set Organization Prices for each selected commitment.
                            </p>
                            {[...selectedDays].sort((a, b) => a - b).map((day) => (
                                <label key={day}>
                                    <span className="config-typo-field-label">{autoVariantLabel(day, "days")}</span>
                                    <input
                                        value={prices[day] ?? ""}
                                        onChange={(event) =>
                                            setPrices((prev) => ({ ...prev, [day]: event.target.value }))
                                        }
                                        className="config-runtime-input mt-1"
                                        placeholder="$0"
                                        data-testid={`tuition-create-price-${day}`}
                                    />
                                </label>
                            ))}
                        </div>
                    :   <div className="space-y-3 text-sm text-alloy-midnight/75">
                            <p>
                                <span className="font-semibold text-alloy-midnight">Plan:</span> {name.trim()}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Program:</span>{" "}
                                {programs.find((p) => p.key === programKey)?.label ?? programKey}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Billing Frequency:</span>{" "}
                                {cadenceLabel(billingFrequencyKey, cadences)}
                            </p>
                            <ul className="mt-2 space-y-1">
                                {[...selectedDays].sort((a, b) => a - b).map((day) => (
                                    <li key={day}>
                                        {autoVariantLabel(day, "days")}:{" "}
                                        {formatRateCents(parseDollarsToCents(prices[day] ?? "") ?? 0)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    }
                </div>

                <div className="flex justify-between gap-2 border-t border-alloy-stone/20 px-5 py-4">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <div className="flex gap-2">
                        {step > 0 ?
                            <ConfigurationSecondaryButton
                                disabled={busy}
                                onClick={() => setStep((current) => current - 1)}
                            >
                                Back
                            </ConfigurationSecondaryButton>
                        :   null}
                        {step < STEPS.length - 1 ?
                            <ConfigurationPrimaryButton
                                disabled={busy || !canAdvance()}
                                onClick={() => setStep((current) => current + 1)}
                                data-testid="tuition-create-next"
                            >
                                Next
                            </ConfigurationPrimaryButton>
                        :   <ConfigurationPrimaryButton
                                disabled={busy || !canAdvance()}
                                onClick={() => onSubmit(buildInput())}
                                data-testid="tuition-create-submit"
                            >
                                {busy ? "Creating…" : "Create Tuition Plan"}
                            </ConfigurationPrimaryButton>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
