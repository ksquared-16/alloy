"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import { readPlanRevenueCategoryId } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { ProgramOffering } from "@/lib/programs/programOfferings";
import {
    organizationFinancialsChapterHref,
    organizationTuitionPlansHref,
} from "@/lib/commercial/commercialChapterRoutes";
import type { CommercialProduct } from "@/lib/commercial/commercialProducts";

type GlAccountRow = {
    id: string;
    code: string;
    name: string;
    type: string;
    is_active: boolean;
};

type RevenueCategoryRow = {
    id: string;
    label: string;
    mapped_gl_account_id: string | null;
};

type GlTab = "overview" | "used_by";

export default function GlCodesConfigurationPage() {
    const searchParams = useSearchParams();
    const initialAccountId = searchParams.get("accountId");
    const [accounts, setAccounts] = useState<GlAccountRow[]>([]);
    const [revenueCategories, setRevenueCategories] = useState<RevenueCategoryRow[]>([]);
    const [offerings, setOfferings] = useState<ProgramOffering[]>([]);
    const [products, setProducts] = useState<CommercialProduct[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(initialAccountId);
    const [tab, setTab] = useState<GlTab>("overview");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [type, setType] = useState("revenue");
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [glRes, rcRes, tpRes, prodRes] = await Promise.all([
                fetch("/api/admin/financials/accounts", { credentials: "include" }),
                fetch("/api/admin/commercial/revenue-categories?include_inactive=true", { credentials: "include" }),
                fetch("/api/admin/financials/tuition-plans", { credentials: "include" }),
                fetch("/api/admin/commercial/products", { credentials: "include" }),
            ]);
            const glJson = (await glRes.json()) as { data?: GlAccountRow[]; error?: string };
            const rcJson = (await rcRes.json()) as { revenue_categories?: RevenueCategoryRow[] };
            const tpJson = (await tpRes.json()) as { offerings?: ProgramOffering[] };
            const prodJson = (await prodRes.json()) as { products?: CommercialProduct[] };
            if (!glRes.ok) throw new Error(glJson.error || "Could not load GL codes.");
            setAccounts(glJson.data ?? []);
            setRevenueCategories(rcJson.revenue_categories ?? []);
            setOfferings(tpJson.offerings ?? []);
            setProducts(prodJson.products ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load GL codes.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (initialAccountId) setSelectedId(initialAccountId);
    }, [initialAccountId]);

    const usageByAccount = useMemo(() => {
        const map = new Map<string, { tuition: number; catalog: number }>();
        for (const account of accounts) {
            const revenueIds = new Set(
                revenueCategories.filter((rc) => rc.mapped_gl_account_id === account.id).map((rc) => rc.id),
            );
            const tuition = offerings.filter((offering) => {
                const rcId = readPlanRevenueCategoryId(offering);
                return rcId != null && revenueIds.has(rcId);
            }).length;
            const catalog = products.filter((product) => {
                if (!product.revenue_category_id) return false;
                return revenueIds.has(product.revenue_category_id);
            }).length;
            map.set(account.id, { tuition, catalog });
        }
        return map;
    }, [accounts, revenueCategories, offerings, products]);

    const visibleAccounts = useMemo(() => {
        const query = search.trim().toLowerCase();
        return accounts
            .filter((row) => {
                if (!query) return true;
                return `${row.code} ${row.name} ${row.type}`.toLowerCase().includes(query);
            })
            .sort((a, b) => a.code.localeCompare(b.code));
    }, [accounts, search]);

    const selected = accounts.find((row) => row.id === selectedId) ?? null;

    const tuitionPlansUsing = useMemo(() => {
        if (!selected) return [];
        const revenueIds = new Set(
            revenueCategories.filter((rc) => rc.mapped_gl_account_id === selected.id).map((rc) => rc.id),
        );
        return offerings.filter((offering) => {
            const rcId = readPlanRevenueCategoryId(offering);
            return rcId != null && revenueIds.has(rcId);
        });
    }, [selected, revenueCategories, offerings]);

    const catalogItemsUsing = useMemo(() => {
        if (!selected) return [];
        const revenueIds = new Set(
            revenueCategories.filter((rc) => rc.mapped_gl_account_id === selected.id).map((rc) => rc.id),
        );
        return products.filter(
            (product) => product.revenue_category_id != null && revenueIds.has(product.revenue_category_id),
        );
    }, [selected, revenueCategories, products]);

    const openCreate = () => {
        setCode("");
        setName("");
        setType("revenue");
        setDialog("create");
    };

    const openEdit = () => {
        if (!selected) return;
        setCode(selected.code);
        setName(selected.name);
        setType(selected.type);
        setDialog("edit");
    };

    const saveAccount = async () => {
        if (!code.trim()) return;
        setBusy(true);
        setError(null);
        try {
            if (dialog === "create") {
                const res = await fetch("/api/admin/financials/accounts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ code: code.trim(), name: name.trim() || code.trim(), type }),
                });
                const json = (await res.json()) as GlAccountRow & { error?: string };
                if (!res.ok) throw new Error(json.error || "Could not create GL code.");
                setAccounts((current) => [...current, json]);
                setSelectedId(json.id);
                // Ensure Tuition/Catalog selectors can see this GL immediately via revenue mapping.
                if (json.type === "revenue" || type === "revenue") {
                    const { ensureRevenueCategoryForGlAccount } = await import(
                        "@/lib/financials/gl/glCodeOptions"
                    );
                    const ensured = await ensureRevenueCategoryForGlAccount({
                        account: json,
                        revenueCategories,
                    });
                    setRevenueCategories(ensured.revenueCategories);
                }
            } else if (dialog === "edit" && selected) {
                const res = await fetch(`/api/admin/financials/accounts/${selected.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ code: code.trim(), name: name.trim() || code.trim(), type }),
                });
                const json = (await res.json()) as GlAccountRow & { error?: string };
                if (!res.ok) throw new Error(json.error || "Could not update GL code.");
                setAccounts((current) => current.map((row) => (row.id === selected.id ? json : row)));
            }
            setDialog(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    };

    const setActive = async (isActive: boolean) => {
        if (!selected) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/financials/accounts/${selected.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ is_active: isActive }),
            });
            const json = (await res.json()) as GlAccountRow & { error?: string };
            if (!res.ok) throw new Error(json.error || "Could not update status.");
            setAccounts((current) => current.map((row) => (row.id === selected.id ? json : row)));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Status update failed.");
        } finally {
            setBusy(false);
        }
    };

    const usage = selected ? usageByAccount.get(selected.id) : null;

    return (
        <div data-testid="gl-codes-configuration-page">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <ConfigurationPrimaryButton className="gap-1" onClick={openCreate} data-testid="gl-codes-new">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New GL Code
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="gl-codes-configuration-shell">
                {loading ?
                    <ConfigurationEmptyState testId="gl-codes-loading" title="Loading GL Codes" description="Fetching chart of accounts." />
                :   <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                        <aside className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block">
                            <header className="locations-collection-rail__header">
                                <h2 className="locations-collection-rail__title">GL Codes</h2>
                                <p className="locations-collection-rail__count">{visibleAccounts.length} accounts</p>
                            </header>
                            <div className="programs-collection-controls">
                                <div className="programs-collection-controls__search-wrap">
                                    <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search GL Codes…"
                                        className="programs-collection-controls__search"
                                        data-testid="gl-codes-search"
                                    />
                                </div>
                            </div>
                            <div className="locations-collection-rail__list" role="listbox" aria-label="GL Codes">
                                {visibleAccounts.map((row) => {
                                    const selectedRow = row.id === selectedId;
                                    const counts = usageByAccount.get(row.id);
                                    const usedBy = (counts?.tuition ?? 0) + (counts?.catalog ?? 0);
                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            role="option"
                                            aria-selected={selectedRow}
                                            className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row ${
                                                selectedRow ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                            }`}
                                            onClick={() => {
                                                setSelectedId(row.id);
                                                setTab("overview");
                                            }}
                                            data-testid={`gl-code-${row.id}`}
                                        >
                                            {selectedRow ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                            <span className="locations-collection-row__body">
                                                <span className="locations-collection-row__name">{row.code}</span>
                                                <span className="locations-collection-row__place">{row.name}</span>
                                                <span className="locations-collection-row__meta text-alloy-midnight/50">
                                                    {row.type}
                                                    {!row.is_active ? " · Inactive" : ""}
                                                    {usedBy > 0 ? ` · Used by ${usedBy}` : ""}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <main className="min-w-0">
                            {selected ?
                                <div className="space-y-4">
                                    <section className="process-config-setup-card p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                                    {selected.code} · {selected.name}
                                                </h2>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {selected.type}
                                                    {" · "}
                                                    {selected.is_active ? "Active" : "Inactive"}
                                                    {usage ?
                                                        ` · ${(usage.tuition + usage.catalog)} uses`
                                                    :   null}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton onClick={openEdit} data-testid="gl-code-edit">
                                                    Edit
                                                </ConfigurationSecondaryButton>
                                                {selected.is_active ?
                                                    <ConfigurationSecondaryButton
                                                        disabled={busy}
                                                        onClick={() => void setActive(false)}
                                                        data-testid="gl-code-archive"
                                                    >
                                                        Archive
                                                    </ConfigurationSecondaryButton>
                                                :   <ConfigurationSecondaryButton
                                                        disabled={busy}
                                                        onClick={() => void setActive(true)}
                                                        data-testid="gl-code-restore"
                                                    >
                                                        Restore
                                                    </ConfigurationSecondaryButton>
                                                }
                                            </div>
                                        </div>
                                        <div
                                            className="mt-4 flex gap-1 border-b border-alloy-stone/20"
                                            role="tablist"
                                            aria-label="GL Code sections"
                                        >
                                            {(
                                                [
                                                    { key: "overview", label: "Overview" },
                                                    { key: "used_by", label: "Used By" },
                                                ] as const
                                            ).map((item) => (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={tab === item.key}
                                                    onClick={() => setTab(item.key)}
                                                    className={`px-3 py-1.5 text-[12px] -mb-px border-b-2 ${
                                                        tab === item.key
                                                            ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                                            : "border-transparent text-alloy-midnight/55"
                                                    }`}
                                                    data-testid={`gl-code-tab-${item.key}`}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                    {tab === "overview" ?
                                        <section className="process-config-setup-card p-5" data-testid="gl-code-overview">
                                            <h3 className="text-base font-semibold text-alloy-midnight">
                                                {selected.code} · {selected.name}
                                            </h3>
                                            <p className="mt-1 text-sm text-alloy-midnight/55">
                                                Revenue and other financial activity posts to this account when Tuition
                                                Plans and Catalog Items assign a matching revenue category.
                                            </p>
                                            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Code</dt>
                                                    <dd className="mt-0.5">{selected.code}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Name</dt>
                                                    <dd className="mt-0.5">{selected.name}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Category</dt>
                                                    <dd className="mt-0.5 capitalize">{selected.type}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Status</dt>
                                                    <dd className="mt-0.5">{selected.is_active ? "Active" : "Inactive"}</dd>
                                                </div>
                                            </dl>
                                            <p className="mt-4 text-xs text-alloy-midnight/45">
                                                GL Codes in use cannot be deleted. Archive to hide them from new
                                                assignments.
                                            </p>
                                        </section>
                                    :   <section className="process-config-setup-card p-5 space-y-5" data-testid="gl-code-used-by">
                                            <div>
                                                <h3 className="text-sm font-semibold text-alloy-midnight">Tuition Plans</h3>
                                                {tuitionPlansUsing.length === 0 ?
                                                    <p className="mt-2 text-sm text-alloy-midnight/55">
                                                        No Tuition Plans map to revenue categories on this GL code yet.
                                                    </p>
                                                :   <ul className="mt-3 space-y-2 text-sm">
                                                        {tuitionPlansUsing.map((plan) => (
                                                            <li key={plan.id}>
                                                                <Link
                                                                    href={organizationTuitionPlansHref({
                                                                        planId: plan.id,
                                                                        tab: "overview",
                                                                    })}
                                                                    className="text-alloy-bend-pine hover:underline"
                                                                    data-testid={`gl-used-by-plan-${plan.id}`}
                                                                >
                                                                    {plan.label}
                                                                </Link>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                }
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-alloy-midnight">Catalog Items</h3>
                                                {catalogItemsUsing.length === 0 ?
                                                    <p className="mt-2 text-sm text-alloy-midnight/55">
                                                        No Catalog Items map to this GL code yet.
                                                    </p>
                                                :   <ul className="mt-3 space-y-2 text-sm">
                                                        {catalogItemsUsing.map((item) => (
                                                            <li key={item.id}>
                                                                <Link
                                                                    href={organizationFinancialsChapterHref("catalog", {
                                                                        itemId: item.id,
                                                                    })}
                                                                    className="text-alloy-bend-pine hover:underline"
                                                                    data-testid={`gl-used-by-catalog-${item.id}`}
                                                                >
                                                                    {item.name}
                                                                </Link>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                }
                                            </div>
                                        </section>
                                    }
                                </div>
                            :   <ConfigurationEmptyState
                                    testId="gl-codes-no-selection"
                                    title="Select a GL Code"
                                    description="Choose an account from the list to review mapping and usage."
                                />
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {dialog ?
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <h2 className="text-lg font-semibold text-alloy-midnight">
                            {dialog === "create" ? "New GL Code" : "Edit GL Code"}
                        </h2>
                        <div className="mt-4 space-y-3">
                            <label>
                                <span className="config-typo-field-label">Code *</span>
                                <input
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="gl-code-dialog-code"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Name</span>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="gl-code-dialog-name"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Category</span>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className="config-runtime-select mt-1"
                                    data-testid="gl-code-dialog-type"
                                >
                                    <option value="revenue">Revenue</option>
                                    <option value="liability">Liability</option>
                                    <option value="asset">Asset</option>
                                    <option value="expense">Expense</option>
                                    <option value="equity">Equity</option>
                                </select>
                            </label>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton disabled={busy} onClick={() => setDialog(null)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={busy || !code.trim()}
                                onClick={() => void saveAccount()}
                                data-testid="gl-code-dialog-save"
                            >
                                {busy ? "Saving…" : dialog === "create" ? "Create" : "Save"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}
