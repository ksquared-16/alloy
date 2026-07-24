"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    buildBillingFrequencyRows,
    billingFrequencyItemKeyFromLabel,
    type BillingFrequencyRow,
} from "@/lib/financials/tuitionPlans/billingFrequenciesViewModel";
import {
    createBillingFrequency,
    fetchBillingCadences,
    updateBillingFrequency,
} from "@/lib/financials/tuitionPlans/billingFrequenciesClient";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";

function BillingFrequencyDialog({
    row,
    busy,
    error,
    onCancel,
    onSubmit,
}: {
    row: BillingFrequencyRow | null;
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onSubmit: (input: {
        name: string;
        description: string;
        intervalLabel: string;
    }) => void;
}) {
    const [name, setName] = useState(row?.name ?? "");
    const [description, setDescription] = useState(row?.description ?? "");
    const [intervalLabel, setIntervalLabel] = useState(
        row?.metadata?.interval_label != null ? String(row.metadata.interval_label) : "",
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="billing-frequency-dialog"
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                <h2 className="text-lg font-semibold text-alloy-midnight">
                    {row ? "Edit Billing Frequency" : "New Billing Frequency"}
                </h2>
                <div className="mt-4 space-y-3">
                    {error ?
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {error}
                        </p>
                    :   null}
                    <label>
                        <span className="config-typo-field-label">Name *</span>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="config-runtime-input mt-1"
                            data-testid="billing-frequency-name"
                            autoFocus
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">Description</span>
                        <input
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            className="config-runtime-input mt-1"
                            data-testid="billing-frequency-description"
                        />
                    </label>
                    <label>
                        <span className="config-typo-field-label">Interval label</span>
                        <input
                            value={intervalLabel}
                            onChange={(event) => setIntervalLabel(event.target.value)}
                            className="config-runtime-input mt-1"
                            placeholder="e.g. Billed monthly"
                            data-testid="billing-frequency-interval"
                        />
                    </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        disabled={busy || !name.trim()}
                        onClick={() =>
                            onSubmit({
                                name: name.trim(),
                                description: description.trim(),
                                intervalLabel: intervalLabel.trim(),
                            })
                        }
                        data-testid="billing-frequency-submit"
                    >
                        {busy ? "Saving…" : row ? "Save" : "Create"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}

export function TuitionBillingFrequenciesPanel({
    snapshot,
    onReload,
}: {
    snapshot: TuitionPlansSnapshot;
    onReload: () => void;
}) {
    const [cadences, setCadences] = useState(snapshot.cadences);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dialogRow, setDialogRow] = useState<BillingFrequencyRow | null | "new">(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [menuId, setMenuId] = useState<string | null>(null);

    const reloadCadences = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const next = await fetchBillingCadences();
            setCadences(next);
            onReload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not refresh billing frequencies.");
        } finally {
            setLoading(false);
        }
    }, [onReload]);

    useEffect(() => {
        setCadences(snapshot.cadences);
    }, [snapshot.cadences]);

    const rows = useMemo(
        () =>
            buildBillingFrequencyRows({
                cadences,
                offerings: snapshot.offerings,
                rates: snapshot.rates,
            }),
        [cadences, snapshot.offerings, snapshot.rates],
    );

    const saveDialog = async (input: { name: string; description: string; intervalLabel: string }) => {
        setBusy(true);
        setDialogError(null);
        try {
            if (dialogRow === "new") {
                await createBillingFrequency({
                    itemKey: billingFrequencyItemKeyFromLabel(input.name) || "custom_frequency",
                    label: input.name,
                    description: input.description || null,
                    intervalLabel: input.intervalLabel || null,
                    sortOrder: rows.length + 1,
                });
            } else if (dialogRow) {
                const inUse = dialogRow.plansUsingCount > 0;
                await updateBillingFrequency(dialogRow.id, {
                    label: input.name,
                    description: input.description || null,
                    intervalLabel: input.intervalLabel || null,
                    active: dialogRow.active,
                });
                if (!inUse && !dialogRow.active) {
                    // no-op guard for clarity
                }
            }
            setDialogRow(null);
            await reloadCadences();
        } catch (err) {
            setDialogError(err instanceof Error ? err.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async (row: BillingFrequencyRow) => {
        setBusy(true);
        setMenuId(null);
        try {
            await updateBillingFrequency(row.id, { active: !row.active, metadata: row.metadata });
            await reloadCadences();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update status.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="tuition-billing-frequencies-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="config-typo-workspace-title text-lg text-alloy-midnight">Billing Frequencies</h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">
                        How often tuition is billed — used as the primary frequency on Tuition Plans.
                    </p>
                </div>
                <ConfigurationPrimaryButton
                    className="gap-1"
                    onClick={() => {
                        setDialogError(null);
                        setDialogRow("new");
                    }}
                    data-testid="billing-frequency-new"
                >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New Frequency
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="process-config-setup-card overflow-hidden">
                <table className="w-full text-sm" data-testid="billing-frequencies-table">
                    <thead>
                        <tr className="border-b border-alloy-stone/20 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">
                            <th className="px-4 py-2.5">Name</th>
                            <th className="px-4 py-2.5">Description</th>
                            <th className="px-4 py-2.5">Cadence</th>
                            <th className="px-4 py-2.5">Active</th>
                            <th className="px-4 py-2.5">Plans using</th>
                            <th className="px-4 py-2.5 w-12"><span className="sr-only">More</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 ?
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-alloy-midnight/50">
                                    Loading…
                                </td>
                            </tr>
                        : rows.length === 0 ?
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-alloy-midnight/50">
                                    No billing frequencies configured yet.
                                </td>
                            </tr>
                        :   rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="border-b border-alloy-stone/10 last:border-0"
                                    data-testid={`billing-frequency-row-${row.itemKey}`}
                                >
                                    <td className="px-4 py-3 font-medium text-alloy-midnight">{row.name}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.description ?? "—"}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.cadenceLabel}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`text-[11px] font-semibold ${
                                                row.active ? "text-alloy-bend-pine" : "text-alloy-midnight/45"
                                            }`}
                                        >
                                            {row.active ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.plansUsingCount}</td>
                                    <td className="relative px-4 py-3">
                                        <button
                                            type="button"
                                            className="rounded p-1 text-alloy-midnight/50 hover:bg-alloy-stone/15"
                                            aria-label={`Actions for ${row.name}`}
                                            onClick={() => setMenuId((current) => (current === row.id ? null : row.id))}
                                        >
                                            <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                                        </button>
                                        {menuId === row.id ?
                                            <div className="absolute right-4 top-10 z-10 min-w-[9rem] rounded-lg border border-alloy-stone/25 bg-white py-1 shadow-sm">
                                                <button
                                                    type="button"
                                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-alloy-stone/10"
                                                    onClick={() => {
                                                        setDialogError(null);
                                                        setDialogRow(row);
                                                        setMenuId(null);
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-alloy-stone/10"
                                                    onClick={() => void toggleActive(row)}
                                                    disabled={busy || (row.plansUsingCount > 0 && row.active)}
                                                    title={
                                                        row.plansUsingCount > 0 && row.active
                                                            ? "In use by tuition plans — deactivate only when unused"
                                                            : undefined
                                                    }
                                                >
                                                    {row.active ? "Deactivate" : "Activate"}
                                                </button>
                                            </div>
                                        :   null}
                                    </td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>

            {dialogRow ?
                <BillingFrequencyDialog
                    row={dialogRow === "new" ? null : dialogRow}
                    busy={busy}
                    error={dialogError}
                    onCancel={() => {
                        if (busy) return;
                        setDialogRow(null);
                        setDialogError(null);
                    }}
                    onSubmit={(input) => void saveDialog(input)}
                />
            :   null}
        </div>
    );
}
