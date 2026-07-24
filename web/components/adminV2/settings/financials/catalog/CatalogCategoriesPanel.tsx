"use client";

import { useMemo, useState } from "react";
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
import type { CommercialCategory, CommercialProduct } from "@/lib/commercial/commercialProducts";

function categoryDescription(row: CommercialCategory): string {
    const raw = row.metadata?.description;
    return typeof raw === "string" ? raw : "";
}

export function CatalogCategoriesPanel({
    categories,
    products,
    onChanged,
}: {
    categories: CommercialCategory[];
    products: CommercialProduct[];
    onChanged: (next: CommercialCategory[]) => void;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
    const [label, setLabel] = useState("");
    const [description, setDescription] = useState("");
    const [sortOrder, setSortOrder] = useState("100");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const usageById = useMemo(() => {
        const map = new Map<string, number>();
        for (const product of products) {
            if (!product.category_id) continue;
            map.set(product.category_id, (map.get(product.category_id) ?? 0) + 1);
        }
        return map;
    }, [products]);

    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        return [...categories]
            .filter((row) => {
                if (!query) return true;
                return `${row.label} ${categoryDescription(row)}`.toLowerCase().includes(query);
            })
            .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    }, [categories, search]);

    const selected = categories.find((row) => row.id === selectedId) ?? null;
    const usedBy = selected ? products.filter((row) => row.category_id === selected.id) : [];

    const openCreate = () => {
        setLabel("");
        setDescription("");
        setSortOrder("100");
        setDialog("create");
        setError(null);
    };

    const openEdit = () => {
        if (!selected) return;
        setLabel(selected.label);
        setDescription(categoryDescription(selected));
        setSortOrder(String(selected.sort_order));
        setDialog("edit");
        setError(null);
    };

    const save = async () => {
        if (!label.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const metadata = { description: description.trim() || undefined };
            if (dialog === "create") {
                const res = await fetch("/api/admin/commercial/categories", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        label: label.trim(),
                        sort_order: Number(sortOrder) || 100,
                        metadata,
                    }),
                });
                const json = (await res.json()) as { category?: CommercialCategory; error?: string };
                if (!res.ok || !json.category) throw new Error(json.error || "Could not create category.");
                onChanged([...categories, json.category]);
                setSelectedId(json.category.id);
            } else if (dialog === "edit" && selected) {
                const res = await fetch(`/api/admin/commercial/categories/${selected.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        label: label.trim(),
                        sort_order: Number(sortOrder) || 100,
                        metadata: { ...selected.metadata, description: description.trim() || undefined },
                    }),
                });
                const json = (await res.json()) as { category?: CommercialCategory; error?: string };
                if (!res.ok || !json.category) throw new Error(json.error || "Could not update category.");
                onChanged(categories.map((row) => (row.id === selected.id ? json.category! : row)));
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
            const res = await fetch(`/api/admin/commercial/categories/${selected.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ is_active: isActive }),
            });
            const json = (await res.json()) as { category?: CommercialCategory; error?: string };
            if (!res.ok || !json.category) throw new Error(json.error || "Could not update status.");
            onChanged(categories.map((row) => (row.id === selected.id ? json.category! : row)));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Status update failed.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!selected) return;
        const usage = usageById.get(selected.id) ?? 0;
        if (usage > 0) {
            setError("This category is in use. Deactivate it instead of deleting.");
            return;
        }
        if (!window.confirm("Delete this category? This cannot be undone.")) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/commercial/categories/${selected.id}`, {
                method: "DELETE",
                credentials: "include",
            });
            const json = (await res.json()) as { archived?: boolean; deleted?: boolean; error?: string };
            if (!res.ok) throw new Error(json.error || "Could not delete category.");
            if (json.archived) {
                await setActive(false);
            } else {
                onChanged(categories.filter((row) => row.id !== selected.id));
                setSelectedId(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-testid="catalog-categories-panel">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <ConfigurationPrimaryButton className="gap-1" onClick={openCreate} data-testid="catalog-category-new">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New Category
                </ConfigurationPrimaryButton>
            </div>
            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}
            <ConfigurationShell testId="catalog-categories-shell">
                <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                    <aside className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block">
                        <header className="locations-collection-rail__header">
                            <h2 className="locations-collection-rail__title">Categories</h2>
                            <p className="locations-collection-rail__count">{visible.length} categories</p>
                        </header>
                        <div className="programs-collection-controls">
                            <div className="programs-collection-controls__search-wrap">
                                <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                                <input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search categories…"
                                    className="programs-collection-controls__search"
                                    data-testid="catalog-categories-search"
                                />
                            </div>
                        </div>
                        <div className="locations-collection-rail__list" role="listbox" aria-label="Catalog categories">
                            {visible.map((row) => {
                                const selectedRow = row.id === selectedId;
                                const usage = usageById.get(row.id) ?? 0;
                                return (
                                    <button
                                        key={row.id}
                                        type="button"
                                        role="option"
                                        aria-selected={selectedRow}
                                        className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row ${
                                            selectedRow ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                        }`}
                                        onClick={() => setSelectedId(row.id)}
                                        data-testid={`catalog-category-${row.id}`}
                                    >
                                        {selectedRow ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                        <span className="locations-collection-row__body">
                                            <span className="locations-collection-row__name">{row.label}</span>
                                            <span className="locations-collection-row__meta text-alloy-midnight/50">
                                                {row.is_active ? "Active" : "Inactive"}
                                                {usage > 0 ? ` · Used by ${usage}` : ""}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                    <main className="min-w-0">
                        {selected ?
                            <section className="process-config-setup-card space-y-4 p-5" data-testid="catalog-category-detail">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                            {selected.label}
                                        </h2>
                                        <p className="mt-1 text-sm text-alloy-midnight/55">
                                            {selected.is_active ? "Active" : "Inactive"}
                                            {" · "}
                                            Sort {selected.sort_order}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <ConfigurationSecondaryButton onClick={openEdit} data-testid="catalog-category-edit">
                                            Edit
                                        </ConfigurationSecondaryButton>
                                        {selected.is_active ?
                                            <ConfigurationSecondaryButton
                                                disabled={busy}
                                                onClick={() => void setActive(false)}
                                                data-testid="catalog-category-deactivate"
                                            >
                                                Deactivate
                                            </ConfigurationSecondaryButton>
                                        :   <ConfigurationSecondaryButton
                                                disabled={busy}
                                                onClick={() => void setActive(true)}
                                                data-testid="catalog-category-reactivate"
                                            >
                                                Reactivate
                                            </ConfigurationSecondaryButton>
                                        }
                                        <ConfigurationSecondaryButton disabled={busy} onClick={() => void remove()}>
                                            Delete
                                        </ConfigurationSecondaryButton>
                                    </div>
                                </div>
                                <p className="text-sm text-alloy-midnight/70">
                                    {categoryDescription(selected) || "No description."}
                                </p>
                                <div>
                                    <h3 className="text-sm font-semibold text-alloy-midnight">Used By</h3>
                                    {usedBy.length === 0 ?
                                        <p className="mt-2 text-sm text-alloy-midnight/55">No Catalog Items use this category yet.</p>
                                    :   <ul className="mt-2 space-y-1 text-sm">
                                            {usedBy.map((item) => (
                                                <li key={item.id} className="text-alloy-midnight/75">
                                                    {item.name}
                                                </li>
                                            ))}
                                        </ul>
                                    }
                                </div>
                            </section>
                        :   <ConfigurationEmptyState
                                testId="catalog-categories-no-selection"
                                title="Select a category"
                                description="Organize Catalog Items with reusable categories."
                            />
                        }
                    </main>
                </div>
            </ConfigurationShell>

            {dialog ?
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <h2 className="text-lg font-semibold text-alloy-midnight">
                            {dialog === "create" ? "New Category" : "Edit Category"}
                        </h2>
                        <div className="mt-4 space-y-3">
                            <label>
                                <span className="config-typo-field-label">Name *</span>
                                <input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    className="config-runtime-input mt-1"
                                    data-testid="catalog-category-dialog-name"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Description</span>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="config-runtime-input mt-1 min-h-[4.5rem]"
                                    data-testid="catalog-category-dialog-description"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Sort order</span>
                                <input
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder(e.target.value)}
                                    className="config-runtime-input mt-1"
                                    inputMode="numeric"
                                />
                            </label>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton disabled={busy} onClick={() => setDialog(null)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={busy || !label.trim()}
                                onClick={() => void save()}
                                data-testid="catalog-category-dialog-save"
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
