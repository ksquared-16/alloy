"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoneyFromCents, formatDateTime } from "@/lib/adminFormatters";
import type { FirstCleanPriceRow } from "@/app/api/admin/pricing/first-clean-prices/route";
import type { RecurringPriceRow } from "@/app/api/admin/pricing/recurring-prices/route";

type VerticalOption = { id: string; name: string | null; slug: string | null };
type ServiceOfferingOption = { id: string; offering_name: string | null; offering_key: string | null };

type PricingOptions = {
    verticals: { id: string; name: string | null; slug: string | null }[];
    pricing_services: { id: string; label: string }[];
    dimension_value_options: { id: string; label: string }[];
    pricing_frequencies: { id: string; label: string }[];
};

export default function PricingClient() {
    const [activeSection, setActiveSection] = useState<"first-clean" | "recurring">("first-clean");
    const [verticalId, setVerticalId] = useState("");
    const [serviceOfferingId, setServiceOfferingId] = useState("");
    const [verticals, setVerticals] = useState<VerticalOption[]>([]);
    const [serviceOfferings, setServiceOfferings] = useState<ServiceOfferingOption[]>([]);
    const [firstCleanRows, setFirstCleanRows] = useState<FirstCleanPriceRow[]>([]);
    const [recurringRows, setRecurringRows] = useState<RecurringPriceRow[]>([]);
    const [loadingFirst, setLoadingFirst] = useState(false);
    const [loadingRecurring, setLoadingRecurring] = useState(false);

    const [addFirstOpen, setAddFirstOpen] = useState(false);
    const [addRecurringOpen, setAddRecurringOpen] = useState(false);
    const [options, setOptions] = useState<PricingOptions | null>(null);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [addFirstSaving, setAddFirstSaving] = useState(false);
    const [addRecurringSaving, setAddRecurringSaving] = useState(false);
    const [addFirstError, setAddFirstError] = useState<string | null>(null);
    const [addRecurringError, setAddRecurringError] = useState<string | null>(null);

    const [firstForm, setFirstForm] = useState({
        vertical_id: "",
        pricing_service_id: "",
        pricing_square_footage_tier_id: "",
        amount: "",
        is_active: true,
    });
    const [recurringForm, setRecurringForm] = useState({
        vertical_id: "",
        pricing_service_id: "",
        pricing_frequency_id: "",
        pricing_square_footage_tier_id: "",
        amount: "",
        is_active: true,
    });

    const [patchingFirstId, setPatchingFirstId] = useState<string | null>(null);
    const [patchingRecurringId, setPatchingRecurringId] = useState<string | null>(null);

    const fetchVerticals = useCallback(async () => {
        const res = await fetch("/api/admin/verticals");
        const data = await res.json().catch(() => []);
        setVerticals(Array.isArray(data) ? data : []);
    }, []);
    const fetchServiceOfferings = useCallback(async () => {
        const res = await fetch("/api/admin/service-offerings?limit=500");
        const json = await res.json().catch(() => ({}));
        setServiceOfferings(json.service_offerings ?? []);
    }, []);

    useEffect(() => { fetchVerticals(); fetchServiceOfferings(); }, [fetchVerticals, fetchServiceOfferings]);

    const fetchFirstClean = useCallback(async () => {
        setLoadingFirst(true);
        try {
            const params = new URLSearchParams();
            if (verticalId) params.set("vertical_id", verticalId);
            if (serviceOfferingId) params.set("service_offering_id", serviceOfferingId);
            const res = await fetch(`/api/admin/pricing/first-clean-prices?${params}`);
            const json = await res.json().catch(() => ({}));
            setFirstCleanRows(res.ok ? (json.rows ?? []) : []);
        } finally {
            setLoadingFirst(false);
        }
    }, [verticalId, serviceOfferingId]);

    const fetchRecurring = useCallback(async () => {
        setLoadingRecurring(true);
        try {
            const params = new URLSearchParams();
            if (verticalId) params.set("vertical_id", verticalId);
            if (serviceOfferingId) params.set("service_offering_id", serviceOfferingId);
            const res = await fetch(`/api/admin/pricing/recurring-prices?${params}`);
            const json = await res.json().catch(() => ({}));
            setRecurringRows(res.ok ? (json.rows ?? []) : []);
        } finally {
            setLoadingRecurring(false);
        }
    }, [verticalId, serviceOfferingId]);

    useEffect(() => { fetchFirstClean(); }, [fetchFirstClean]);
    useEffect(() => { fetchRecurring(); }, [fetchRecurring]);

    const fetchOptions = useCallback(async (verticalIdFilter: string) => {
        setOptionsLoading(true);
        try {
            const params = new URLSearchParams();
            if (verticalIdFilter) params.set("vertical_id", verticalIdFilter);
            const res = await fetch(`/api/admin/pricing/options?${params}`);
            const json = await res.json().catch(() => ({}));
            if (res.ok) setOptions(json as PricingOptions);
            else setOptions(null);
        } finally {
            setOptionsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (addFirstOpen) fetchOptions(firstForm.vertical_id || verticalId);
    }, [addFirstOpen, firstForm.vertical_id, verticalId, fetchOptions]);

    useEffect(() => {
        if (addRecurringOpen) fetchOptions(recurringForm.vertical_id || verticalId);
    }, [addRecurringOpen, recurringForm.vertical_id, verticalId, fetchOptions]);

    const openAddFirst = () => {
        setFirstForm({
            vertical_id: verticalId,
            pricing_service_id: "",
            pricing_square_footage_tier_id: "",
            amount: "",
            is_active: true,
        });
        setAddFirstError(null);
        setAddFirstOpen(true);
    };

    const openAddRecurring = () => {
        setRecurringForm({
            vertical_id: verticalId,
            pricing_service_id: "",
            pricing_frequency_id: "",
            pricing_square_footage_tier_id: "",
            amount: "",
            is_active: true,
        });
        setAddRecurringError(null);
        setAddRecurringOpen(true);
    };

    const submitAddFirst = async () => {
        if (!firstForm.vertical_id.trim()) {
            setAddFirstError("Vertical is required");
            return;
        }
        if (!firstForm.pricing_service_id.trim()) {
            setAddFirstError("Service is required");
            return;
        }
        if (!firstForm.pricing_square_footage_tier_id.trim()) {
            setAddFirstError("Dimension value is required");
            return;
        }
        const amountNum = parseFloat(firstForm.amount);
        if (firstForm.amount !== "" && (Number.isNaN(amountNum) || amountNum < 0)) {
            setAddFirstError("Amount must be a non-negative number");
            return;
        }
        setAddFirstSaving(true);
        setAddFirstError(null);
        try {
            const amount = firstForm.amount === "" ? 0 : amountNum;
            const res = await fetch("/api/admin/pricing/first-clean-prices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vertical_id: firstForm.vertical_id.trim(),
                    pricing_service_id: firstForm.pricing_service_id.trim(),
                    pricing_square_footage_tier_id: firstForm.pricing_square_footage_tier_id.trim(),
                    amount,
                    is_active: firstForm.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAddFirstError((json as { error?: string }).error ?? "Create failed");
                return;
            }
            setAddFirstOpen(false);
            fetchFirstClean();
        } finally {
            setAddFirstSaving(false);
        }
    };

    const submitAddRecurring = async () => {
        if (!recurringForm.vertical_id.trim()) {
            setAddRecurringError("Vertical is required");
            return;
        }
        if (!recurringForm.pricing_service_id.trim()) {
            setAddRecurringError("Service is required");
            return;
        }
        if (!recurringForm.pricing_frequency_id.trim()) {
            setAddRecurringError("Plan / frequency is required");
            return;
        }
        if (!recurringForm.pricing_square_footage_tier_id.trim()) {
            setAddRecurringError("Dimension value is required");
            return;
        }
        const amountNum = parseFloat(recurringForm.amount);
        if (recurringForm.amount !== "" && (Number.isNaN(amountNum) || amountNum < 0)) {
            setAddRecurringError("Amount must be a non-negative number");
            return;
        }
        setAddRecurringSaving(true);
        setAddRecurringError(null);
        try {
            const amount = recurringForm.amount === "" ? 0 : amountNum;
            const res = await fetch("/api/admin/pricing/recurring-prices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vertical_id: recurringForm.vertical_id.trim(),
                    pricing_service_id: recurringForm.pricing_service_id.trim(),
                    pricing_frequency_id: recurringForm.pricing_frequency_id.trim(),
                    pricing_square_footage_tier_id: recurringForm.pricing_square_footage_tier_id.trim(),
                    amount,
                    is_active: recurringForm.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAddRecurringError((json as { error?: string }).error ?? "Create failed");
                return;
            }
            setAddRecurringOpen(false);
            fetchRecurring();
        } finally {
            setAddRecurringSaving(false);
        }
    };

    const patchFirstClean = useCallback(async (id: string, payload: { amount_cents?: number; is_active?: boolean }) => {
        setPatchingFirstId(id);
        try {
            const res = await fetch(`/api/admin/pricing/first-clean-prices/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) await fetchFirstClean();
        } finally {
            setPatchingFirstId(null);
        }
    }, [fetchFirstClean]);

    const patchRecurring = useCallback(async (id: string, payload: { amount_cents?: number; is_active?: boolean }) => {
        setPatchingRecurringId(id);
        try {
            const res = await fetch(`/api/admin/pricing/recurring-prices/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) await fetchRecurring();
        } finally {
            setPatchingRecurringId(null);
        }
    }, [fetchRecurring]);

    const opts = options ?? {
        verticals: [],
        pricing_services: [],
        dimension_value_options: [],
        pricing_frequencies: [],
    };

    return (
        <div className="space-y-6">
            <header className="rounded-xl border border-admin-border border-l-4 border-l-alloy-blue bg-admin-surface-card px-6 py-4 shadow-sm">
                <h1 className="text-2xl font-bold tracking-tight text-alloy-forge">Pricing</h1>
                <p className="mt-1 text-sm text-alloy-midnight/70">Configure first clean and recurring prices by service, plan, and dimension value.</p>
            </header>

            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-admin-border bg-white px-4 py-3">
                <span className="text-xs font-semibold uppercase text-alloy-midnight/60">Filters</span>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Vertical</span>
                        <select
                            value={verticalId}
                            onChange={(e) => setVerticalId(e.target.value)}
                            className="rounded border border-admin-border px-2 py-1.5 text-sm"
                        >
                            <option value="">All</option>
                            {verticals.map((v) => (
                                <option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Service Offering</span>
                        <select
                            value={serviceOfferingId}
                            onChange={(e) => setServiceOfferingId(e.target.value)}
                            className="rounded border border-admin-border px-2 py-1.5 text-sm"
                        >
                            <option value="">All</option>
                            {serviceOfferings.map((s) => (
                                <option key={s.id} value={s.id}>{s.offering_name ?? s.offering_key ?? s.id}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="flex gap-2 border-b border-admin-border">
                <button
                    type="button"
                    onClick={() => setActiveSection("first-clean")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md ${activeSection === "first-clean" ? "bg-alloy-blue text-white" : "bg-alloy-stone/20 text-alloy-forge hover:bg-alloy-stone/30"}`}
                >
                    First Clean Prices
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSection("recurring")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md ${activeSection === "recurring" ? "bg-alloy-blue text-white" : "bg-alloy-stone/20 text-alloy-forge hover:bg-alloy-stone/30"}`}
                >
                    Recurring Prices
                </button>
            </div>

            {activeSection === "first-clean" && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-alloy-forge">First Clean Prices</h2>
                        <button type="button" onClick={openAddFirst} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">
                            + Add First Clean Price
                        </button>
                    </div>
                    <div className="rounded-lg border border-admin-border bg-white overflow-hidden">
                        {loadingFirst ? (
                            <div className="p-8 text-center text-alloy-midnight/60">Loading…</div>
                        ) : firstCleanRows.length === 0 ? (
                            <div className="p-8 text-center text-alloy-midnight/60">No first clean prices. Add pricing records or adjust filters.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-admin-border bg-alloy-stone/10">
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Service</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Pricing Dimension</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Dimension Value</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Price</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Active</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {firstCleanRows.map((r) => (
                                        <tr key={r.id} className="border-b border-admin-border/50 hover:bg-alloy-stone/5">
                                            <td className="px-4 py-2">{r._service_name ?? "—"}</td>
                                            <td className="px-4 py-2">{r._pricing_dimension_label ?? "Square Footage"}</td>
                                            <td className="px-4 py-2">{r._dimension_value_label ?? "—"}</td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="text"
                                                    className="w-24 rounded border border-admin-border px-2 py-1 text-right"
                                                    defaultValue={r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : ""}
                                                    onBlur={(e) => {
                                                        const raw = e.target.value.trim();
                                                        if (raw === "") return;
                                                        const num = parseFloat(raw);
                                                        if (!Number.isNaN(num) && num >= 0 && Math.round(num * 100) !== (r.amount_cents ?? 0)) {
                                                            patchFirstClean(r.id, { amount_cents: Math.round(num * 100) });
                                                        }
                                                    }}
                                                    disabled={patchingFirstId === r.id}
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={!!r.is_active}
                                                    onChange={(e) => patchFirstClean(r.id, { is_active: e.target.checked })}
                                                    disabled={patchingFirstId === r.id}
                                                />
                                            </td>
                                            <td className="px-4 py-2">{r._updated ? formatDateTime(r._updated) : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            )}

            {activeSection === "recurring" && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-alloy-forge">Recurring Prices</h2>
                        <button type="button" onClick={openAddRecurring} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">
                            + Add Recurring Price
                        </button>
                    </div>
                    <div className="rounded-lg border border-admin-border bg-white overflow-hidden">
                        {loadingRecurring ? (
                            <div className="p-8 text-center text-alloy-midnight/60">Loading…</div>
                        ) : recurringRows.length === 0 ? (
                            <div className="p-8 text-center text-alloy-midnight/60">No recurring prices. Add pricing records or adjust filters.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-admin-border bg-alloy-stone/10">
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Service</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Plan Template</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Pricing Dimension</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Dimension Value</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Price</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Active</th>
                                        <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recurringRows.map((r) => (
                                        <tr key={r.id} className="border-b border-admin-border/50 hover:bg-alloy-stone/5">
                                            <td className="px-4 py-2">{r._service_name ?? "—"}</td>
                                            <td className="px-4 py-2">{r._plan_template_name ?? "—"}</td>
                                            <td className="px-4 py-2">{r._pricing_dimension_label ?? "Square Footage"}</td>
                                            <td className="px-4 py-2">{r._dimension_value_label ?? "—"}</td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="text"
                                                    className="w-24 rounded border border-admin-border px-2 py-1 text-right"
                                                    defaultValue={r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : ""}
                                                    onBlur={(e) => {
                                                        const raw = e.target.value.trim();
                                                        if (raw === "") return;
                                                        const num = parseFloat(raw);
                                                        if (!Number.isNaN(num) && num >= 0 && Math.round(num * 100) !== (r.amount_cents ?? 0)) {
                                                            patchRecurring(r.id, { amount_cents: Math.round(num * 100) });
                                                        }
                                                    }}
                                                    disabled={patchingRecurringId === r.id}
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={!!r.is_active}
                                                    onChange={(e) => patchRecurring(r.id, { is_active: e.target.checked })}
                                                    disabled={patchingRecurringId === r.id}
                                                />
                                            </td>
                                            <td className="px-4 py-2">{r._updated ? formatDateTime(r._updated) : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            )}

            {addFirstOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !addFirstSaving && setAddFirstOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-alloy-forge mb-4">Add First Clean Price</h3>
                        {addFirstError && <p className="text-sm text-red-600 mb-2">{addFirstError}</p>}
                        <div className="space-y-3">
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Vertical</span>
                                <select
                                    value={firstForm.vertical_id}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, vertical_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select vertical</option>
                                    {opts.verticals.map((v) => (
                                        <option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Service</span>
                                <select
                                    value={firstForm.pricing_service_id}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, pricing_service_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select service</option>
                                    {opts.pricing_services.map((s) => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Dimension Value</span>
                                <select
                                    value={firstForm.pricing_square_footage_tier_id}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, pricing_square_footage_tier_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select dimension value</option>
                                    {opts.dimension_value_options.map((d) => (
                                        <option key={d.id} value={d.id}>{d.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Amount ($)</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={firstForm.amount}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, amount: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={firstForm.is_active}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, is_active: e.target.checked }))}
                                />
                                <span className="text-sm text-alloy-midnight/80">Active</span>
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => !addFirstSaving && setAddFirstOpen(false)} className="px-3 py-1.5 text-sm border border-admin-border rounded-md">Cancel</button>
                            <button type="button" onClick={submitAddFirst} disabled={addFirstSaving || optionsLoading} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">
                                {addFirstSaving ? "Saving…" : "Add"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {addRecurringOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !addRecurringSaving && setAddRecurringOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-alloy-forge mb-4">Add Recurring Price</h3>
                        {addRecurringError && <p className="text-sm text-red-600 mb-2">{addRecurringError}</p>}
                        <div className="space-y-3">
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Vertical</span>
                                <select
                                    value={recurringForm.vertical_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, vertical_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select vertical</option>
                                    {opts.verticals.map((v) => (
                                        <option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Service</span>
                                <select
                                    value={recurringForm.pricing_service_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, pricing_service_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select service</option>
                                    {opts.pricing_services.map((s) => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Plan Template / Frequency</span>
                                <select
                                    value={recurringForm.pricing_frequency_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, pricing_frequency_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select frequency</option>
                                    {opts.pricing_frequencies.map((f) => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Dimension Value</span>
                                <select
                                    value={recurringForm.pricing_square_footage_tier_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, pricing_square_footage_tier_id: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">Select dimension value</option>
                                    {opts.dimension_value_options.map((d) => (
                                        <option key={d.id} value={d.id}>{d.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Amount ($)</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={recurringForm.amount}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, amount: e.target.value }))}
                                    className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={recurringForm.is_active}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, is_active: e.target.checked }))}
                                />
                                <span className="text-sm text-alloy-midnight/80">Active</span>
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => !addRecurringSaving && setAddRecurringOpen(false)} className="px-3 py-1.5 text-sm border border-admin-border rounded-md">Cancel</button>
                            <button type="button" onClick={submitAddRecurring} disabled={addRecurringSaving || optionsLoading} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">
                                {addRecurringSaving ? "Saving…" : "Add"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
