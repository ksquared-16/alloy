"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    deriveEnrollmentCommitments,
    type EnrollmentCommitmentPattern,
} from "@/lib/financials/tuitionPlans/enrollmentCommitmentsViewModel";
import {
    createEnrollmentCommitmentTemplate,
    fetchEnrollmentCommitmentTemplates,
} from "@/lib/financials/tuitionPlans/enrollmentCommitmentsClient";
import { autoVariantLabel, type QuantityType } from "@/lib/programs/programOfferingVariants";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";

const QUANTITY_TYPES: { value: QuantityType; label: string }[] = [
    { value: "days", label: "Days per week" },
    { value: "hours", label: "Hours per week" },
    { value: "sessions", label: "Sessions per week" },
];

function NewCommitmentDialog({
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: { quantityType: QuantityType; quantityValue: number; label: string }) => void;
}) {
    const [quantityType, setQuantityType] = useState<QuantityType>("days");
    const [quantityValue, setQuantityValue] = useState(3);
    const [label, setLabel] = useState(autoVariantLabel(3, "days"));

    useEffect(() => {
        setLabel(autoVariantLabel(quantityValue, quantityType));
    }, [quantityType, quantityValue]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="enrollment-commitment-dialog"
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                <h2 className="text-lg font-semibold text-alloy-midnight">New Enrollment Commitment</h2>
                <p className="mt-1 text-sm text-alloy-midnight/55">
                    Saves a reusable pattern. It appears in plan selectors once used on a Tuition Plan.
                </p>
                <div className="mt-4 space-y-3">
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}
                    <label>
                        <span className="config-typo-field-label">Commitment type</span>
                        <select
                            value={quantityType}
                            onChange={(event) => setQuantityType(event.target.value as QuantityType)}
                            className="config-runtime-select mt-1"
                            data-testid="enrollment-commitment-type"
                        >
                            {QUANTITY_TYPES.map((row) => (
                                <option key={row.value} value={row.value}>
                                    {row.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="config-typo-field-label">Quantity</span>
                        <input
                            type="number"
                            min={1}
                            max={7}
                            value={quantityValue}
                            onChange={(event) => setQuantityValue(Number(event.target.value) || 1)}
                            className="config-runtime-input mt-1"
                            data-testid="enrollment-commitment-value"
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">Display label</span>
                        <input
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            className="config-runtime-input mt-1"
                            data-testid="enrollment-commitment-label"
                        />
                    </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={busy || !label.trim() || quantityValue < 1}
                        onClick={() =>
                            onSubmit({
                                quantityType,
                                quantityValue,
                                label: label.trim(),
                            })
                        }
                        data-testid="enrollment-commitment-submit"
                    >
                        {busy ? "Saving…" : "Save pattern"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}

export function TuitionEnrollmentCommitmentsPanel({ snapshot }: { snapshot: TuitionPlansSnapshot }) {
    const [templates, setTemplates] = useState<Awaited<ReturnType<typeof fetchEnrollmentCommitmentTemplates>>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const next = await fetchEnrollmentCommitmentTemplates();
            setTemplates(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load commitment templates.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const patterns = useMemo(
        () =>
            deriveEnrollmentCommitments({
                variants: snapshot.variants,
                templateItems: templates,
            }),
        [snapshot.variants, templates],
    );

    const savePattern = async (input: {
        quantityType: QuantityType;
        quantityValue: number;
        label: string;
    }) => {
        setBusy(true);
        setDialogError(null);
        try {
            await createEnrollmentCommitmentTemplate(input);
            setDialogOpen(false);
            await reload();
        } catch (err) {
            setDialogError(err instanceof Error ? err.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="tuition-enrollment-commitments-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="config-typo-workspace-title text-lg text-alloy-midnight">
                        Enrollment Commitments
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">
                        Reusable enrollment patterns derived from Tuition Plans, plus saved templates for new plans.
                    </p>
                </div>
                <ConfigurationPrimaryButton
                    className="gap-1"
                    onClick={() => {
                        setDialogError(null);
                        setDialogOpen(true);
                    }}
                    data-testid="enrollment-commitment-new"
                >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New Commitment
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="process-config-setup-card overflow-hidden">
                <table className="w-full text-sm" data-testid="enrollment-commitments-table">
                    <thead>
                        <tr className="border-b border-alloy-stone/20 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">
                            <th className="px-4 py-2.5">Label</th>
                            <th className="px-4 py-2.5">Type</th>
                            <th className="px-4 py-2.5">Quantity</th>
                            <th className="px-4 py-2.5">In use</th>
                            <th className="px-4 py-2.5">Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && patterns.length === 0 ?
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-alloy-midnight/50">
                                    Loading…
                                </td>
                            </tr>
                        : patterns.length === 0 ?
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-alloy-midnight/50">
                                    No enrollment commitments yet — add one to a Tuition Plan or save a template.
                                </td>
                            </tr>
                        :   patterns.map((row: EnrollmentCommitmentPattern) => (
                                <tr
                                    key={row.key}
                                    className="border-b border-alloy-stone/10 last:border-0"
                                    data-testid={`enrollment-commitment-row-${row.key}`}
                                >
                                    <td className="px-4 py-3 font-medium text-alloy-midnight">{row.label}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.quantityType}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.quantityValue}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.usageCount}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/50">
                                        {row.source === "template" ? "Template" : "From plans"}
                                    </td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>

            {dialogOpen ?
                <NewCommitmentDialog
                    busy={busy}
                    error={dialogError}
                    onCancel={() => {
                        if (busy) return;
                        setDialogOpen(false);
                        setDialogError(null);
                    }}
                    onSubmit={(input) => void savePattern(input)}
                />
            :   null}
        </div>
    );
}
