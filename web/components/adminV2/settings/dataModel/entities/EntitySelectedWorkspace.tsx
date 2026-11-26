"use client";

import { ConfigDetailRuntime, ConfigObjectHeader } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { EntityFieldsTab } from "@/components/adminV2/settings/dataModel/entities/EntityFieldsTab";
import { EntityHistoryTab } from "@/components/adminV2/settings/dataModel/entities/EntityHistoryTab";
import { EntityOverviewTab } from "@/components/adminV2/settings/dataModel/entities/EntityOverviewTab";
import { EntityRelationshipsTab } from "@/components/adminV2/settings/dataModel/entities/EntityRelationshipsTab";
import { EntityStatusTab } from "@/components/adminV2/settings/dataModel/entities/EntityStatusTab";
import { EntityVocabularyTab } from "@/components/adminV2/settings/dataModel/entities/EntityVocabularyTab";
import {
    ENTITY_WORKSPACE_TABS,
    type EntityWorkspaceTabKey,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

type EntityLabelsApiPayload = {
    defaults: { entity_type: string; singular: string | null; plural: string | null }[];
    overrides: { entity_type: string; singular: string | null; plural: string | null }[];
    effective: { entity_type: string; singular: string | null; plural: string | null }[];
};

/**
 * The selected Entity workspace. Every Data Model concern for this record type
 * resolves in one of these tabs — nothing here navigates to a Fields, Statuses,
 * Option Sets, or Relationships destination. Overview is the default tab.
 * Field / relationship / status usage lives on those objects (Surfaces).
 */
export function EntitySelectedWorkspace({
    entity,
    activeTab,
    onTabChange,
    canMutate,
    configLocked,
    onVocabularyPayload,
    onEntityChanged,
    initialFieldRefKey,
    testId = "entity-selected-workspace",
}: {
    entity: EntityWorkspaceVm;
    activeTab: EntityWorkspaceTabKey;
    onTabChange: (tab: EntityWorkspaceTabKey) => void;
    canMutate: boolean;
    configLocked: boolean;
    onVocabularyPayload: (payload: EntityLabelsApiPayload) => void;
    onEntityChanged: (entity: EntityWorkspaceVm) => void;
    initialFieldRefKey?: string;
    testId?: string;
}) {
    const tabs = ENTITY_WORKSPACE_TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
        attentionCount: tab.key === "vocabulary" && entity.vocabulary.isOverridden ? 1 : undefined,
    }));

    return (
        <ConfigDetailRuntime<EntityWorkspaceTabKey>
            testId={testId}
            headerTestId={`${testId}-header`}
            tabAriaLabel="Entity configuration"
            tabTestIdPrefix="entity-tab"
            header={
                <ConfigObjectHeader
                    size="hero"
                    name={entity.displayName}
                    facts={[
                        entity.pluralDisplayName,
                        `${entity.structure.fields.total} fields`,
                        `${entity.structure.relationshipsTotal} relationships`,
                    ]}
                    breadcrumb={
                        <nav
                            className="flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/45"
                            aria-label="Entity ownership"
                            data-testid="entity-breadcrumb"
                        >
                            <span className="font-medium">Data Model</span>
                            <span aria-hidden="true">›</span>
                            <span className="font-semibold text-alloy-midnight/65">{entity.displayName}</span>
                        </nav>
                    }
                    testId={`${testId}-header-object`}
                />
            }
            tabs={tabs}
            activeSection={activeTab}
            onSectionChange={onTabChange}
        >
            {activeTab === "overview" ?
                <EntityOverviewTab entity={entity} onOpenTab={onTabChange} />
            : activeTab === "vocabulary" ?
                <EntityVocabularyTab
                    entity={entity}
                    canMutate={canMutate}
                    configLocked={configLocked}
                    onVocabularyPayload={onVocabularyPayload}
                />
            : activeTab === "fields" ?
                <EntityFieldsTab
                    entity={entity}
                    canMutate={canMutate}
                    configLocked={configLocked}
                    onEntityChanged={onEntityChanged}
                    initialFieldRefKey={initialFieldRefKey}
                />
            : activeTab === "relationships" ?
                <EntityRelationshipsTab
                    entity={entity}
                    canMutate={canMutate}
                    configLocked={configLocked}
                    onEntityChanged={onEntityChanged}
                />
            : activeTab === "status" ?
                <EntityStatusTab
                    entity={entity}
                    canMutate={canMutate}
                    configLocked={configLocked}
                    onEntityChanged={onEntityChanged}
                />
            : activeTab === "history" ?
                <EntityHistoryTab entity={entity} />
            :   null}
        </ConfigDetailRuntime>
    );
}
