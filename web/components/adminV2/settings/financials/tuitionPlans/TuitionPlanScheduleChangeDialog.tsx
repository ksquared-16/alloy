"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    buildTuitionRateMap,
    formatRateCents,
    parseDollarsToCents,
    tuitionRateCellKey,
} from "@/lib/commercial/tuitionRates";
import { applyQuickAdjustment } from "@/lib/financials/tuitionPlans/tuitionPlanClient";
import { todayIso } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";

type PriceDraft = { variantId: string; commitmentLabel: string; cents: number; selected: boolean };

export function TuitionPlanScheduleChangeDialog({
    detail,
    snapshot,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    detail: TuitionPlanDetailVm;
    snapshot: TuitionPlansSnapshot;
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: {
        effectiveDate: string;
        changes: Array<{ variantId: string; rateCents: number }>;
    }) => void;
}) {
    const cadenceKey = detail.billingFrequencyKey;
    const orgMap = useMemo(
        () => buildTuitionRateMap(snapshot.rates, null),
        [snapshot.rates],
    );

    const [effectiveDate, setEffectiveDate] = useState(todayIso());
    const [applyAll, setApplyAll] = useState(true);
    const [drafts, setDrafts] = useState<PriceDraft[]>(() =>
        detail.options.map((row) => ({
            variantId: row.variantId,
            commitmentLabel: row.commitmentLabel,
            cents: row.organizationPriceCents ?? 0,
            selected: true,
        })),
    );
    const [confirmOpen, setConfirmOpen] = useState(false);

    const applyAdjustment = (kind: "percent" | "amount" | "round", value: number) => {
        setDrafts((current) =>
            current.map((row) => {
                if (!applyAll && !row.selected) return row;
                return { ...row, cents: applyQuickAdjustment(row.cents, kind, value) };
            }),
        );
    };

    const updateDraftCents = (variantId: string, raw: string) => {
        const cents = parseDollarsToCents(raw);
        if (cents == null) return;
        setDrafts((current) =>
            current.map((row) => (row.variantId === variantId ? { ...row, cents } : row)),
        );
    };

    const submit = () => {
        const changes = drafts
            .filter((row) => applyAll || row.selected)
            .map((row) => ({ variantId: row.variantId, rateCents: row.cents }));
        onSubmit({ effectiveDate, changes });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-schedule-title"
            data-testid="tuition-plan-schedule-dialog"
        >
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="tuition-schedule-title" className="text-lg font-semibold text-alloy-midnight">
                        Schedule Tuition Change
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">{detail.name}</p>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}

                    <label>
                        <span className="config-typo-field-label">Effective date *</span>
                        <input
                            type="date"
                            value={effectiveDate}
                            onChange={(event) => setEffectiveDate(event.target.value)}
                            className="config-runtime-input mt-1"
                            data-testid="tuition-schedule-effective-date"
                        />
                    </label>

                    <div className="flex flex-wrap gap-2">
                        <ConfigurationSecondaryButton
                            type="button"
                            onClick={() => applyAdjustment("percent", 3)}
                            data-testid="tuition-schedule-plus-3"
                        >
                            +3%
                        </ConfigurationSecondaryButton>
                        <ConfigurationSecondaryButton
                            type="button"
                            onClick={() => applyAdjustment("percent", -3)}
                            data-testid="tuition-schedule-minus-3"
                        >
                            −3%
                        </ConfigurationSecondaryButton>
                        <ConfigurationSecondaryButton
                            type="button"
                            onClick={() => applyAdjustment("round", 5)}
                            data-testid="tuition-schedule-round-5"
                        >
                            Round to $5
                        </ConfigurationSecondaryButton>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-alloy-midnight/75">
                        <input
                            type="checkbox"
                            checked={applyAll}
                            onChange={(event) => setApplyAll(event.target.checked)}
                            data-testid="tuition-schedule-apply-all"
                        />
                        Apply to all Enrollment Commitments
                    </label>

                    <ul className="space-y-3">
                        {drafts.map((row) => {
                            const existing = cadenceKey
                                ? orgMap.get(tuitionRateCellKey(row.variantId, cadenceKey))
                                : undefined;
                            return (
                                <li
                                    key={row.variantId}
                                    className="rounded-lg border border-alloy-stone/20 p-3"
                                    data-testid={`tuition-schedule-row-${row.variantId}`}
                                >
                                    <div className="flex items-center gap-2">
                                        {!applyAll ?
                                            <input
                                                type="checkbox"
                                                checked={row.selected}
                                                onChange={(event) =>
                                                    setDrafts((current) =>
                                                        current.map((item) =>
                                                            item.variantId === row.variantId
                                                                ? { ...item, selected: event.target.checked }
                                                                : item,
                                                        ),
                                                    )
                                                }
                                            />
                                        :   null}
                                        <span className="text-sm font-medium text-alloy-midnight">
                                            {row.commitmentLabel}
                                        </span>
                                    </div>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <div>
                                            <p className="text-[11px] text-alloy-midnight/45">Current</p>
                                            <p className="text-sm text-alloy-midnight/70">
                                                {existing && !existing.not_offered
                                                    ? formatRateCents(existing.rate_cents)
                                                    : "—"}
                                            </p>
                                        </div>
                                        <label>
                                            <span className="text-[11px] text-alloy-midnight/45">New price</span>
                                            <input
                                                value={String(row.cents / 100)}
                                                onChange={(event) => updateDraftCents(row.variantId, event.target.value)}
                                                className="config-runtime-input mt-0.5"
                                                data-testid={`tuition-schedule-price-${row.variantId}`}
                                            />
                                        </label>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="flex justify-end gap-2 border-t border-alloy-stone/20 px-5 py-4">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={busy || !effectiveDate}
                        onClick={() => setConfirmOpen(true)}
                        data-testid="tuition-schedule-review"
                    >
                        Review change
                    </ConfigurationPrimaryButton>
                </div>
            </div>

            {confirmOpen ?
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-alloy-midnight/30 p-4"
                    role="dialog"
                    aria-modal="true"
                    data-testid="tuition-schedule-confirm"
                >
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <h3 className="text-lg font-semibold text-alloy-midnight">Confirm scheduled change</h3>
                        <p className="mt-2 text-sm text-alloy-midnight/60">
                            New Organization Prices will take effect on {effectiveDate}. Previous prices will be preserved in history.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton
                                disabled={busy}
                                onClick={() => setConfirmOpen(false)}
                            >
                                Back
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={busy}
                                onClick={() => {
                                    setConfirmOpen(false);
                                    submit();
                                }}
                                data-testid="tuition-schedule-confirm-submit"
                            >
                                {busy ? "Scheduling…" : "Schedule change"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}
