"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoneyFromCents, formatDateTime } from "@/lib/adminFormatters";
import type { FirstCleanPriceRow } from "@/app/api/admin/pricing/first-clean-prices/route";
import type { RecurringPriceRow } from "@/app/api/admin/pricing/recurring-prices/route";
import type { PricingMatrixRow } from "@/app/api/admin/pricing/matrix/route";

type VerticalOption = { id: string; name: string | null; slug: string | null };
type ServiceOfferingOption = { id: string; offering_name: string | null; offering_key: string | null };

type PricingModeOption = { id: string; key: string; label: string };
type PricingOptions = {
    verticals: { id: string; name: string | null; slug: string | null }[];
    pricing_modes?: PricingModeOption[];
    pricing_services: { id: string; label: string }[];
    dimension_value_options: { id: string; label: string }[];
    pricing_frequencies: { id: string; label: string }[];
    matrix_service_offerings?: { id: string; label: string }[];
    matrix_plan_templates?: { id: string; label: string }[];
    matrix_dimension_values?: { id: string; label: string; dimension_label?: string | null }[];
};

export default function PricingClient() {
    const [activeSection, setActiveSection] = useState<"first-clean" | "recurring" | "matrix">("matrix");
    const [verticalId, setVerticalId] = useState("");
    const [serviceOfferingId, setServiceOfferingId] = useState("");
    const [pricingModeId, setPricingModeId] = useState("");
    const [planTemplateId, setPlanTemplateId] = useState("");
    const [isActiveFilter, setIsActiveFilter] = useState<"" | "true" | "false">("");
    const [groupBy, setGroupBy] = useState<"none" | "pricing_mode" | "service_offering" | "plan_template">("none");
    const [verticals, setVerticals] = useState<VerticalOption[]>([]);
    const [serviceOfferings, setServiceOfferings] = useState<ServiceOfferingOption[]>([]);
    const [firstCleanRows, setFirstCleanRows] = useState<FirstCleanPriceRow[]>([]);
    const [recurringRows, setRecurringRows] = useState<RecurringPriceRow[]>([]);
    const [loadingFirst, setLoadingFirst] = useState(false);
    const [loadingRecurring, setLoadingRecurring] = useState(false);
    const [matrixRows, setMatrixRows] = useState<PricingMatrixRow[]>([]);
    const [loadingMatrix, setLoadingMatrix] = useState(false);

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
        service_id: "",
        sqft_tier_id: "",
        amount: "",
        is_active: true,
    });
    const [recurringForm, setRecurringForm] = useState({
        vertical_id: "",
        service_id: "",
        frequency_id: "",
        sqft_tier_id: "",
        amount: "",
        is_active: true,
    });

    const [patchingFirstId, setPatchingFirstId] = useState<string | null>(null);
    const [patchingRecurringId, setPatchingRecurringId] = useState<string | null>(null);
    const [patchingMatrixId, setPatchingMatrixId] = useState<string | null>(null);
    const [addRuleOpen, setAddRuleOpen] = useState(false);
    const [addRuleSaving, setAddRuleSaving] = useState(false);
    const [addRuleError, setAddRuleError] = useState<string | null>(null);
    const [ruleForm, setRuleForm] = useState({
        vertical_id: "",
        service_offering_id: "",
        pricing_mode_id: "",
        service_plan_template_id: "",
        pricing_dimension_value_id: "",
        amount: "",
        is_active: true,
    });

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

    const fetchMatrix = useCallback(async () => {
        setLoadingMatrix(true);
        try {
            const params = new URLSearchParams();
            if (verticalId) params.set("vertical_id", verticalId);
            if (serviceOfferingId) params.set("service_offering_id", serviceOfferingId);
            if (pricingModeId) params.set("pricing_mode_id", pricingModeId);
            if (planTemplateId) params.set("service_plan_template_id", planTemplateId);
            if (isActiveFilter) params.set("is_active", isActiveFilter);
            const res = await fetch(`/api/admin/pricing/matrix?${params}`);
            const json = await res.json().catch(() => ({}));
            setMatrixRows(res.ok ? (json.rows ?? []) : []);
        } finally {
            setLoadingMatrix(false);
        }
    }, [verticalId, serviceOfferingId, pricingModeId, planTemplateId, isActiveFilter]);
    useEffect(() => { if (activeSection === "matrix") fetchMatrix(); }, [activeSection, fetchMatrix]);

    const patchMatrix = useCallback(async (id: string, payload: { amount_cents?: number; is_active?: boolean }) => {
        setPatchingMatrixId(id);
        try {
            const res = await fetch(`/api/admin/pricing/matrix/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) await fetchMatrix();
        } finally {
            setPatchingMatrixId(null);
        }
    }, [fetchMatrix]);

    const openAddRule = () => {
        setRuleForm({
            vertical_id: verticalId,
            service_offering_id: serviceOfferingId,
            pricing_mode_id: pricingModeId || "",
            service_plan_template_id: planTemplateId || "",
            pricing_dimension_value_id: "",
            amount: "",
            is_active: true,
        });
        setAddRuleError(null);
        setAddRuleOpen(true);
    };
    const submitAddRule = async () => {
        if (!ruleForm.vertical_id.trim()) { setAddRuleError("Vertical is required"); return; }
        if (!ruleForm.service_offering_id.trim()) { setAddRuleError("Service Offering is required"); return; }
        if (!ruleForm.pricing_mode_id.trim()) { setAddRuleError("Pricing Mode is required"); return; }
        const amountNum = parseFloat(ruleForm.amount);
        if (ruleForm.amount !== "" && (Number.isNaN(amountNum) || amountNum < 0)) { setAddRuleError("Amount must be a non-negative number"); return; }
        setAddRuleSaving(true);
        setAddRuleError(null);
        try {
            const amount = ruleForm.amount === "" ? 0 : amountNum;
            const res = await fetch("/api/admin/pricing/matrix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vertical_id: ruleForm.vertical_id.trim(),
                    service_offering_id: ruleForm.service_offering_id.trim(),
                    pricing_mode_id: ruleForm.pricing_mode_id.trim(),
                    service_plan_template_id: ruleForm.service_plan_template_id.trim() || null,
                    pricing_dimension_value_id: ruleForm.pricing_dimension_value_id.trim() || null,
                    amount,
                    is_active: ruleForm.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setAddRuleError((json as { error?: string }).error ?? "Create failed"); return; }
            setAddRuleOpen(false);
            fetchMatrix();
        } finally {
            setAddRuleSaving(false);
        }
    };

    const fetchOptions = useCallback(async (verticalIdFilter: string) => {
        const params = new URLSearchParams();
        if (verticalIdFilter) params.set("vertical_id", verticalIdFilter);
        const res = await fetch(`/api/admin/pricing/options?${params}`);
        const json = await res.json().catch(() => ({}));
        return res.ok ? (json as PricingOptions) : null;
    }, []);

    const fetchOptionsForModals = useCallback(async (verticalIdFilter: string) => {
        setOptionsLoading(true);
        try {
            const data = await fetchOptions(verticalIdFilter);
            setOptions(data);
        } finally {
            setOptionsLoading(false);
        }
    }, [fetchOptions]);

    useEffect(() => {
        fetchOptions(verticalId).then((data) => {
            if (data) setOptions(data);
        });
    }, [verticalId, fetchOptions]);

    useEffect(() => {
        if (addFirstOpen) fetchOptionsForModals(firstForm.vertical_id || verticalId);
    }, [addFirstOpen, firstForm.vertical_id, verticalId, fetchOptionsForModals]);

    useEffect(() => {
        if (addRecurringOpen) fetchOptionsForModals(recurringForm.vertical_id || verticalId);
    }, [addRecurringOpen, recurringForm.vertical_id, verticalId, fetchOptionsForModals]);

    useEffect(() => {
        if (addRuleOpen) fetchOptionsForModals(ruleForm.vertical_id || verticalId);
    }, [addRuleOpen, ruleForm.vertical_id, verticalId, fetchOptionsForModals]);

    const openAddFirst = () => {
        setFirstForm({
            vertical_id: verticalId,
            service_id: "",
            sqft_tier_id: "",
            amount: "",
            is_active: true,
        });
        setAddFirstError(null);
        setAddFirstOpen(true);
    };

    const openAddRecurring = () => {
        setRecurringForm({
            vertical_id: verticalId,
            service_id: "",
            frequency_id: "",
            sqft_tier_id: "",
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
        if (!firstForm.service_id.trim()) {
            setAddFirstError("Service is required");
            return;
        }
        if (!firstForm.sqft_tier_id.trim()) {
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
                    service_id: firstForm.service_id.trim(),
                    sqft_tier_id: firstForm.sqft_tier_id.trim(),
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
        if (!recurringForm.service_id.trim()) {
            setAddRecurringError("Service is required");
            return;
        }
        if (!recurringForm.frequency_id.trim()) {
            setAddRecurringError("Plan / frequency is required");
            return;
        }
        if (!recurringForm.sqft_tier_id.trim()) {
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
                    service_id: recurringForm.service_id.trim(),
                    frequency_id: recurringForm.frequency_id.trim(),
                    sqft_tier_id: recurringForm.sqft_tier_id.trim(),
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
        pricing_modes: [],
        pricing_services: [],
        dimension_value_options: [],
        pricing_frequencies: [],
        matrix_service_offerings: [],
        matrix_plan_templates: [],
        matrix_dimension_values: [],
    };
    const modeByKey = (key: string) => (opts.pricing_modes ?? []).find((m) => m.key === key);
    const initialLabel = modeByKey("initial")?.label ?? "Initial Service Pricing";
    const recurringLabel = modeByKey("recurring")?.label ?? "Recurring Service Pricing";

    return (
        <div className="space-y-6">
            <header className="rounded-xl border border-admin-border border-l-4 border-l-alloy-blue bg-admin-surface-card px-6 py-4 shadow-sm">
                <h1 className="text-2xl font-bold tracking-tight text-alloy-forge">Pricing</h1>
                <p className="mt-1 text-sm text-alloy-midnight/70">Configure pricing by service offering, plan template, pricing mode, and dimension value.</p>
            </header>

            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-admin-border bg-white px-4 py-3">
                <span className="text-xs font-semibold uppercase text-alloy-midnight/60">Filters</span>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Vertical</span>
                        <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className="rounded border border-admin-border px-2 py-1.5 text-sm">
                            <option value="">All</option>
                            {verticals.map((v) => (<option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Service Offering</span>
                        <select value={serviceOfferingId} onChange={(e) => setServiceOfferingId(e.target.value)} className="rounded border border-admin-border px-2 py-1.5 text-sm">
                            <option value="">All</option>
                            {serviceOfferings.map((s) => (<option key={s.id} value={s.id}>{s.offering_name ?? s.offering_key ?? s.id}</option>))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Pricing Mode</span>
                        <select value={pricingModeId} onChange={(e) => setPricingModeId(e.target.value)} className="rounded border border-admin-border px-2 py-1.5 text-sm">
                            <option value="">All</option>
                            {(opts.pricing_modes ?? []).map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Plan Template</span>
                        <select value={planTemplateId} onChange={(e) => setPlanTemplateId(e.target.value)} className="rounded border border-admin-border px-2 py-1.5 text-sm">
                            <option value="">All</option>
                            {(opts.matrix_plan_templates ?? []).map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-alloy-forge/80">Active</span>
                        <select value={isActiveFilter} onChange={(e) => setIsActiveFilter((e.target.value as "" | "true" | "false") || "")} className="rounded border border-admin-border px-2 py-1.5 text-sm">
                            <option value="">All</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                        </select>
                    </label>
                    {activeSection === "matrix" && (
                        <label className="flex items-center gap-2">
                            <span className="text-sm text-alloy-forge/80">Group by</span>
                            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className="rounded border border-admin-border px-2 py-1.5 text-sm">
                                <option value="none">None</option>
                                <option value="pricing_mode">Pricing Mode</option>
                                <option value="service_offering">Service Offering</option>
                                <option value="plan_template">Plan Template</option>
                            </select>
                        </label>
                    )}
                </div>
            </div>

            <div className="flex gap-2 border-b border-admin-border">
                <button type="button" onClick={() => setActiveSection("matrix")} className={`px-4 py-2 text-sm font-medium rounded-t-md ${activeSection === "matrix" ? "bg-alloy-blue text-white" : "bg-alloy-stone/20 text-alloy-forge hover:bg-alloy-stone/30"}`}>
                    Pricing Matrix
                </button>
                <button type="button" onClick={() => setActiveSection("first-clean")} className={`px-4 py-2 text-sm font-medium rounded-t-md ${activeSection === "first-clean" ? "bg-alloy-blue text-white" : "bg-alloy-stone/20 text-alloy-forge hover:bg-alloy-stone/30"}`}>
                    Legacy: {initialLabel}
                </button>
                <button type="button" onClick={() => setActiveSection("recurring")} className={`px-4 py-2 text-sm font-medium rounded-t-md ${activeSection === "recurring" ? "bg-alloy-blue text-white" : "bg-alloy-stone/20 text-alloy-forge hover:bg-alloy-stone/30"}`}>
                    Legacy: {recurringLabel}
                </button>
            </div>

            {activeSection === "first-clean" && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-alloy-forge">{initialLabel}</h2>
                        <button type="button" onClick={openAddFirst} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">
                            + Add {initialLabel.replace(/ Pricing$/, " Price")}
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
                        <h2 className="text-lg font-semibold text-alloy-forge">{recurringLabel}</h2>
                        <button type="button" onClick={openAddRecurring} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">
                            + Add {recurringLabel.replace(/ Pricing$/, " Price")}
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

            {activeSection === "matrix" && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-lg font-semibold text-alloy-forge">Pricing Matrix</h2>
                            <p className="mt-1 text-sm text-alloy-midnight/70">Service offering, plan template, pricing mode, and dimension value. Edit amount and active inline.</p>
                        </div>
                        <button type="button" onClick={openAddRule} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">+ Add Pricing Rule</button>
                    </div>
                    <div className="rounded-lg border border-admin-border bg-white overflow-hidden">
                        {loadingMatrix ? (
                            <div className="p-8 text-center text-alloy-midnight/60">Loading…</div>
                        ) : matrixRows.length === 0 ? (
                            <div className="p-8 text-center text-alloy-midnight/60">No pricing rules. Add a rule or adjust filters.</div>
                        ) : (() => {
                            const rows = matrixRows;
                            const tableBody = (list: PricingMatrixRow[]) => (
                                list.map((r) => (
                                    <tr key={r.id} className="border-b border-admin-border/50 hover:bg-alloy-stone/5">
                                        <td className="px-4 py-2">{r._service_offering_name ?? "—"}</td>
                                        <td className="px-4 py-2">{r._plan_template_name ?? "—"}</td>
                                        <td className="px-4 py-2">{r._pricing_mode_name ?? "—"}</td>
                                        <td className="px-4 py-2">{r._dimension_name ?? "—"}</td>
                                        <td className="px-4 py-2">{r._dimension_value_label ?? "—"}</td>
                                        <td className="px-4 py-2">
                                            <input type="text" className="w-24 rounded border border-admin-border px-2 py-1 text-right" defaultValue={r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : ""} onBlur={(e) => { const raw = e.target.value.trim(); if (raw === "") return; const num = parseFloat(raw); if (!Number.isNaN(num) && num >= 0 && Math.round(num * 100) !== (r.amount_cents ?? 0)) patchMatrix(r.id, { amount_cents: Math.round(num * 100) }); }} disabled={patchingMatrixId === r.id} />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input type="checkbox" checked={!!r.is_active} onChange={(e) => patchMatrix(r.id, { is_active: e.target.checked })} disabled={patchingMatrixId === r.id} />
                                        </td>
                                        <td className="px-4 py-2">{r._updated ? formatDateTime(r._updated) : "—"}</td>
                                    </tr>
                                ))
                            );
                            if (groupBy === "none") {
                                return (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-admin-border bg-alloy-stone/10">
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Service Offering</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Plan Template</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Pricing Mode</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Pricing Dimension</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Dimension Value</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Amount</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Active</th>
                                                    <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Updated</th>
                                                </tr>
                                            </thead>
                                            <tbody>{tableBody(rows)}</tbody>
                                        </table>
                                    </div>
                                );
                            }
                            const getGroupKey = (r: PricingMatrixRow) => groupBy === "pricing_mode" ? (r._pricing_mode_name ?? "—") : groupBy === "service_offering" ? (r._service_offering_name ?? "—") : (r._plan_template_name ?? "—");
                            const groups = new Map<string, PricingMatrixRow[]>();
                            rows.forEach((r) => { const k = getGroupKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); });
                            return (
                                <div className="divide-y divide-admin-border">
                                    {Array.from(groups.entries()).map(([label, list]) => (
                                        <div key={label}>
                                            <h3 className="px-4 py-2 text-sm font-semibold text-alloy-midnight/80 bg-alloy-stone/10">{label}</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-admin-border bg-alloy-stone/5">
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Service Offering</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Plan Template</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Pricing Mode</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Pricing Dimension</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Dimension Value</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Amount</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Active</th>
                                                            <th className="text-left px-4 py-2 font-medium text-alloy-midnight/80">Updated</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>{tableBody(list)}</tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </section>
            )}

            {addFirstOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !addFirstSaving && setAddFirstOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-alloy-forge mb-4">Add {initialLabel.replace(/ Pricing$/, " Price")}</h3>
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
                                    value={firstForm.service_id}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, service_id: e.target.value }))}
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
                                    value={firstForm.sqft_tier_id}
                                    onChange={(e) => setFirstForm((f) => ({ ...f, sqft_tier_id: e.target.value }))}
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
                        <h3 className="text-lg font-semibold text-alloy-forge mb-4">Add {recurringLabel.replace(/ Pricing$/, " Price")}</h3>
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
                                    value={recurringForm.service_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, service_id: e.target.value }))}
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
                                    value={recurringForm.frequency_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, frequency_id: e.target.value }))}
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
                                    value={recurringForm.sqft_tier_id}
                                    onChange={(e) => setRecurringForm((f) => ({ ...f, sqft_tier_id: e.target.value }))}
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

            {addRuleOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !addRuleSaving && setAddRuleOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-alloy-forge mb-4">Add Pricing Rule</h3>
                        {addRuleError && <p className="text-sm text-red-600 mb-2">{addRuleError}</p>}
                        <div className="space-y-3">
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Vertical</span>
                                <select value={ruleForm.vertical_id} onChange={(e) => setRuleForm((f) => ({ ...f, vertical_id: e.target.value }))} className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm">
                                    <option value="">Select vertical</option>
                                    {opts.verticals.map((v) => (<option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Service Offering</span>
                                <select value={ruleForm.service_offering_id} onChange={(e) => setRuleForm((f) => ({ ...f, service_offering_id: e.target.value }))} className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm">
                                    <option value="">Select service offering</option>
                                    {(opts.matrix_service_offerings ?? []).map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Pricing Mode</span>
                                <select value={ruleForm.pricing_mode_id} onChange={(e) => setRuleForm((f) => ({ ...f, pricing_mode_id: e.target.value }))} className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm">
                                    <option value="">Select pricing mode</option>
                                    {(opts.pricing_modes ?? []).map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Plan Template (optional)</span>
                                <select value={ruleForm.service_plan_template_id} onChange={(e) => setRuleForm((f) => ({ ...f, service_plan_template_id: e.target.value }))} className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm">
                                    <option value="">— None —</option>
                                    {(opts.matrix_plan_templates ?? []).map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Dimension Value (optional)</span>
                                <select value={ruleForm.pricing_dimension_value_id} onChange={(e) => setRuleForm((f) => ({ ...f, pricing_dimension_value_id: e.target.value }))} className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm">
                                    <option value="">— None —</option>
                                    {(opts.matrix_dimension_values ?? []).map((d) => (<option key={d.id} value={d.id}>{d.dimension_label ? `${d.label} (${d.dimension_label})` : d.label}</option>))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-alloy-midnight/80">Amount ($)</span>
                                <input type="number" min={0} step={0.01} value={ruleForm.amount} onChange={(e) => setRuleForm((f) => ({ ...f, amount: e.target.value }))} className="mt-1 w-full rounded border border-admin-border px-2 py-1.5 text-sm" />
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm((f) => ({ ...f, is_active: e.target.checked }))} />
                                <span className="text-sm text-alloy-midnight/80">Active</span>
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => !addRuleSaving && setAddRuleOpen(false)} className="px-3 py-1.5 text-sm border border-admin-border rounded-md">Cancel</button>
                            <button type="button" onClick={submitAddRule} disabled={addRuleSaving || optionsLoading} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">{addRuleSaving ? "Saving…" : "Add"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
