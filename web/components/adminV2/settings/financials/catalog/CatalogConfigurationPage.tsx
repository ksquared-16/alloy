"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { cadenceLabel, type BillingCadence } from "@/lib/commercial/billingCadences";
import { organizationFinancialsChapterHref } from "@/lib/commercial/commercialChapterRoutes";
import {
    activeCategories,
    buildBehavior,
    COMMERCIAL_TYPE_LABELS,
    COMMERCIAL_TYPE_OPTIONS,
    depositBehavior,
    feeIsRequired,
    getPackage,
    sortCategories,
    sortProducts,
    type CommercialCategory,
    type CommercialProduct,
    type CommercialRevenueCategory,
    type CommercialType,
} from "@/lib/commercial/commercialProducts";
import {
    CatalogSetupSubnav,
    normalizeCatalogSetupSection,
} from "./CatalogSetupSubnav";
import { CatalogCategoriesPanel } from "./CatalogCategoriesPanel";
import {
    LocationMultiSelect,
    summarizeLocationApplicability,
    type LocationApplicabilityMode,
    type LocationOption,
} from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";
import { GlCodeSelect } from "@/components/adminV2/settings/configurationRuntime/GlCodeSelect";
import {
    locationApplicabilityFromMetadata,
    readLocationPrices,
    resolveLocationPriceCents,
    SELECTED_LOCATION_IDS_META_KEY,
    writeLocationIdsMetadata,
    writeLocationPricesMetadata,
    type LocationPriceOverride,
} from "@/lib/financials/applicability/locationApplicability";

type CatalogTab = "overview" | "pricing" | "locations" | "history";
type CatalogLocation = { id: string; name: string };

const ITEM_DIALOG_STEPS = ["Define Item", "Availability", "Pricing", "Accounting", "Review"] as const;

function formatAmount(cents: number): string {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
}

function typeLabel(type: string): string {
    return COMMERCIAL_TYPE_LABELS[type as CommercialType] ?? "Catalog item";
}

function toLocationOptions(locations: CatalogLocation[]): LocationOption[] {
    return locations.map((row) => ({ id: row.id, name: row.name }));
}

function productLocationApplicability(product: CommercialProduct) {
    return locationApplicabilityFromMetadata(product.metadata, SELECTED_LOCATION_IDS_META_KEY, product.location_id);
}

function productLocationSummary(product: CommercialProduct, options: LocationOption[]): string {
    const applicability = productLocationApplicability(product);
    return summarizeLocationApplicability(applicability.mode, applicability.locationIds, options);
}

/** Parses a dollars-and-cents input string into integer cents, or null when invalid/empty. */
function parseAmountToCents(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100);
}

export default function CatalogConfigurationPage({
    products,
    categories,
    revenueCategories,
    locations,
    programs,
    cadences,
    loading,
    initialSetup = null,
    initialItemId = null,
    onProductCreated,
    onProductUpdated,
    onCategoryCreated,
    onCategoriesChanged,
}: {
    products: CommercialProduct[];
    categories: CommercialCategory[];
    revenueCategories: CommercialRevenueCategory[];
    locations: CatalogLocation[];
    programs: { key: string; label: string }[];
    cadences: BillingCadence[];
    loading: boolean;
    initialSetup?: string | null;
    initialItemId?: string | null;
    onProductCreated?: (product: CommercialProduct) => void;
    onProductUpdated?: (product: CommercialProduct) => void;
    onCategoryCreated?: (category: CommercialCategory) => void;
    onCategoriesChanged?: (categories: CommercialCategory[]) => void;
}) {
    const setup = normalizeCatalogSetupSection(initialSetup);

    if (setup === "categories") {
        return (
            <div data-testid="catalog-configuration-page">
                <CatalogSetupSubnav active="categories" itemId={initialItemId} />
                <CatalogCategoriesPanel
                    categories={categories}
                    products={products}
                    onChanged={(next) => onCategoriesChanged?.(next)}
                />
            </div>
        );
    }

    return (
        <div data-testid="catalog-configuration-page">
            <CatalogSetupSubnav active="items" itemId={initialItemId} />
            <CatalogItemsWorkspace
                products={products}
                categories={categories}
                revenueCategories={revenueCategories}
                locations={locations}
                programs={programs}
                cadences={cadences}
                loading={loading}
                initialItemId={initialItemId}
                onProductCreated={onProductCreated}
                onProductUpdated={onProductUpdated}
                onCategoryCreated={onCategoryCreated}
            />
        </div>
    );
}

function CatalogItemsWorkspace({
    products,
    categories,
    revenueCategories,
    locations,
    programs,
    cadences,
    loading,
    initialItemId,
    onProductCreated,
    onProductUpdated,
    onCategoryCreated,
}: {
    products: CommercialProduct[];
    categories: CommercialCategory[];
    revenueCategories: CommercialRevenueCategory[];
    locations: CatalogLocation[];
    programs: { key: string; label: string }[];
    cadences: BillingCadence[];
    loading: boolean;
    initialItemId?: string | null;
    onProductCreated?: (product: CommercialProduct) => void;
    onProductUpdated?: (product: CommercialProduct) => void;
    onCategoryCreated?: (category: CommercialCategory) => void;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(initialItemId ?? null);
    const [tab, setTab] = useState<CatalogTab>("overview");
    const [search, setSearch] = useState("");
    const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (initialItemId) setSelectedId(initialItemId);
    }, [initialItemId]);

    const locationOptions = useMemo(() => toLocationOptions(locations), [locations]);
    const sorted = useMemo(() => sortProducts(products), [products]);
    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return sorted;
        return sorted.filter((row) =>
            `${row.name} ${typeLabel(row.commercial_type)}`.toLowerCase().includes(query),
        );
    }, [sorted, search]);

    const selected = products.find((row) => row.id === selectedId) ?? null;
    const categoryLabel = selected?.category_id
        ? categories.find((row) => row.id === selected.category_id)?.label ?? "—"
        : "—";
    const revenueCategory = selected?.revenue_category_id
        ? revenueCategories.find((row) => row.id === selected.revenue_category_id) ?? null
        : null;
    const revenueLabel = revenueCategory?.label ?? "Not set";
    const programLabel = selected?.program_key
        ? programs.find((row) => row.key === selected.program_key)?.label ?? selected.program_key
        : "All programs";
    const locationSummary = selected ? productLocationSummary(selected, locationOptions) : "—";
    const locationPriceOverrideCount = selected ? Object.keys(readLocationPrices(selected.metadata)).length : 0;

    const setActive = async (isActive: boolean) => {
        if (!selected) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/commercial/products/${selected.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ is_active: isActive }),
            });
            const json = (await res.json()) as { product?: CommercialProduct; error?: string };
            if (!res.ok || !json.product) throw new Error(json.error || "Could not update status.");
            onProductUpdated?.(json.product);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Status update failed.");
        } finally {
            setBusy(false);
        }
    };

    const readinessLabel =
        selected == null ? null
        : !selected.is_active ? "Inactive"
        : !selected.revenue_category_id ? "Accounting assignment needed"
        : "Ready to use";

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-alloy-midnight/55 max-w-xl">
                    Fees, optional services, and other chargeable offerings outside recurring Tuition Plans.
                </p>
                <ConfigurationPrimaryButton
                    className="gap-1"
                    onClick={() => setDialog("create")}
                    data-testid="catalog-new-item"
                >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New Catalog Item
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="catalog-configuration-shell">
                {loading ?
                    <ConfigurationEmptyState testId="catalog-loading" title="Loading Catalog" description="Fetching catalog items." />
                :   <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                        <aside className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block">
                            <header className="locations-collection-rail__header">
                                <h2 className="locations-collection-rail__title">Catalog</h2>
                                <p className="locations-collection-rail__count">{visible.length} items</p>
                            </header>
                            <div className="programs-collection-controls">
                                <div className="programs-collection-controls__search-wrap">
                                    <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search catalog…"
                                        className="programs-collection-controls__search"
                                        data-testid="catalog-search"
                                    />
                                </div>
                            </div>
                            <div className="locations-collection-rail__list" role="listbox" aria-label="Catalog items">
                                {visible.map((row) => {
                                    const selectedRow = row.id === selectedId;
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
                                            data-testid={`catalog-item-${row.id}`}
                                        >
                                            {selectedRow ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                            <span className="locations-collection-row__body">
                                                <span className="locations-collection-row__name">{row.name}</span>
                                                <span className="locations-collection-row__place">
                                                    {typeLabel(row.commercial_type)}
                                                </span>
                                                <span className="locations-collection-row__meta text-alloy-midnight/50">
                                                    {formatAmount(row.amount_cents)}
                                                    {" · "}
                                                    {productLocationSummary(row, locationOptions)}
                                                    {!row.is_active ? " · Inactive" : ""}
                                                    {!row.revenue_category_id ? " · Needs GL" : ""}
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
                                                    {selected.name}
                                                </h2>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {typeLabel(selected.commercial_type)}
                                                    {" · "}
                                                    {formatAmount(selected.amount_cents)}
                                                    {" · "}
                                                    {selected.is_active ? "Active" : "Inactive"}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton onClick={() => setDialog("edit")} data-testid="catalog-edit-item">
                                                    Edit Item
                                                </ConfigurationSecondaryButton>
                                                {selected.is_active ?
                                                    <ConfigurationSecondaryButton
                                                        disabled={busy}
                                                        onClick={() => void setActive(false)}
                                                        data-testid="catalog-deactivate"
                                                    >
                                                        Deactivate
                                                    </ConfigurationSecondaryButton>
                                                :   <ConfigurationSecondaryButton
                                                        disabled={busy}
                                                        onClick={() => void setActive(true)}
                                                        data-testid="catalog-activate"
                                                    >
                                                        Activate
                                                    </ConfigurationSecondaryButton>
                                                }
                                            </div>
                                        </div>
                                        <div className="mt-4 flex gap-1 border-b border-alloy-stone/20" role="tablist">
                                            {(
                                                [
                                                    { key: "overview", label: "Overview" },
                                                    { key: "pricing", label: "Pricing" },
                                                    { key: "locations", label: "Locations" },
                                                    { key: "history", label: "History" },
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
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    {tab === "overview" ?
                                        <section className="process-config-setup-card p-5" data-testid="catalog-item-snapshot">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <h3 className="text-base font-semibold text-alloy-midnight">{selected.name}</h3>
                                                    <p className="mt-1 text-sm text-alloy-midnight/55">
                                                        {typeLabel(selected.commercial_type)}
                                                        {" · "}
                                                        {selected.cadence_key
                                                            ? cadenceLabel(selected.cadence_key, cadences)
                                                            : "One-time"}
                                                        {" · "}
                                                        {locationSummary}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 rounded-full bg-alloy-stone/25 px-2.5 py-0.5 text-[11px] font-semibold text-alloy-midnight/60">
                                                    {readinessLabel}
                                                </span>
                                            </div>
                                            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Category</dt>
                                                    <dd className="mt-0.5">{categoryLabel}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Current price</dt>
                                                    <dd className="mt-0.5">{formatAmount(selected.amount_cents)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Revenue GL</dt>
                                                    <dd className="mt-0.5">
                                                        {revenueCategory?.mapped_gl_account_id ?
                                                            <Link
                                                                href={organizationFinancialsChapterHref("accounting", {
                                                                    accountId: revenueCategory.mapped_gl_account_id,
                                                                })}
                                                                className="text-alloy-bend-pine hover:underline"
                                                            >
                                                                {revenueLabel}
                                                            </Link>
                                                        :   revenueLabel}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Program</dt>
                                                    <dd className="mt-0.5">{programLabel}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] font-medium text-alloy-midnight/40">Locations</dt>
                                                    <dd className="mt-0.5">
                                                        {locationSummary}
                                                        {locationPriceOverrideCount > 0 ?
                                                            ` · ${locationPriceOverrideCount} location price override${locationPriceOverrideCount === 1 ? "" : "s"}`
                                                        :   ""}
                                                    </dd>
                                                </div>
                                            </dl>
                                            {!selected.revenue_category_id ?
                                                <p className="mt-4 text-sm">
                                                    <Link
                                                        href={organizationFinancialsChapterHref("accounting")}
                                                        className="text-alloy-bend-pine hover:underline"
                                                    >
                                                        Set up GL Codes →
                                                    </Link>
                                                </p>
                                            :   null}
                                        </section>
                                    : tab === "pricing" ?
                                        <section className="process-config-setup-card p-5">
                                            <p className="text-lg font-semibold text-alloy-midnight">
                                                {formatAmount(selected.amount_cents)}
                                            </p>
                                            {selected.cadence_key ?
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {cadenceLabel(selected.cadence_key, cadences)}
                                                </p>
                                            :   <p className="mt-1 text-sm text-alloy-midnight/55">One-time</p>}
                                            {selected.commercial_type === "deposit" && depositBehavior(selected) ?
                                                <p className="mt-3 text-sm text-alloy-midnight/65">
                                                    Due: {depositBehavior(selected)?.due_timing ?? "At enrollment"}
                                                </p>
                                            :   null}
                                            {selected.commercial_type === "addon" && getPackage(selected) ?
                                                <p className="mt-3 text-sm text-alloy-midnight/65">Package pricing configured</p>
                                            :   null}
                                            {locationPriceOverrideCount > 0 ?
                                                <p className="mt-3 text-sm text-alloy-midnight/65">
                                                    {locationPriceOverrideCount} location price override
                                                    {locationPriceOverrideCount === 1 ? "" : "s"} — manage in the Locations tab.
                                                </p>
                                            :   null}
                                        </section>
                                    : tab === "locations" ?
                                        <CatalogLocationsPanel
                                            product={selected}
                                            locations={locations}
                                            onUpdated={(product) => onProductUpdated?.(product)}
                                        />
                                    :   <section className="process-config-setup-card p-5">
                                            <p className="text-sm text-alloy-midnight/55">
                                                {selected.effective_start || selected.effective_end
                                                    ? `${selected.effective_start ?? "Open"} – ${selected.effective_end ?? "Present"}`
                                                    : "No effective-date history recorded."}
                                            </p>
                                        </section>
                                    }
                                </div>
                            :   <ConfigurationEmptyState
                                    testId="catalog-no-selection"
                                    title="Select a catalog item"
                                    description="Fees, add-ons, and deposits appear here once configured. Tuition Plans stay under Tuition."
                                />
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {dialog ?
                <CatalogItemDialog
                    mode={dialog}
                    product={dialog === "edit" ? selected : null}
                    locations={locations}
                    categories={categories}
                    programs={programs}
                    cadences={cadences}
                    onCategoryCreated={onCategoryCreated}
                    onClose={() => setDialog(null)}
                    onSaved={(product) => {
                        if (dialog === "create") {
                            onProductCreated?.(product);
                            setSelectedId(product.id);
                        } else {
                            onProductUpdated?.(product);
                        }
                        setDialog(null);
                    }}
                />
            :   null}
        </div>
    );
}

/** Locations tab: table of locations offered for this item, with price source and manage actions. */
function CatalogLocationsPanel({
    product,
    locations,
    onUpdated,
}: {
    product: CommercialProduct;
    locations: CatalogLocation[];
    onUpdated: (product: CommercialProduct) => void;
}) {
    const [busyLocationId, setBusyLocationId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const applicability = productLocationApplicability(product);
    const prices = readLocationPrices(product.metadata);
    const rows =
        applicability.mode === "all" ?
            locations
        :   locations.filter((row) => applicability.locationIds.includes(row.id));

    const patchMetadata = async (nextPrices: Record<string, LocationPriceOverride>) => {
        const metadata = writeLocationPricesMetadata(product.metadata, nextPrices);
        const res = await fetch(`/api/admin/commercial/products/${product.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ metadata }),
        });
        const json = (await res.json()) as { product?: CommercialProduct; error?: string };
        if (!res.ok || !json.product) throw new Error(json.error || "Could not update location price.");
        onUpdated(json.product);
    };

    const overridePrice = async (locationId: string, locationName: string) => {
        const raw = window.prompt(`Set price for ${locationName} (dollars)`);
        if (raw == null) return;
        const cents = parseAmountToCents(raw);
        if (cents == null) {
            setError("Enter a valid non-negative amount.");
            return;
        }
        setBusyLocationId(locationId);
        setError(null);
        try {
            const nextPrices = {
                ...prices,
                [locationId]: { amount_cents: cents, effective_start: prices[locationId]?.effective_start ?? null },
            };
            await patchMetadata(nextPrices);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not set location price.");
        } finally {
            setBusyLocationId(null);
        }
    };

    const returnToOrganization = async (locationId: string) => {
        setBusyLocationId(locationId);
        setError(null);
        try {
            const nextPrices = { ...prices };
            delete nextPrices[locationId];
            await patchMetadata(nextPrices);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not return to organization price.");
        } finally {
            setBusyLocationId(null);
        }
    };

    return (
        <section className="process-config-setup-card p-5" data-testid="catalog-locations-panel">
            <p className="text-sm text-alloy-midnight/55">
                {applicability.mode === "all" ?
                    "Offered at all active locations. Set a location price to override the organization price."
                :   "Offered at the selected locations below."}
            </p>
            {error ?
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}
            <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm" data-testid="catalog-locations-table">
                    <thead>
                        <tr className="border-b border-alloy-stone/20 text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                            <th className="py-2 pr-3">Location</th>
                            <th className="py-2 pr-3">Offered</th>
                            <th className="py-2 pr-3">Current Price</th>
                            <th className="py-2 pr-3">Price Source</th>
                            <th className="py-2 pr-3">Manage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ?
                            <tr>
                                <td className="py-3 text-sm text-alloy-midnight/55" colSpan={5}>
                                    No locations are configured for this item yet.
                                </td>
                            </tr>
                        :   rows.map((row) => {
                                const resolved = resolveLocationPriceCents({
                                    organizationAmountCents: product.amount_cents,
                                    locationId: row.id,
                                    locationPrices: prices,
                                });
                                const sourceLabel = resolved.source === "organization" ? "Organization" : row.name;
                                const rowBusy = busyLocationId === row.id;
                                return (
                                    <tr key={row.id} className="border-b border-alloy-stone/10">
                                        <td className="py-2 pr-3 text-alloy-midnight">{row.name}</td>
                                        <td className="py-2 pr-3 text-alloy-midnight/70">Yes</td>
                                        <td className="py-2 pr-3 text-alloy-midnight/70">{formatAmount(resolved.amountCents)}</td>
                                        <td className="py-2 pr-3 text-alloy-midnight/70">{sourceLabel}</td>
                                        <td className="py-2 pr-3">
                                            <div className="flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton
                                                    disabled={rowBusy}
                                                    onClick={() => void overridePrice(row.id, row.name)}
                                                    data-testid={`catalog-location-override-${row.id}`}
                                                >
                                                    Override Price
                                                </ConfigurationSecondaryButton>
                                                {resolved.source === "location" ?
                                                    <ConfigurationSecondaryButton
                                                        disabled={rowBusy}
                                                        onClick={() => void returnToOrganization(row.id)}
                                                        data-testid={`catalog-location-return-${row.id}`}
                                                    >
                                                        Return to Organization
                                                    </ConfigurationSecondaryButton>
                                                :   null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/** Progressive New / Edit Catalog Item dialog: Define → Availability → Pricing → Accounting → Review. */
function CatalogItemDialog({
    mode,
    product,
    locations,
    categories,
    programs,
    cadences,
    onCategoryCreated,
    onClose,
    onSaved,
}: {
    mode: "create" | "edit";
    product: CommercialProduct | null;
    locations: CatalogLocation[];
    categories: CommercialCategory[];
    programs: { key: string; label: string }[];
    cadences: BillingCadence[];
    onCategoryCreated?: (category: CommercialCategory) => void;
    onClose: () => void;
    onSaved: (product: CommercialProduct) => void;
}) {
    const initialApplicability = useMemo(
        () =>
            product ?
                locationApplicabilityFromMetadata(product.metadata, SELECTED_LOCATION_IDS_META_KEY, product.location_id)
            :   { mode: "all" as LocationApplicabilityMode, locationIds: [] },
        [product],
    );
    const initialPrices = useMemo(() => (product ? readLocationPrices(product.metadata) : {}), [product]);

    const [step, setStep] = useState(0);
    const [name, setName] = useState(product?.name ?? "");
    const [commercialType, setCommercialType] = useState<CommercialType | "">(product?.commercial_type ?? "");
    const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
    const [progKey, setProgKey] = useState(product?.program_key ?? "");
    const [feeFreq, setFeeFreq] = useState(product?.commercial_type === "fee" ? product.cadence_key ?? "" : "");
    const [addonFreq, setAddonFreq] = useState(
        product?.commercial_type === "addon" ? product.cadence_key ?? "monthly" : "monthly",
    );
    const [feeRequired, setFeeRequired] = useState(product ? feeIsRequired(product) : true);
    const [locationMode, setLocationMode] = useState<LocationApplicabilityMode>(initialApplicability.mode);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(initialApplicability.locationIds);
    const [orgAmount, setOrgAmount] = useState(product ? String(product.amount_cents / 100) : "");
    const [effectiveStart, setEffectiveStart] = useState(product?.effective_start ?? "");
    const [setLocationPricesNow, setSetLocationPricesNow] = useState(Object.keys(initialPrices).length > 0);
    const [locationPriceInputs, setLocationPriceInputs] = useState<Record<string, string>>(() => {
        const out: Record<string, string> = {};
        for (const [locationId, override] of Object.entries(initialPrices)) {
            out[locationId] = (override.amount_cents / 100).toString();
        }
        return out;
    });
    const [revenueCategoryId, setRevenueCategoryId] = useState<string | null>(product?.revenue_category_id ?? null);
    const [busy, setBusy] = useState(false);
    const [creatingCategory, setCreatingCategory] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const locationOptions = useMemo(() => toLocationOptions(locations), [locations]);

    const categoryOptions = useMemo(() => {
        const active = activeCategories(categories);
        if (categoryId && !active.some((row) => row.id === categoryId)) {
            const current = categories.find((row) => row.id === categoryId);
            if (current) return sortCategories([current, ...active]);
        }
        return active;
    }, [categories, categoryId]);

    const activeCadences = useMemo(
        () => cadences.filter((row) => row.metadata?.active !== false && row.metadata?.is_active !== false),
        [cadences],
    );

    const createCategory = async () => {
        const label = window.prompt("New category name");
        if (!label?.trim()) return;
        setCreatingCategory(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/commercial/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ label: label.trim() }),
            });
            const json = (await res.json()) as { category?: CommercialCategory; error?: string };
            if (!res.ok || !json.category) throw new Error(json.error || "Could not create category.");
            onCategoryCreated?.(json.category);
            setCategoryId(json.category.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create category.");
        } finally {
            setCreatingCategory(false);
        }
    };

    const canAdvance = (index: number): boolean => {
        if (index === 0) {
            return (
                name.trim().length > 0 &&
                !!commercialType &&
                (commercialType !== "addon" || addonFreq.trim().length > 0)
            );
        }
        if (index === 1) {
            return locationMode === "all" || selectedLocationIds.length > 0;
        }
        if (index === 2) {
            return parseAmountToCents(orgAmount) != null;
        }
        return true;
    };

    const canSave = canAdvance(0) && canAdvance(1) && canAdvance(2);

    const save = async () => {
        if (!commercialType || !canSave) return;
        const cents = parseAmountToCents(orgAmount);
        if (cents == null) return;
        setBusy(true);
        setError(null);
        try {
            const cadence_key =
                commercialType === "fee" ? feeFreq || null
                : commercialType === "addon" ? addonFreq
                : null;
            const behavior = buildBehavior(commercialType, {
                required: feeRequired,
                isPackage: false,
                packageCount: null,
                packageUnit: "uses",
                packageExpiresDays: null,
                refundable: true,
                applyToBalance: false,
                dueTiming: "At enrollment",
            });

            let metadata = writeLocationIdsMetadata(product?.metadata ?? {}, {
                mode: locationMode,
                locationIds: locationMode === "selected" ? selectedLocationIds : [],
            });
            if (locationMode === "selected" && setLocationPricesNow) {
                const nextPrices: Record<string, LocationPriceOverride> = {};
                for (const locationId of selectedLocationIds) {
                    const overrideCents = parseAmountToCents(locationPriceInputs[locationId] ?? "");
                    if (overrideCents == null) continue;
                    nextPrices[locationId] = { amount_cents: overrideCents, effective_start: effectiveStart || null };
                }
                metadata = writeLocationPricesMetadata(metadata, nextPrices);
            }

            const body = {
                name: name.trim(),
                commercial_type: commercialType,
                category_id: categoryId || null,
                amount_cents: cents,
                cadence_key,
                revenue_category_id: revenueCategoryId || null,
                location_id: null,
                program_key: progKey || null,
                effective_start: effectiveStart || null,
                behavior,
                metadata,
            };

            if (mode === "edit" && product) {
                const res = await fetch(`/api/admin/commercial/products/${product.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(body),
                });
                const json = (await res.json()) as { product?: CommercialProduct; error?: string };
                if (!res.ok || !json.product) throw new Error(json.error || "Could not update catalog item.");
                onSaved(json.product);
            } else {
                const res = await fetch("/api/admin/commercial/products", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(body),
                });
                const json = (await res.json()) as { product?: CommercialProduct; error?: string };
                if (!res.ok || !json.product) throw new Error(json.error || "Could not create catalog item.");
                onSaved(json.product);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    };

    const stepLabel = ITEM_DIALOG_STEPS[step];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-item-dialog-title"
            data-testid={mode === "create" ? "catalog-create-dialog" : "catalog-edit-dialog"}
        >
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="catalog-item-dialog-title" className="text-lg font-semibold text-alloy-midnight">
                        {mode === "create" ? "New Catalog Item" : "Edit Catalog Item"}
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">{stepLabel}</p>
                    <ol className="mt-3 flex gap-2" aria-label="Progress">
                        {ITEM_DIALOG_STEPS.map((label, index) => (
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
                        <div className="grid gap-3">
                            <label>
                                <span className="config-typo-field-label">Name *</span>
                                <input
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="catalog-dialog-name"
                                    autoFocus
                                />
                            </label>
                            {mode === "create" ?
                                <fieldset>
                                    <legend className="config-typo-field-label">Type *</legend>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                        {COMMERCIAL_TYPE_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setCommercialType(opt.key)}
                                                className={`rounded-md border px-3 py-2 text-left text-sm ${
                                                    commercialType === opt.key
                                                        ? "border-alloy-bend-pine bg-alloy-bend-pine/5"
                                                        : "border-alloy-stone/25"
                                                }`}
                                                data-testid={`catalog-dialog-type-${opt.key}`}
                                            >
                                                <span className="font-medium">{opt.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>
                            :   <p className="text-sm text-alloy-midnight/55">Type: {typeLabel(String(commercialType))}</p>}
                            <label>
                                <span className="config-typo-field-label">Category</span>
                                <div className="mt-1 flex gap-2">
                                    <select
                                        value={categoryId}
                                        onChange={(event) => setCategoryId(event.target.value)}
                                        className="config-runtime-select flex-1"
                                        data-testid="catalog-dialog-category"
                                    >
                                        <option value="">None</option>
                                        {categoryOptions.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ConfigurationSecondaryButton
                                        type="button"
                                        disabled={creatingCategory}
                                        onClick={() => void createCategory()}
                                        data-testid="catalog-dialog-category-new"
                                    >
                                        New
                                    </ConfigurationSecondaryButton>
                                </div>
                            </label>
                            <label>
                                <span className="config-typo-field-label">Program</span>
                                <select
                                    value={progKey}
                                    onChange={(event) => setProgKey(event.target.value)}
                                    className="config-runtime-select mt-1"
                                    data-testid="catalog-dialog-program"
                                >
                                    <option value="">All programs</option>
                                    {programs.map((p) => (
                                        <option key={p.key} value={p.key}>
                                            {p.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {commercialType === "fee" ?
                                <>
                                    <label>
                                        <span className="config-typo-field-label">Billing frequency</span>
                                        <select
                                            value={feeFreq}
                                            onChange={(event) => setFeeFreq(event.target.value)}
                                            className="config-runtime-select mt-1"
                                        >
                                            <option value="">One-time</option>
                                            {activeCadences.map((c) => (
                                                <option key={c.item_key} value={c.item_key}>
                                                    {c.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={feeRequired}
                                            onChange={(event) => setFeeRequired(event.target.checked)}
                                        />
                                        Required fee
                                    </label>
                                </>
                            :   null}
                            {commercialType === "addon" ?
                                <label>
                                    <span className="config-typo-field-label">Billing frequency *</span>
                                    <select
                                        value={addonFreq}
                                        onChange={(event) => setAddonFreq(event.target.value)}
                                        className="config-runtime-select mt-1"
                                    >
                                        {activeCadences.map((c) => (
                                            <option key={c.item_key} value={c.item_key}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            :   null}
                        </div>
                    : step === 1 ?
                        <LocationMultiSelect
                            locations={locationOptions}
                            mode={locationMode}
                            selectedIds={selectedLocationIds}
                            onModeChange={setLocationMode}
                            onSelectedIdsChange={setSelectedLocationIds}
                            testId="catalog-dialog-locations"
                            legend="Availability"
                        />
                    : step === 2 ?
                        <div className="space-y-3">
                            <label>
                                <span className="config-typo-field-label">Organization price *</span>
                                <input
                                    value={orgAmount}
                                    onChange={(event) => setOrgAmount(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    inputMode="decimal"
                                    placeholder="$0"
                                    data-testid="catalog-dialog-amount"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Effective start</span>
                                <input
                                    type="date"
                                    value={effectiveStart}
                                    onChange={(event) => setEffectiveStart(event.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="catalog-dialog-effective-start"
                                />
                            </label>
                            {locationMode === "selected" && selectedLocationIds.length > 0 ?
                                <div className="rounded-lg border border-alloy-stone/25 bg-white p-3">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={setLocationPricesNow}
                                            onChange={(event) => setSetLocationPricesNow(event.target.checked)}
                                            data-testid="catalog-dialog-set-location-prices"
                                        />
                                        Set location prices now
                                    </label>
                                    {setLocationPricesNow ?
                                        <div className="mt-3 space-y-2">
                                            {selectedLocationIds.map((locationId) => {
                                                const location = locations.find((row) => row.id === locationId);
                                                return (
                                                    <label key={locationId} className="block">
                                                        <span className="config-typo-field-label">
                                                            {location?.name ?? locationId}
                                                        </span>
                                                        <input
                                                            value={locationPriceInputs[locationId] ?? ""}
                                                            onChange={(event) =>
                                                                setLocationPriceInputs((prev) => ({
                                                                    ...prev,
                                                                    [locationId]: event.target.value,
                                                                }))
                                                            }
                                                            className="config-runtime-input mt-1"
                                                            inputMode="decimal"
                                                            placeholder="Follow organization price"
                                                            data-testid={`catalog-dialog-location-price-${locationId}`}
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    :   null}
                                </div>
                            :   null}
                        </div>
                    : step === 3 ?
                        <GlCodeSelect value={revenueCategoryId} onChange={setRevenueCategoryId} testId="catalog-dialog-gl-code" />
                    :   <div className="space-y-3 text-sm text-alloy-midnight/75">
                            <p>
                                <span className="font-semibold text-alloy-midnight">Name:</span> {name.trim()}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Type:</span>{" "}
                                {typeLabel(String(commercialType))}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Category:</span>{" "}
                                {categories.find((c) => c.id === categoryId)?.label ?? "None"}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Program:</span>{" "}
                                {programs.find((p) => p.key === progKey)?.label ?? "All programs"}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Availability:</span>{" "}
                                {summarizeLocationApplicability(locationMode, selectedLocationIds, locationOptions)}
                            </p>
                            <p>
                                <span className="font-semibold text-alloy-midnight">Organization price:</span>{" "}
                                {formatAmount(parseAmountToCents(orgAmount) ?? 0)}
                            </p>
                        </div>
                    }
                </div>

                <div className="flex justify-between gap-2 border-t border-alloy-stone/20 px-5 py-4">
                    <ConfigurationSecondaryButton disabled={busy} onClick={onClose}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <div className="flex gap-2">
                        {step > 0 ?
                            <ConfigurationSecondaryButton disabled={busy} onClick={() => setStep((current) => current - 1)}>
                                Back
                            </ConfigurationSecondaryButton>
                        :   null}
                        {step < ITEM_DIALOG_STEPS.length - 1 ?
                            <ConfigurationPrimaryButton
                                disabled={busy || !canAdvance(step)}
                                onClick={() => setStep((current) => current + 1)}
                                data-testid="catalog-dialog-next"
                            >
                                Next
                            </ConfigurationPrimaryButton>
                        :   <ConfigurationPrimaryButton
                                disabled={busy || !canSave}
                                onClick={() => void save()}
                                data-testid="catalog-dialog-save"
                            >
                                {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
                            </ConfigurationPrimaryButton>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
