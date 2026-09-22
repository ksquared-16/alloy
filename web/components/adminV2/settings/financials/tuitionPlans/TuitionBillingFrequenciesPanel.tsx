"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { billingRecurrenceFor } from "@/lib/financials/billingPeriod";
import { previewBillingPeriods } from "@/lib/financials/tuitionPlans/billingPeriodPreview";
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
                    {/*
                     * ── WHAT THE NAME ACTUALLY DECIDES ───────────────────────────────────────
                     *
                     * AUDITED, and this is the finding. The form has three fields and none of them
                     * is a redundant requirement — but the NAME is not merely a label: it becomes
                     * the cadence key, through `billingFrequencyItemKeyFromLabel`, and that key is
                     * what `billingRecurrenceFor` and the period authority consume. "Weekly" makes
                     * a frequency the platform can derive periods for; "Semi-Annual" makes one it
                     * cannot, and until now the operator learned which only by saving and reading
                     * the list.
                     *
                     * So the consequence is stated while they type, from the same authority the
                     * list and generation use. It derives nothing of its own and is not a field:
                     * nothing here is persisted, and there is nothing to edit.
                     */}
                    {name.trim() ? (
                        (() => {
                            const cadenceKey = billingFrequencyItemKeyFromLabel(name) || "custom_frequency";
                            const rec = billingRecurrenceFor(cadenceKey);
                            return (
                                <p
                                    className={`text-[11px] ${rec.billable ? "text-alloy-midnight/55" : "text-alloy-ember"}`}
                                    data-testid="billing-frequency-consequence"
                                    data-billing-frequency-billable={rec.billable ? "true" : "false"}
                                >
                                    {rec.recurrence}
                                </p>
                            );
                        })()
                    ) : null}
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
    /*
     * The preview reasons from a STATED anchor and a STATED day rather than reading the clock inside
     * the render: a configuration screen should show the same intervals to two operators looking at
     * it a second apart, and a test should be able to ask what it shows.
     *
     * The anchor is the first of the current month — a plain, explainable stand-in for "an agreement
     * that started at the beginning of this month", because no real agreement is in hand on a
     * configuration screen. The intervals themselves are still the period authority's.
     */
    const previewTodayYmd = new Date().toISOString().slice(0, 10);
    const previewAnchorYmd = `${previewTodayYmd.slice(0, 7)}-01`;

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

    /*
     * WHETHER RECURRING TUITION IS BILLED AUTOMATICALLY — this tenant's answer, not the build's.
     *
     * A productized handler means the scheduler CAN wake Financials. An organization with no
     * schedule is still billed by an operator pressing Generate Tuition, so the copy below is
     * gated on the tenant's own state. Claiming automation because a deploy happened would tell
     * every such operator something false about their own money.
     *
     * Unknown is a third state and is shown as nothing: a failed read must not be rendered as
     * "not automatic", which is a claim this surface has not earned.
     */
    const [automatic, setAutomatic] = useState<{ active: boolean; nextAt: string | null } | null>(null);
    useEffect(() => {
        let cancelled = false;
        void fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((j: { automatic_billing_active?: boolean; next_evaluation_at?: string | null } | null) => {
                if (cancelled || !j) return;
                setAutomatic({ active: Boolean(j.automatic_billing_active), nextAt: j.next_evaluation_at ?? null });
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="space-y-3" data-testid="tuition-billing-frequencies-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="config-typo-workspace-title text-lg text-alloy-midnight">Billing Frequencies</h2>
                    {/*
                     * TWO LEVELS, NAMED. A frequency is the RULE; the periods it produces are
                     * instances an assignment's accepted term and its anchor derive — nobody
                     * authors "Sep 15–21" here. And the accounting calendar is a different
                     * interval entirely, which is why it is named as elsewhere rather than
                     * implied by silence.
                     */}
                    <p className="mt-1 max-w-2xl text-sm text-alloy-midnight/55">
                        How often tuition recurs. A frequency is the rule; the billing periods it
                        produces are derived from each assignment&apos;s accepted term and start
                        date — you never author individual periods here. The accounting calendar is
                        configured separately, under Accounting.
                    </p>
                    {automatic ? (
                        <p
                            className={`mt-1.5 text-[12px] ${automatic.active ? "text-alloy-midnight/60" : "text-alloy-ember"}`}
                            data-testid="periodic-billing-automation-status"
                            data-periodic-billing-active={automatic.active ? "true" : "false"}
                        >
                            {automatic.active
                                ? "Recurring tuition is billed automatically for this organization. Generate Tuition remains available for periods automation left outstanding."
                                : "Recurring tuition is NOT billed automatically for this organization — an operator runs Generate Tuition for each period."}
                        </p>
                    ) : null}
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
                            {/*
                             * "Cadence" showed `cadenceLabel`, which is the description the
                             * operator typed — or, failing that, the name they typed — echoed back
                             * beside the Description column that already held it. It told them
                             * nothing the platform knows. This states what the period authority
                             * will actually derive from this frequency.
                             */}
                            <th className="px-4 py-2.5">Recurrence</th>
                            {/*
                             * WHAT COMMERCIAL PERIOD DOES THAT CREATE? Recurrence says how often;
                             * this says what interval it actually produces, derived by the same
                             * authority generation and the Assignment read-back use. Configuration
                             * that explains only the cadence leaves the operator to infer the
                             * period, which is the gap this column closes.
                             */}
                            <th className="px-4 py-2.5">Billing period</th>
                            <th className="px-4 py-2.5">Active</th>
                            <th className="px-4 py-2.5">Plans using</th>
                            <th className="px-4 py-2.5 w-12"><span className="sr-only">More</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 ?
                            <tr>
                                <td colSpan={7} className="px-4 py-6 text-alloy-midnight/50">
                                    Loading…
                                </td>
                            </tr>
                        : rows.length === 0 ?
                            <tr>
                                <td colSpan={7} className="px-4 py-6 text-alloy-midnight/50">
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
                                    {(() => {
                                        const rec = billingRecurrenceFor(row.itemKey);
                                        return (
                                            <td
                                                className={`px-4 py-3 ${
                                                    rec.billable ? "text-alloy-midnight/60" : "text-alloy-ember"
                                                }`}
                                                data-billing-recurrence={row.itemKey}
                                                data-billing-recurrence-billable={rec.billable ? "true" : "false"}
                                            >
                                                {rec.recurrence}
                                            </td>
                                        );
                                    })()}
                                    {(() => {
                                        /*
                                         * READ-ONLY PREVIEW, from `billingPeriodFor` — never
                                         * described in prose. An unsupported cadence gets no
                                         * interval rather than a plausible invented one, which is
                                         * the same answer generation gives when it refuses the run.
                                         */
                                        const preview = previewBillingPeriods({
                                            cadenceKey: row.itemKey,
                                            anchorYmd: previewAnchorYmd,
                                            todayYmd: previewTodayYmd,
                                        });
                                        return (
                                            <td
                                                className="px-4 py-3 text-alloy-midnight/60"
                                                data-billing-period-preview={row.itemKey}
                                                data-billing-period-preview-billable={preview.billable ? "true" : "false"}
                                            >
                                                {preview.current ?
                                                    <span className="flex flex-col gap-0.5">
                                                        <span data-billing-period-current>
                                                            Current · {preview.current.label}
                                                        </span>
                                                        {preview.next ?
                                                            <span
                                                                className="text-alloy-midnight/45"
                                                                data-billing-period-next
                                                            >
                                                                Next · {preview.next.label}
                                                            </span>
                                                        :   null}
                                                    </span>
                                                :   <span className="text-alloy-ember" data-billing-period-none>
                                                        No billing periods
                                                    </span>
                                                }
                                            </td>
                                        );
                                    })()}
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
