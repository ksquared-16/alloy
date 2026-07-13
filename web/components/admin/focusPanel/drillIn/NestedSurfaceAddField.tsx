"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";
import {
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    groupDefsFor,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityFieldTier } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { identityPickerCategoriesForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";

type Props = {
    surfaceId: string;
    groupKey: string;
    tier?: IdentityFieldTier;
    className?: string;
};

export default function NestedSurfaceAddField({ surfaceId, groupKey, tier, className = "" }: Props) {
    const composer = useFocusPanelComposer();
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const [addOpen, setAddOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const triggerRef = useRef<HTMLButtonElement>(null);

    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);
    const regionSelected =
        composer?.selection?.kind === "region" &&
        composer.selection.surfaceId === surfaceId &&
        composer.selection.groupKey === groupKey;

    const available = useMemo(
        () =>
            config && composing
                ? availableFieldsForNestedGroup(surfaceId, groupKey, config, tenantFieldDefinitions, { tier })
                : [],
        [config, composing, surfaceId, groupKey, tenantFieldDefinitions, tier],
    );

    const categories = useMemo(() => {
        const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
        if (!def) return [];
        const namespaces = def.acceptedNamespaces as readonly AvailableFieldEntityNamespace[];
        const exclude = new Set(available.map((f) => f.key));
        const all = identityPickerCategoriesForNamespaces({
            namespaces,
            tenantFieldDefinitions,
            excludeKeys: exclude,
        });
        const q = search.trim().toLowerCase();
        if (!q) return all;
        return all
            .map((category) => ({
                ...category,
                fields: category.fields.filter(
                    (field) =>
                        field.label.toLowerCase().includes(q)
                        || field.key.toLowerCase().includes(q),
                ),
            }))
            .filter((category) => category.fields.length > 0);
    }, [surfaceId, groupKey, tenantFieldDefinitions, available, search]);

    const activeFields = useMemo(() => {
        if (categories.length === 0) return [];
        const key = activeCategory ?? categories[0]?.key ?? null;
        return categories.find((c) => c.key === key)?.fields ?? [];
    }, [categories, activeCategory]);

    const mutate = useCallback(
        (next: NestedSurfaceConfig) => composer?.updateConfig(surfaceId, next),
        [composer, surfaceId],
    );

    if (!composing || !composer || !config || !regionSelected) return null;
    if (available.length === 0) return null;

    return (
        <div className={["fp-region-add-field", className].filter(Boolean).join(" ")} data-region-add-field={groupKey}>
            <button
                ref={triggerRef}
                type="button"
                className="fp-inline-field-list__add"
                data-canvas-add-field={groupKey}
                aria-expanded={addOpen}
                onClick={(e) => {
                    e.stopPropagation();
                    setAddOpen((v) => !v);
                }}
            >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add field
            </button>
            <ComposerFloatingPopover
                open={addOpen}
                anchorRef={triggerRef}
                onClose={() => {
                    setAddOpen(false);
                    setSearch("");
                }}
                className="fp-inline-field-library fp-inline-field-library--categorized"
            >
                <div data-drill-in-field-library={groupKey} className="fp-inline-field-library__shell">
                    <input
                        type="search"
                        className="fp-inline-field-library__search"
                        placeholder="Search fields…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search available fields"
                    />
                    <div className="fp-inline-field-library__categories">
                        {categories.map((category) => (
                            <button
                                key={category.key}
                                type="button"
                                className={
                                    (activeCategory ?? categories[0]?.key) === category.key
                                        ? "fp-inline-field-library__category is-active"
                                        : "fp-inline-field-library__category"
                                }
                                onClick={() => setActiveCategory(category.key)}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                    <div className="fp-inline-field-library__items">
                        {activeFields.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                className="fp-inline-field-library__item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    mutate(addFieldToNestedGroup(config, groupKey, f.key, { tier }));
                                    setAddOpen(false);
                                    setSearch("");
                                }}
                            >
                                <span className="fp-inline-field-library__label">{f.label}</span>
                                {!f.isSystemField ? (
                                    <span className="fp-inline-field-library__meta">Custom field</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            </ComposerFloatingPopover>
        </div>
    );
}
