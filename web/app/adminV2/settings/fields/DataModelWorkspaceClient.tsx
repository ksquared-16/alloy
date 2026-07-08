"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataModelCategoriesTab from "@/components/admin/fields/DataModelCategoriesTab";
import DataModelEntityHeader from "@/components/admin/fields/DataModelEntityHeader";
import DataModelFieldsTab from "@/components/admin/fields/DataModelFieldsTab";
import type { FieldOwnershipFilter } from "@/components/admin/fields/FieldOwnershipFilterTabs";
import DataModelOverviewTab from "@/components/admin/fields/DataModelOverviewTab";
import DataModelRelationshipsTab from "@/components/admin/fields/DataModelRelationshipsTab";
import DataModelWorkspaceTabs, { type DataModelWorkspaceTab } from "@/components/admin/fields/DataModelWorkspaceTabs";
import FieldEntityNav, { FIELD_SETTINGS_NAV_ENTITIES } from "@/components/admin/fields/FieldEntityNav";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import { isChildcareFieldsHubVisibleEntity } from "@/lib/fields/childcareFieldCatalogDoctrine";
import {
    buildSettingsFieldCatalogEntries,
    hubEntityApiTypes,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";
import { dataModelStatsForEntity } from "@/lib/fields/dataModelWorkspaceModel";
import { SETTINGS_ENTITY_FIELD_EXPLANATIONS } from "@/lib/fields/computedFieldCatalog";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";

export type FieldEntityKey = SettingsHubEntityKey;

const ALLOWED_ENTITY_KEYS = new Set<string>(FIELD_SETTINGS_NAV_ENTITIES);

function normalizeEntity(raw: string | undefined): FieldEntityKey {
    const t = (raw ?? "").trim().toLowerCase();
    if (t === "job") return "opportunity";
    if (!isChildcareFieldsHubVisibleEntity(t) || !ALLOWED_ENTITY_KEYS.has(t)) return "person";
    return t as FieldEntityKey;
}

function normalizeTab(raw: string | undefined): DataModelWorkspaceTab {
    const t = (raw ?? "").trim().toLowerCase();
    if (t === "computed_signals") return "fields";
    if (t === "relationships" || t === "categories" || t === "fields" || t === "overview") {
        return t;
    }
    return "overview";
}

function normalizeOwnershipFilter(raw: string | undefined): FieldOwnershipFilter {
    const t = (raw ?? "").trim().toLowerCase();
    if (t === "platform" || t === "custom" || t === "computed" || t === "all") return t;
    return "all";
}

function settingsFieldsBasePath(_pathname: string): string {
    return "/settings/fields";
}

function toFieldDef(r: Record<string, unknown>): FieldDef {
    return {
        id: String(r.id),
        org_id: String(r.org_id),
        entity_type: String(r.entity_type),
        field_key: String(r.field_key),
        field_type: String(r.field_type),
        label: r.label != null ? String(r.label) : null,
        description: r.description != null ? String(r.description) : null,
        is_system: Boolean(r.is_system),
        is_required: Boolean(r.is_required),
        is_active: r.is_active !== false,
        is_visible_in_form: r.is_visible_in_form !== false,
        is_visible_in_drawer: r.is_visible_in_drawer !== false,
        is_visible_in_table: r.is_visible_in_table !== false,
        is_visible_in_public_booking: Boolean(r.is_visible_in_public_booking),
        is_filterable: Boolean(r.is_filterable),
        is_sortable: Boolean(r.is_sortable),
        section_key: r.section_key != null ? String(r.section_key) : null,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
        placeholder: r.placeholder != null ? String(r.placeholder) : null,
        help_text: r.help_text != null ? String(r.help_text) : null,
        config: r.config != null && typeof r.config === "object" ? (r.config as Record<string, unknown>) : null,
        requirement_policy: r.requirement_policy ?? null,
        interaction_policy: r.interaction_policy ?? null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    };
}

export default function DataModelWorkspaceClient({
    initialEntity,
    initialTab,
}: {
    initialEntity?: string;
    initialTab?: string;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { labels } = useEntityLabels();
    const entity = useMemo(
        () => normalizeEntity(initialEntity ?? searchParams.get("entity") ?? undefined),
        [initialEntity, searchParams],
    );
    const tab = useMemo(
        () => normalizeTab(initialTab ?? searchParams.get("tab") ?? undefined),
        [initialTab, searchParams],
    );
    const ownershipFromUrl = useMemo(() => {
        const tabRaw = (initialTab ?? searchParams.get("tab") ?? "").trim().toLowerCase();
        if (tabRaw === "computed_signals") return "computed" as FieldOwnershipFilter;
        return normalizeOwnershipFilter(searchParams.get("ownership") ?? undefined);
    }, [initialTab, searchParams]);
    const [totalFieldsByEntity, setTotalFieldsByEntity] = useState<Partial<Record<FieldEntityKey, number>>>({});
    const [catalogEntries, setCatalogEntries] = useState<SettingsFieldCatalogEntry[]>([]);
    const [createFieldSignal, setCreateFieldSignal] = useState(0);
    const [createCategorySignal, setCreateCategorySignal] = useState(0);
    const [creatingRelationship, setCreatingRelationship] = useState(false);
    const [focusFieldRefKey, setFocusFieldRefKey] = useState<string | null>(null);
    const [fieldsOwnershipFilter, setFieldsOwnershipFilter] = useState<FieldOwnershipFilter>(ownershipFromUrl);

    const entityLabel = useMemo(() => adminFieldEntitySingularLabel(labels, entity), [labels, entity]);
    const primaryEntityType = entity === "inquiry_child" ? "customer_member" : entity;

    const replaceWorkspaceUrl = useCallback(
        (nextEntity: FieldEntityKey, nextTab: DataModelWorkspaceTab, ownership?: FieldOwnershipFilter) => {
            const params = new URLSearchParams();
            params.set("entity", nextEntity);
            params.set("tab", nextTab);
            if (ownership && ownership !== "all" && nextTab === "fields") {
                params.set("ownership", ownership);
            }
            router.replace(`${settingsFieldsBasePath(pathname)}?${params.toString()}`);
        },
        [router, pathname],
    );

    useEffect(() => {
        setFocusFieldRefKey(null);
        setCreatingRelationship(false);
    }, [entity, tab]);

    useEffect(() => {
        setFieldsOwnershipFilter(ownershipFromUrl);
    }, [ownershipFromUrl, entity]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const counts: Partial<Record<FieldEntityKey, number>> = {};
            const allCustom: FieldDef[] = [];
            for (const hubEntity of FIELD_SETTINGS_NAV_ENTITIES) {
                let totalCustom = 0;
                for (const et of hubEntityApiTypes(hubEntity)) {
                    try {
                        const res = await fetch(`/api/admin/field-definitions?entity_type=${encodeURIComponent(et)}`);
                        const json = await res.json().catch(() => ({}));
                        const rows = ((json as { field_definitions?: Record<string, unknown>[] }).field_definitions ?? []).map(
                            toFieldDef,
                        );
                        totalCustom += rows.filter((r) => r.is_active !== false).length;
                        if (hubEntity === entity) allCustom.push(...rows);
                    } catch {
                        /* ignore */
                    }
                }
                counts[hubEntity] = totalCustom;
            }
            if (!cancelled) {
                setTotalFieldsByEntity(counts);
                setCatalogEntries(
                    buildSettingsFieldCatalogEntries({
                        hubEntity: entity,
                        entityTypes: hubEntityApiTypes(entity),
                        customFields: allCustom.filter((r) => r.is_active !== false),
                    }),
                );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [entity]);

    const stats = useMemo(() => dataModelStatsForEntity(entity, catalogEntries), [entity, catalogEntries]);

    const onEntityChange = useCallback(
        (next: FieldEntityKey) => replaceWorkspaceUrl(next, tab, tab === "fields" ? fieldsOwnershipFilter : undefined),
        [replaceWorkspaceUrl, tab, fieldsOwnershipFilter],
    );

    const onTabChange = useCallback(
        (next: DataModelWorkspaceTab, ownership?: FieldOwnershipFilter) => {
            const nextOwnership = ownership ?? (next === "fields" ? fieldsOwnershipFilter : "all");
            if (next !== "fields") setFieldsOwnershipFilter("all");
            else if (ownership) setFieldsOwnershipFilter(ownership);
            replaceWorkspaceUrl(entity, next, nextOwnership);
        },
        [replaceWorkspaceUrl, entity, fieldsOwnershipFilter],
    );

    const triggerAddCategory = () => {
        setCreateCategorySignal((n) => n + 1);
        onTabChange("categories");
    };

    const triggerAddField = () => {
        setCreateFieldSignal((n) => n + 1);
        setFocusFieldRefKey(null);
        setFieldsOwnershipFilter("all");
        onTabChange("fields", "all");
    };

    const triggerAddRelationship = () => {
        setCreatingRelationship(true);
        onTabChange("relationships");
    };

    const openFieldInline = (entry: SettingsFieldCatalogEntry) => {
        setFocusFieldRefKey(entry.refKey);
        const ownership = entry.ownership === "computed" ? "computed" : "all";
        setFieldsOwnershipFilter(ownership);
        onTabChange("fields", ownership);
    };

    const viewComputedFields = () => {
        setFocusFieldRefKey(null);
        setFieldsOwnershipFilter("computed");
        onTabChange("fields", "computed");
    };

    return (
        <div className="w-full min-w-0" data-testid="data-model-workspace">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
                <FieldEntityNav
                    activeEntity={entity}
                    onSelect={onEntityChange}
                    totalFieldsByEntity={totalFieldsByEntity}
                />

                <div className="min-w-0 flex-1 space-y-2.5">
                    <DataModelEntityHeader
                        hubEntity={entity}
                        entityLabel={entityLabel}
                        stats={stats}
                        explanation={SETTINGS_ENTITY_FIELD_EXPLANATIONS[entity]}
                        onViewUsage={() => onTabChange("overview")}
                        onAddField={triggerAddField}
                        onAddRelationship={triggerAddRelationship}
                    />

                    <DataModelWorkspaceTabs activeTab={tab} onSelect={(next) => onTabChange(next)} />

                    {tab === "overview" ? (
                        <DataModelOverviewTab
                            hubEntity={entity}
                            entries={catalogEntries}
                            onViewAllFields={() => onTabChange("fields", "all")}
                            onViewAllRelationships={() => onTabChange("relationships")}
                            onViewAllCategories={() => onTabChange("categories")}
                            onViewComputedFields={viewComputedFields}
                            onAddField={triggerAddField}
                            onAddRelationship={triggerAddRelationship}
                            onSelectField={openFieldInline}
                        />
                    ) : null}

                    {tab === "categories" ? (
                        <DataModelCategoriesTab
                            key={`${entity}-categories`}
                            hubEntity={entity}
                            primaryEntityType={primaryEntityType}
                            createSignal={createCategorySignal}
                        />
                    ) : null}

                    {tab === "relationships" ? (
                        <DataModelRelationshipsTab
                            hubEntity={entity}
                            creating={creatingRelationship}
                            onCreatingChange={setCreatingRelationship}
                        />
                    ) : null}

                    {tab === "fields" ? (
                        <DataModelFieldsTab
                            key={`${entity}-fields`}
                            hubEntity={entity}
                            primaryEntityType={primaryEntityType}
                            createSignal={createFieldSignal}
                            focusRefKey={focusFieldRefKey}
                            initialOwnershipFilter={fieldsOwnershipFilter}
                            onOwnershipFilterChange={(next) => {
                                setFieldsOwnershipFilter(next);
                                replaceWorkspaceUrl(entity, "fields", next);
                            }}
                            onCatalogChange={setCatalogEntries}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}
