"use client";

import {
    ConfigOverviewRuntime,
    ConfigGlanceMetrics,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { EntityWorkspaceVm, EntityWorkspaceTabKey } from "@/lib/dataModel/dataModelWorkspaceVm";

/**
 * Entity → Overview. Read-only meaningful cards — Snapshot, Vocabulary summary,
 * Structure counts, Used Across, Status domain. Counts come straight from
 * `entity.structure` (the unified resolver) — never re-derived. Every drill-in
 * opens another tab on this entity; nothing leaves the Entity workspace, and the
 * organization's industry is not surfaced here.
 */
export function EntityOverviewTab({
    entity,
    onOpenTab,
    testId = "entity-overview-tab",
}: {
    entity: EntityWorkspaceVm;
    onOpenTab: (tab: EntityWorkspaceTabKey) => void;
    testId?: string;
}) {
    const { fields } = entity.structure;

    return (
        <div data-testid={testId}>
            <ConfigOverviewRuntime
                testId={`${testId}-runtime`}
                glance={
                    <ConfigWorkspaceCard title="Snapshot" compact testId="entity-overview-snapshot">
                        <p className="text-[12px] leading-5 text-alloy-midnight/65">{entity.description}</p>
                        <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                                <dt className="text-alloy-midnight/40">Singular</dt>
                                <dd className="font-semibold text-alloy-midnight">{entity.displayName}</dd>
                            </div>
                            <div>
                                <dt className="text-alloy-midnight/40">Plural</dt>
                                <dd className="font-semibold text-alloy-midnight">{entity.pluralDisplayName}</dd>
                            </div>
                        </dl>
                        <p className="mt-2.5 text-[11px] leading-4 text-alloy-midnight/45">{entity.surfacesLine}</p>
                    </ConfigWorkspaceCard>
                }
                readiness={
                    <ConfigWorkspaceCard title="Structure" compact testId="entity-overview-structure">
                        <ConfigGlanceMetrics
                            bare
                            layout="grid"
                            testId="entity-overview-structure-metrics"
                            metrics={[
                                {
                                    key: "fields-total",
                                    label: "Fields",
                                    value: String(fields.total),
                                    hint: `${fields.platform} platform · ${fields.custom} organization · ${fields.computed} computed${
                                        fields.inactive > 0 ? ` · ${fields.inactive} inactive` : ""
                                    }`,
                                    onSelect: () => onOpenTab("fields"),
                                },
                                {
                                    key: "relationships-total",
                                    label: "Relationships",
                                    value: String(entity.structure.relationshipsTotal),
                                    hint: "Connections to other entities",
                                    onSelect: () => onOpenTab("relationships"),
                                },
                            ]}
                        />
                    </ConfigWorkspaceCard>
                }
                attention={
                    <ConfigWorkspaceCard title="Vocabulary" compact testId="entity-overview-vocabulary">
                        <p className="text-[12px] text-alloy-midnight">
                            {entity.vocabulary.singular} / {entity.vocabulary.plural}
                        </p>
                        <p className="mt-1 text-[11px] text-alloy-midnight/45">
                            Alloy default: {entity.vocabulary.defaultSingular} / {entity.vocabulary.defaultPlural}
                        </p>
                        {entity.vocabulary.isOverridden ?
                            <span
                                className="mt-1.5 inline-flex rounded-full border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-[#007d68]"
                                data-testid="entity-overview-vocabulary-custom-badge"
                            >
                                Customized
                            </span>
                        :   null}
                        <button
                            type="button"
                            onClick={() => onOpenTab("vocabulary")}
                            className="mt-2 block text-[11px] font-medium text-alloy-bend-pine hover:underline"
                            data-testid="entity-overview-edit-vocabulary"
                        >
                            Edit vocabulary
                        </button>
                    </ConfigWorkspaceCard>
                }
                capabilities={
                    <ConfigWorkspaceCard title="Used across Alloy" compact testId="entity-overview-used-across">
                        <ul className="flex flex-wrap gap-1.5" data-testid="entity-overview-usage-surfaces">
                            {entity.usageSurfaces.map((surface) => (
                                <li
                                    key={surface.id}
                                    className="rounded border border-alloy-forge/10 bg-alloy-stone/[0.15] px-1.5 py-0.5 text-[10px] text-alloy-midnight/70"
                                >
                                    {surface.label}
                                    {surface.hint ? <span className="text-alloy-midnight/35"> · {surface.hint}</span> : null}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-2.5 border-t border-alloy-stone/20 pt-2">
                            <button
                                type="button"
                                onClick={() => onOpenTab("status")}
                                className="text-[11px] font-medium text-alloy-bend-pine hover:underline"
                                data-testid="entity-overview-open-status"
                            >
                                {entity.statusDomain ? `${entity.statusDomain.label} →` : "Status domain →"}
                            </button>
                        </div>
                    </ConfigWorkspaceCard>
                }
            />
        </div>
    );
}
