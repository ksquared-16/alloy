"use client";

import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { staticCatalogCountsForHubEntity, hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";
import {
    configurationPrimaryHubEntities,
    resolveConfigurationEntitySingularLabel,
} from "@/lib/adminV2/configuration/configurationEntityCatalog";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import {
    DATA_MODEL_ENTITY_ICONS,
    DATA_MODEL_ICON_STROKE,
} from "@/lib/fields/dataModelWorkspaceIcons";
import { Settings2 } from "lucide-react";

export type FieldEntityNavCounts = {
    totalFields: number;
};

type Props = {
    activeEntity: SettingsHubEntityKey;
    onSelect: (entity: SettingsHubEntityKey) => void;
    totalFieldsByEntity?: Partial<Record<SettingsHubEntityKey, number>>;
};

const NAV_ENTITIES = configurationPrimaryHubEntities().map((e) => e.hubKey);

export default function FieldEntityNav({ activeEntity, onSelect, totalFieldsByEntity = {} }: Props) {
    const { labels } = useEntityLabels();

    return (
        <nav
            className="configuration-section-queue w-full shrink-0 lg:w-[168px] xl:w-[180px]"
            aria-label="Data model entities"
            data-testid="field-entity-nav"
        >
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                All Entities
            </p>
            <div className="space-y-0.5">
                {NAV_ENTITIES.map((entity) => {
                    const staticCounts = staticCatalogCountsForHubEntity(entity);
                    const custom = totalFieldsByEntity[entity] ?? 0;
                    const totalFields = staticCounts.platform + staticCounts.computed + custom;
                    const active = activeEntity === entity;
                    const label = resolveConfigurationEntitySingularLabel(labels, entity);
                    const Icon = DATA_MODEL_ENTITY_ICONS[entity];
                    return (
                        <button
                            key={entity}
                            type="button"
                            onClick={() => onSelect(entity)}
                            className={[
                                "process-config-nav-item flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                                active
                                    ? "process-config-nav-item--active border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.08] text-alloy-midnight shadow-[inset_3px_0_0_#00a283]"
                                    : "border-transparent text-alloy-midnight/75 hover:bg-alloy-stone/[0.35]",
                            ].join(" ")}
                            data-testid={`field-entity-nav-${entity}`}
                            data-active={active ? "true" : "false"}
                        >
                            <Icon
                                size={15}
                                strokeWidth={DATA_MODEL_ICON_STROKE}
                                className={active ? "mt-0.5 shrink-0 text-alloy-bend-pine" : "mt-0.5 shrink-0 text-alloy-forge/55"}
                                aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                                <span
                                    className={[
                                        "block text-sm leading-snug",
                                        active ? "font-semibold text-alloy-midnight" : "font-medium",
                                    ].join(" ")}
                                >
                                    {label}
                                </span>
                                <span
                                    className="mt-0.5 block text-[10px] text-alloy-midnight/45"
                                    data-count-fields={totalFields}
                                >
                                    {totalFields} fields
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <a
                href={adminSettingsSubpathHref("entities")}
                className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/45 transition-colors hover:bg-alloy-stone/[0.35] hover:text-alloy-midnight/70"
                data-testid="field-entity-nav-manage"
            >
                <Settings2 size={13} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                Manage Entities
            </a>
        </nav>
    );
}

export { NAV_ENTITIES as FIELD_SETTINGS_NAV_ENTITIES, hubEntityApiTypes };
