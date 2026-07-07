"use client";

import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { staticCatalogCountsForHubEntity, hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

export type FieldEntityNavCounts = {
    totalFields: number;
};

type Props = {
    activeEntity: SettingsHubEntityKey;
    onSelect: (entity: SettingsHubEntityKey) => void;
    totalFieldsByEntity?: Partial<Record<SettingsHubEntityKey, number>>;
};

const NAV_ENTITIES = CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES as readonly SettingsHubEntityKey[];

const ENTITY_ICONS: Record<SettingsHubEntityKey, string> = {
    inquiry_child: "👶",
    person: "👤",
    customer: "🏠",
    opportunity: "📋",
    location: "📍",
};

export default function FieldEntityNav({ activeEntity, onSelect, totalFieldsByEntity = {} }: Props) {
    const { labels } = useEntityLabels();

    return (
        <nav
            className="w-full shrink-0 space-y-1 lg:w-[168px] xl:w-[180px]"
            aria-label="Data model entities"
            data-testid="field-entity-nav"
        >
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                All Entities
            </p>
            {NAV_ENTITIES.map((entity) => {
                const staticCounts = staticCatalogCountsForHubEntity(entity);
                const custom = totalFieldsByEntity[entity] ?? 0;
                const totalFields = staticCounts.platform + staticCounts.computed + custom;
                const active = activeEntity === entity;
                const label = adminFieldEntitySingularLabel(labels, entity);
                const displayLabel = entity === "opportunity" ? "Lead / Enrollment" : label;
                return (
                    <button
                        key={entity}
                        type="button"
                        onClick={() => onSelect(entity)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            active
                                ? "border-alloy-pine/30 bg-alloy-pine/[0.08] text-alloy-midnight"
                                : "border-transparent text-alloy-midnight/75 hover:border-alloy-forge/12 hover:bg-white/80"
                        }`}
                        data-testid={`field-entity-nav-${entity}`}
                        data-active={active ? "true" : "false"}
                    >
                        <span className="flex items-center gap-2">
                            <span aria-hidden>{ENTITY_ICONS[entity]}</span>
                            <span className="block text-sm font-semibold">{displayLabel}</span>
                        </span>
                        <span className="mt-1 block pl-6 text-[10px] text-alloy-midnight/50" data-count-fields={totalFields}>
                            {totalFields} fields
                        </span>
                    </button>
                );
            })}
            <a
                href={adminSettingsSubpathHref("entity-labels")}
                className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-alloy-midnight/55 hover:bg-white/80"
                data-testid="field-entity-nav-manage"
            >
                <span aria-hidden>⚙</span>
                Manage Entities
            </a>
        </nav>
    );
}

export { NAV_ENTITIES as FIELD_SETTINGS_NAV_ENTITIES, hubEntityApiTypes };
