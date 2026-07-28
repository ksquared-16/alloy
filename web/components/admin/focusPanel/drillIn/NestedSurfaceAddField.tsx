"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";
import {
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    identityConfigurationFieldKeys,
    namespacesForNestedGroupPicker,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityFieldTier } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { configurationPurposeFromTierArg } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { identityPickerCategoriesForNamespaces, IDENTITY_PICKER_SHOW_ALL_KEY } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { householdAuthoringGroupKey } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";

type Props = {
    surfaceId: string;
    groupKey: string;
    tier?: IdentityFieldTier;
    className?: string;
};

/** Canonical + Add field control for the green NestedSurfaceFieldLayoutSurface composer. */
export default function NestedSurfaceAddField({ surfaceId, groupKey, tier, className = "" }: Props) {
    const composer = useFocusPanelComposer();
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const [addOpen, setAddOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>(IDENTITY_PICKER_SHOW_ALL_KEY);
    const [search, setSearch] = useState("");
    const triggerRef = useRef<HTMLButtonElement>(null);

    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);

    const available = useMemo(
        () =>
            config && composing
                ? availableFieldsForNestedGroup(surfaceId, groupKey, config, tenantFieldDefinitions, { tier })
                : [],
        [config, composing, surfaceId, groupKey, tenantFieldDefinitions, tier],
    );

    const placedKeys = useMemo(() => {
        if (!config) return new Set<string>();
        const purpose = configurationPurposeFromTierArg(tier ?? "summary");
        return new Set(identityConfigurationFieldKeys(config, groupKey, purpose));
    }, [config, groupKey, tier]);

    const categories = useMemo(() => {
        const namespaces = namespacesForNestedGroupPicker(surfaceId, groupKey);
        if (namespaces.length === 0) return [];
        return identityPickerCategoriesForNamespaces({
            namespaces,
            tenantFieldDefinitions,
            excludeKeys: placedKeys,
            includeShowAll: true,
        });
    }, [surfaceId, groupKey, tenantFieldDefinitions, placedKeys]);

    /** Search spans all applicable fields regardless of the active category tab. */
    const searchFilteredCategories = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return categories;
        return categories
            .filter((category) => category.key !== IDENTITY_PICKER_SHOW_ALL_KEY)
            .map((category) => ({
                ...category,
                fields: category.fields.filter(
                    (field) =>
                        field.label.toLowerCase().includes(q)
                        || field.key.toLowerCase().includes(q),
                ),
            }))
            .filter((category) => category.fields.length > 0);
    }, [categories, search]);

    const activeFields = useMemo(() => {
        const pool = search.trim() ? searchFilteredCategories : categories;
        if (pool.length === 0) return [];
        if (search.trim()) {
            // Searching: flatten matches while preserving category order from Show-all grouping.
            return pool.flatMap((category) => category.fields);
        }
        const key = activeCategory || IDENTITY_PICKER_SHOW_ALL_KEY;
        return pool.find((c) => c.key === key)?.fields ?? pool[0]?.fields ?? [];
    }, [categories, searchFilteredCategories, activeCategory, search]);

    const categoryTabs = search.trim() ? [] : categories;

    const mutate = useCallback(
        (next: NestedSurfaceConfig) => composer?.updateConfig(surfaceId, next),
        [composer, surfaceId],
    );

    if (!composing || !composer || !config) return null;

    // Ensure region selection matches authoring group so subsequent controls stay in sync.
    const ensureRegionSelected = () => {
        const selection = composer.selection;
        const already =
            selection?.kind === "region"
            && selection.surfaceId === surfaceId
            && (selection.groupKey === groupKey
                || (surfaceId === HOUSEHOLD_SURFACE_ID
                    && householdAuthoringGroupKey(selection.groupKey) === householdAuthoringGroupKey(groupKey)));
        if (!already) {
            composer.select({ kind: "region", surfaceId, groupKey });
        }
    };

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
                    ensureRegionSelected();
                    setAddOpen((v) => !v);
                }}
            >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add field
            </button>
            {available.length === 0 && addOpen ? (
                <p className="mt-2 text-[11px] text-alloy-midnight/50" data-add-field-empty="true">
                    No more fields available for this section.
                </p>
            ) : null}
            <ComposerFloatingPopover
                open={addOpen && available.length > 0}
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
                        {categoryTabs.map((category) => (
                            <button
                                key={category.key}
                                type="button"
                                className={
                                    (activeCategory || IDENTITY_PICKER_SHOW_ALL_KEY) === category.key
                                        ? "fp-inline-field-library__category is-active"
                                        : "fp-inline-field-library__category"
                                }
                                onClick={() => setActiveCategory(category.key)}
                                data-field-category={category.key}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                    <div className="fp-inline-field-library__items" data-field-category-active={activeCategory}>
                        {activeCategory === IDENTITY_PICKER_SHOW_ALL_KEY && !search.trim()
                            ? categories
                                  .filter((c) => c.key !== IDENTITY_PICKER_SHOW_ALL_KEY)
                                  .map((category) => (
                                      <div key={category.key} data-field-category-group={category.key}>
                                          <div className="fp-inline-field-library__group-label px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                              {category.label}
                                          </div>
                                          {category.fields.map((f) => (
                                              <button
                                                  key={f.key}
                                                  type="button"
                                                  className="fp-inline-field-library__item"
                                                  data-add-field-option={f.key}
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
                                  ))
                            : activeFields.map((f) => (
                                  <button
                                      key={f.key}
                                      type="button"
                                      className="fp-inline-field-library__item"
                                      data-add-field-option={f.key}
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
