"use client";

import { useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { autoVariantLabel } from "@/lib/programs/programOfferingVariants";
import { parseDollarsToCents } from "@/lib/commercial/tuitionRates";
import { todayIso } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

export function TuitionPlanAddCommitmentDialog({
    detail,
    dayCommitments,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    detail: TuitionPlanDetailVm;
    dayCommitments: number[];
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: {
        quantityValue: number;
        rateCents: number;
        effectiveDate: string;
    }) => void;
}) {
    const existingDays = new Set(
        detail.variants
            .filter((v) => v.quantity_type === "days" && v.quantity_value != null)
            .map((v) => v.quantity_value!),
    );
    const availableDays = dayCommitments.filter((day) => !existingDays.has(day));
    const [quantityValue, setQuantityValue] = useState(availableDays[0] ?? 1);
    const [price, setPrice] = useState("");
    const [effectiveDate, setEffectiveDate] = useState(todayIso());

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-add-commitment-title"
            data-testid="tuition-plan-add-commitment-dialog"
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                <h2 id="tuition-add-commitment-title" className="text-lg font-semibold text-alloy-midnight">
                    Add Enrollment Commitment
                </h2>
                <p className="mt-1 text-sm text-alloy-midnight/55">{detail.name}</p>

                <div className="mt-4 space-y-3">
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}
                    {availableDays.length === 0 ?
                        <p className="text-sm text-alloy-midnight/60">
                            All configured day commitments are already on this plan.
                        </p>
                    :   <>
                            <label>
                                <span className="config-typo-field-label">Days per week</span>
                                <select
                                    value={quantityValue}
                                    onChange={(event) => setQuantityValue(Number(event.target.value))}
                                    className="config-runtime-select mt-1"
                                    data-testid="tuition-add-commitment-days"
                                >
                                    {availableDays.map((day) => (
                                        <option key={day} value={day}>
                                            {autoVariantLabel(day, "days")}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className="config-typo-field-label">Organization Price</span>
                                <input
                                    value={price}
                                    onChange={(event) => setPrice(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    placeholder="$0"
                                    data-testid="tuition-add-commitment-price"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Effective date</span>
                                <input
                                    type="date"
                                    value={effectiveDate}
                                    onChange={(event) => setEffectiveDate(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="tuition-add-commitment-effective-date"
                                />
                            </label>
                        </>
                    }
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    {availableDays.length > 0 ?
                        <ConfigurationPrimaryButton
                            disabled={busy || parseDollarsToCents(price) == null}
                            onClick={() =>
                                onSubmit({
                                    quantityValue,
                                    rateCents: parseDollarsToCents(price)!,
                                    effectiveDate,
                                })
                            }
                            data-testid="tuition-add-commitment-submit"
                        >
                            {busy ? "Adding…" : "Add commitment"}
                        </ConfigurationPrimaryButton>
                    :   null}
                </div>
            </div>
        </div>
    );
}

export function TuitionPlanStopCommitmentDialog({
    detail,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    detail: TuitionPlanDetailVm;
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (variantId: string) => void;
}) {
    const [variantId, setVariantId] = useState(detail.options[0]?.variantId ?? "");

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-stop-commitment-title"
            data-testid="tuition-plan-stop-commitment-dialog"
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                <h2 id="tuition-stop-commitment-title" className="text-lg font-semibold text-alloy-midnight">
                    Stop Offering
                </h2>
                <p className="mt-2 text-sm text-alloy-midnight/60">
                    Archive an Enrollment Commitment so it is no longer offered for new enrollments.
                </p>

                {error ?
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}

                <label className="mt-4 block">
                    <span className="config-typo-field-label">Enrollment Commitment</span>
                    <select
                        value={variantId}
                        onChange={(event) => setVariantId(event.target.value)}
                        className="config-runtime-select mt-1"
                        data-testid="tuition-stop-commitment-select"
                    >
                        {detail.options.map((row) => (
                            <option key={row.variantId} value={row.variantId}>
                                {row.commitmentLabel}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="mt-5 flex justify-end gap-2">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={busy || !variantId}
                        onClick={() => onSubmit(variantId)}
                        data-testid="tuition-stop-commitment-submit"
                    >
                        {busy ? "Stopping…" : "Stop offering"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}

export function TuitionPlanManageCommitmentsDialog({
    detail,
    busy,
    onClose,
    onAdd,
    onStop,
}: {
    detail: TuitionPlanDetailVm;
    busy: boolean;
    onClose: () => void;
    onAdd: () => void;
    onStop: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-manage-commitments-title"
            data-testid="tuition-plan-manage-commitments-dialog"
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                <h2 id="tuition-manage-commitments-title" className="text-lg font-semibold text-alloy-midnight">
                    Manage Enrollment Commitments
                </h2>
                <p className="mt-1 text-sm text-alloy-midnight/55">{detail.name}</p>

                <ul className="mt-4 divide-y divide-alloy-stone/15 text-sm">
                    {detail.options.map((row) => (
                        <li key={row.variantId} className="flex items-center justify-between py-2">
                            <span className="text-alloy-midnight">{row.commitmentLabel}</span>
                            <span className="text-alloy-midnight/50">{row.statusLabel}</span>
                        </li>
                    ))}
                </ul>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onClose}>
                        Close
                    </ConfigurationSecondaryButton>
                    <ConfigurationSecondaryButton disabled={busy} onClick={onStop} data-testid="tuition-manage-stop">
                        Stop Offering
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton disabled={busy} onClick={onAdd} data-testid="tuition-manage-add">
                        Add Commitment
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}
