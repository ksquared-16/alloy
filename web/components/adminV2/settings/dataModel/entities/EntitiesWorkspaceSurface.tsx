"use client";

/**
 * Data Model → Entity product surface.
 *
 * The Entity collection rail is the Data Model selector (there is no category
 * rail above it), and the selected Entity owns every Data Model concern for that
 * record type. Mutation paths (`/api/admin/entity-labels`,
 * `/api/admin/field-definitions`, `/api/admin/field-sections`,
 * `/api/admin/status-definitions`, `/api/admin/option-sets`, and the relationship
 * role-type APIs) are unchanged — the Entity workspace rehosts them in place.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigurationShell } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { EntitiesCollectionRail } from "@/components/adminV2/settings/dataModel/entities/EntitiesCollectionRail";
import { EntitySelectedWorkspace } from "@/components/adminV2/settings/dataModel/entities/EntitySelectedWorkspace";
import { dataModelEntityHref } from "@/lib/dataModel/dataModelChapterRoutes";
import {
    parseEntitySelection,
    parseEntityWorkspaceTab,
    rebuildEntitiesWorkspaceVocabulary,
    withEntityReplaced,
    type DataModelEntitiesWorkspaceVm,
    type EntityWorkspaceTabKey,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type EntityLabelsApiPayload = {
    defaults: { entity_type: string; singular: string | null; plural: string | null }[];
    overrides: { entity_type: string; singular: string | null; plural: string | null }[];
    effective: { entity_type: string; singular: string | null; plural: string | null }[];
};

export function EntitiesWorkspaceSurface({
    initialVm,
    initialConfigLocked,
    initialHubKey,
    initialTab,
    initialField,
}: {
    initialVm: DataModelEntitiesWorkspaceVm;
    initialConfigLocked: boolean;
    initialHubKey?: string;
    initialTab?: string;
    initialField?: string;
}) {
    const router = useRouter();
    const { canMutate } = useAdminAuth();
    const [vm, setVm] = useState(initialVm);
    const [selectedHubKey, setSelectedHubKey] = useState<SettingsHubEntityKey>(() =>
        parseEntitySelection(initialHubKey, initialVm),
    );
    const [activeTab, setActiveTab] = useState<EntityWorkspaceTabKey>(() => parseEntityWorkspaceTab(initialTab));

    useEffect(() => {
        setSelectedHubKey(parseEntitySelection(initialHubKey, vm));
        setActiveTab(parseEntityWorkspaceTab(initialTab));
        // Route params are the selection authority — local state mirrors them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialHubKey, initialTab]);

    const selectEntity = (hubKey: SettingsHubEntityKey) => {
        setSelectedHubKey(hubKey);
        setActiveTab("overview");
        router.push(dataModelEntityHref(hubKey), { scroll: false });
    };

    const changeTab = (tab: EntityWorkspaceTabKey) => {
        setActiveTab(tab);
        router.replace(dataModelEntityHref(selectedHubKey, { tab }), { scroll: false });
    };

    const onVocabularyPayload = (payload: EntityLabelsApiPayload) => {
        setVm((current) => rebuildEntitiesWorkspaceVocabulary(current, payload));
    };

    const onEntityChanged = (entity: EntityWorkspaceVm) => {
        setVm((current) => withEntityReplaced(current, entity));
    };

    const selectedEntity = vm.entitiesByHubKey[selectedHubKey] ?? Object.values(vm.entitiesByHubKey)[0];

    return (
        <ConfigurationShell
            testId="data-model-configuration-shell"
            queueColumn={
                <EntitiesCollectionRail
                    rows={vm.collection.rows}
                    selectedHubKey={selectedHubKey}
                    onSelect={selectEntity}
                />
            }
        >
            <div className="min-w-0 space-y-2.5" data-testid="entities-workspace-surface">
                <div className="xl:hidden">
                    <label className="config-typo-field-label" htmlFor="entities-mobile-selector">
                        Entity
                    </label>
                    <select
                        id="entities-mobile-selector"
                        className="config-runtime-select mt-1"
                        value={selectedHubKey}
                        onChange={(event) => selectEntity(event.target.value as SettingsHubEntityKey)}
                    >
                        {vm.collection.rows.map((row) => (
                            <option key={row.hubKey} value={row.hubKey}>
                                {row.displayName}
                            </option>
                        ))}
                    </select>
                </div>

                {selectedEntity ?
                    <EntitySelectedWorkspace
                        entity={selectedEntity}
                        activeTab={activeTab}
                        onTabChange={changeTab}
                        canMutate={canMutate}
                        configLocked={initialConfigLocked}
                        onVocabularyPayload={onVocabularyPayload}
                        onEntityChanged={onEntityChanged}
                        initialFieldRefKey={initialField}
                    />
                :   null}
            </div>
        </ConfigurationShell>
    );
}
