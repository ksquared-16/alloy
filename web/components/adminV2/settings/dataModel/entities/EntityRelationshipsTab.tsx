"use client";

/**
 * Entity → Relationships. Collection → selected relationship, in place.
 *
 * Relationships are Alloy platform edges (not per-entity mutable rows), so the
 * detail is read-only truth from `entityRelationshipCatalog` — there is no fake
 * edit affordance, and nothing here navigates to a Relationships destination.
 */

import { useState } from "react";
import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import {
    ENTITY_CHILD_DETAIL_TABS,
    type EntityChildDetailTabKey,
    type EntityRelationshipSummaryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

function RelationshipDetail({
    relationship,
    entityName,
    testId,
}: {
    relationship: EntityRelationshipSummaryVm;
    entityName: string;
    testId: string;
}) {
    const [activeTab, setActiveTab] = useState<EntityChildDetailTabKey>("overview");

    return (
        <div data-testid={testId} data-relationship-id={relationship.id}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                    {entityName} relationship
                </p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">{relationship.label}</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    {relationship.connectionLabel} · → {relationship.targetLabel}
                </p>
            </header>

            <ConfigWorkspaceTabBar<EntityChildDetailTabKey>
                tabs={ENTITY_CHILD_DETAIL_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Relationship details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="pt-3" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "overview" ?
                    <ConfigWorkspaceCard title="What this connection means" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/70">{relationship.meaning}</p>
                        {relationship.roleNote ?
                            <p className="mt-2 text-[11px] leading-4 text-alloy-midnight/50">
                                {relationship.roleNote}
                            </p>
                        :   null}
                    </ConfigWorkspaceCard>
                : activeTab === "definition" ?
                    <ConfigWorkspaceCard title="Definition" compact>
                        <dl className="grid grid-cols-2 gap-2.5 text-[12px]">
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Target</dt>
                                <dd className="mt-0.5 text-alloy-midnight">{relationship.targetLabel}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                    Cardinality
                                </dt>
                                <dd className="mt-0.5 text-alloy-midnight">{relationship.cardinality}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Required</dt>
                                <dd className="mt-0.5 text-alloy-midnight">{relationship.required ? "Yes" : "No"}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Owner</dt>
                                <dd className="mt-0.5 text-alloy-midnight">
                                    {relationship.kind === "platform" ? "Platform" : "Organization"}
                                </dd>
                            </div>
                        </dl>
                        {relationship.kind === "platform" ?
                            <p
                                className="mt-3 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50"
                                data-testid={`${testId}-protected`}
                            >
                                Platform edge — cardinality and storage are owned by Alloy and are not
                                operator-configurable.
                            </p>
                        :   null}
                    </ConfigWorkspaceCard>
                : activeTab === "usage" ?
                    <ConfigWorkspaceCard title="Where this connection is used" compact>
                        <ul className="flex flex-wrap gap-1.5" data-testid={`${testId}-usage-list`}>
                            {relationship.whereUsed.map((surface) => (
                                <li
                                    key={surface}
                                    className="rounded border border-alloy-forge/10 bg-alloy-stone/[0.15] px-1.5 py-0.5 text-[10px] text-alloy-midnight/70"
                                >
                                    {surface}
                                </li>
                            ))}
                        </ul>
                    </ConfigWorkspaceCard>
                :   <ConfigWorkspaceCard title="History" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/55">
                            Relationship definitions ship with the platform, so there is no organization change
                            history to show.
                        </p>
                    </ConfigWorkspaceCard>
                }
            </div>
        </div>
    );
}

export function EntityRelationshipsTab({
    entity,
    testId = "entity-relationships-tab",
}: {
    entity: EntityWorkspaceVm;
    testId?: string;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(entity.relationships[0]?.id ?? null);
    const selected = entity.relationships.find((rel) => rel.id === selectedId) ?? entity.relationships[0] ?? null;

    return (
        <ConfigChildObjectMasterDetail
            testId={testId}
            listTitle="Relationships"
            listSummary={`${entity.relationships.length} connection${entity.relationships.length === 1 ? "" : "s"} to other entities`}
            list={
                entity.relationships.length > 0 ?
                    <ul className="space-y-0.5" data-testid={`${testId}-list`}>
                        {entity.relationships.map((rel) => {
                            const active = rel.id === selected?.id;
                            return (
                                <li key={rel.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(rel.id)}
                                        aria-current={active ? "true" : undefined}
                                        className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                                            active ?
                                                "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine"
                                            :   "text-alloy-midnight hover:bg-alloy-stone/20"
                                        }`}
                                        data-testid={`${testId}-item-${rel.id}`}
                                    >
                                        <span
                                            className={`block truncate text-[12px] ${active ? "font-semibold" : ""}`}
                                        >
                                            {rel.label}
                                        </span>
                                        <span className="block text-[10px] text-alloy-midnight/45">
                                            {rel.cardinality}
                                            {rel.required ? " · required" : ""}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                :   <p className="px-2 py-4 text-center text-[11px] text-alloy-midnight/45">
                        No relationships are defined for {entity.displayName}.
                    </p>
            }
            detail={
                selected ?
                    <RelationshipDetail
                        relationship={selected}
                        entityName={entity.displayName}
                        testId={`${testId}-detail`}
                    />
                :   <p className="text-[12px] text-alloy-midnight/45">
                        {entity.displayName} has no connections to other entities.
                    </p>
            }
        />
    );
}
