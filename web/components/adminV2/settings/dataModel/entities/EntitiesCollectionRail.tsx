"use client";

import { ConfigurationQueueItem } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { DATA_MODEL_ENTITY_ICONS, DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import type { EntityCollectionRowVm } from "@/lib/dataModel/dataModelWorkspaceVm";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

/** Entities Collection rail — record types Alloy uses across the platform. */
export function EntitiesCollectionRail({
    rows,
    selectedHubKey,
    onSelect,
    testId = "entities-collection-rail",
}: {
    rows: readonly EntityCollectionRowVm[];
    selectedHubKey: string;
    onSelect: (hubKey: SettingsHubEntityKey) => void;
    testId?: string;
}) {
    return (
        <nav className="configuration-section-queue" aria-label="Entities" data-testid={testId}>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                Entities
            </p>
            <div className="space-y-1" role="listbox">
                {rows.map((row) => {
                    const active = row.hubKey === selectedHubKey;
                    const Icon = DATA_MODEL_ENTITY_ICONS[row.hubKey];
                    return (
                        <ConfigurationQueueItem
                            key={row.hubKey}
                            variant="rail"
                            active={active}
                            listboxOption
                            title={row.displayName}
                            subtitle={`${row.fieldsTotal} field${row.fieldsTotal === 1 ? "" : "s"} · ${row.relationshipsTotal} relationship${row.relationshipsTotal === 1 ? "" : "s"}`}
                            leading={
                                <span
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                                        active ?
                                            "bg-alloy-bend-pine/[0.14] text-alloy-bend-pine"
                                        :   "bg-alloy-midnight/[0.04] text-alloy-bend-pine"
                                    }`}
                                >
                                    <Icon size={15} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                                </span>
                            }
                            trailing={
                                row.isVocabularyOverridden ?
                                    <span
                                        className="rounded-full border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-[#007d68]"
                                        title="Vocabulary customized for this organization"
                                    >
                                        Custom
                                    </span>
                                :   null
                            }
                            onClick={() => onSelect(row.hubKey)}
                            testId={`entities-collection-row-${row.hubKey}`}
                        />
                    );
                })}
            </div>
        </nav>
    );
}
