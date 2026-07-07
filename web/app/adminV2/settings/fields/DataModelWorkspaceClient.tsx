"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import EntityFieldsClient from "@/components/admin/EntityFieldsClient";
import DataModelComputedSignalsTab from "@/components/admin/fields/DataModelComputedSignalsTab";
import DataModelEntityHeader from "@/components/admin/fields/DataModelEntityHeader";
import DataModelOverviewTab from "@/components/admin/fields/DataModelOverviewTab";
import DataModelRelationshipsTab from "@/components/admin/fields/DataModelRelationshipsTab";
import DataModelWorkspaceTabs, { type DataModelWorkspaceTab } from "@/components/admin/fields/DataModelWorkspaceTabs";
import FieldDetailDrawer from "@/components/admin/fields/FieldDetailDrawer";
import FieldEntityNav, { FIELD_SETTINGS_NAV_ENTITIES } from "@/components/admin/fields/FieldEntityNav";
import type { FieldOwnershipFilter } from "@/components/admin/fields/FieldOwnershipFilterTabs";
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

const MANAGE_OPTION_SETS_HREF = "/settings/option-sets";

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
    if (t === "relationships" || t === "fields" || t === "computed_signals" || t === "overview") {
        return t;
    }
    return "overview";
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
    const entity = useMemo(() => normalizeEntity(initialEntity ?? searchParams.get("entity") ?? undefined), [initialEntity, searchParams]);
    const tab = useMemo(() => normalizeTab(initialTab ?? searchParams.get("tab") ?? undefined), [initialTab, searchParams]);
    const [ownershipFilter, setOwnershipFilter] = useState<FieldOwnershipFilter>("all");
    const [selectedEntry, setSelectedEntry] = useState<SettingsFieldCatalogEntry | null>(null);
    const [totalFieldsByEntity, setTotalFieldsByEntity] = useState<Partial<Record<FieldEntityKey, number>>>({});
    const [catalogEntries, setCatalogEntries] = useState<SettingsFieldCatalogEntry[]>([]);
    const [createFieldSignal, setCreateFieldSignal] = useState(0);
    const [relationshipModalOpen, setRelationshipModalOpen] = useState(false);

    const entityLabel = useMemo(() => adminFieldEntitySingularLabel(labels, entity), [labels, entity]);
    const primaryEntityType = entity === "inquiry_child" ? "customer_member" : entity;

    const replaceWorkspaceUrl = useCallback(
        (nextEntity: FieldEntityKey, nextTab: DataModelWorkspaceTab) => {
            router.replace(`${settingsFieldsBasePath(pathname)}?entity=${encodeURIComponent(nextEntity)}&tab=${encodeURIComponent(nextTab)}`);
        },
        [router, pathname],
    );

    useEffect(() => {
        setSelectedEntry(null);
        setOwnershipFilter("all");
    }, [entity, tab]);

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
        (next: FieldEntityKey) => replaceWorkspaceUrl(next, tab),
        [replaceWorkspaceUrl, tab],
    );

    const onTabChange = useCallback(
        (next: DataModelWorkspaceTab) => replaceWorkspaceUrl(entity, next),
        [replaceWorkspaceUrl, entity],
    );

    const triggerAddField = () => {
        setCreateFieldSignal((n) => n + 1);
        onTabChange("fields");
    };

    return (
        <div className="w-full min-w-0" data-testid="data-model-workspace">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <FieldEntityNav
                    activeEntity={entity}
                    onSelect={onEntityChange}
                    totalFieldsByEntity={totalFieldsByEntity}
                />

                <div className="min-w-0 flex-1 space-y-4">
                    <DataModelEntityHeader
                        hubEntity={entity}
                        entityLabel={entityLabel}
                        stats={stats}
                        explanation={SETTINGS_ENTITY_FIELD_EXPLANATIONS[entity]}
                        onViewUsage={() => onTabChange("overview")}
                        onAddField={triggerAddField}
                        onAddRelationship={() => {
                            setRelationshipModalOpen(true);
                            onTabChange("relationships");
                        }}
                    />

                    <DataModelWorkspaceTabs activeTab={tab} onSelect={onTabChange} />

                    {tab === "overview" ? (
                        <DataModelOverviewTab
                            hubEntity={entity}
                            entries={catalogEntries}
                            onViewAllFields={() => onTabChange("fields")}
                            onViewAllRelationships={() => onTabChange("relationships")}
                            onViewAllComputed={() => onTabChange("computed_signals")}
                            onAddField={triggerAddField}
                            onAddRelationship={() => {
                                setRelationshipModalOpen(true);
                                onTabChange("relationships");
                            }}
                            onSelectField={setSelectedEntry}
                        />
                    ) : null}

                    {tab === "relationships" ? (
                        <>
                            <DataModelRelationshipsTab
                                hubEntity={entity}
                                onAddRelationship={() => setRelationshipModalOpen(true)}
                            />
                            {relationshipModalOpen ? (
                                <div
                                    className="rounded-lg border border-alloy-pine/20 bg-alloy-pine/[0.04] px-3 py-2 text-xs text-alloy-midnight/70"
                                    data-testid="add-relationship-modal-placeholder"
                                >
                                    Relationship authoring opens from the Relationships settings vocabulary. Platform
                                    relationship types are configured under Settings → Relationships.
                                </div>
                            ) : null}
                        </>
                    ) : null}

                    {tab === "fields" ? (
                        <EntityFieldsClient
                            key={`${entity}-fields`}
                            entityType={primaryEntityType}
                            hubEntity={entity}
                            title={`${entityLabel} Fields`}
                            manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                            adminV2Chrome
                            hideSettingsHeader
                            workspaceCatalogMode
                            ownershipFilter={ownershipFilter}
                            onOwnershipFilterChange={setOwnershipFilter}
                            selectedRefKey={selectedEntry?.refKey ?? null}
                            onSelectCatalogEntry={setSelectedEntry}
                            sectionGroupTitle={entityLabel}
                            createFieldSignal={createFieldSignal}
                        />
                    ) : null}

                    {tab === "computed_signals" ? (
                        <DataModelComputedSignalsTab
                            hubEntity={entity}
                            entries={catalogEntries}
                            selectedRefKey={selectedEntry?.refKey ?? null}
                            onSelectEntry={setSelectedEntry}
                        />
                    ) : null}
                </div>
            </div>

            <FieldDetailDrawer
                entry={selectedEntry}
                hubEntity={entity}
                onClose={() => setSelectedEntry(null)}
                onConfigure={
                    selectedEntry?.fieldDef
                        ? () => {
                              onTabChange("fields");
                          }
                        : undefined
                }
            />
        </div>
    );
}
