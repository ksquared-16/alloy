"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import EntityFieldsClient from "@/components/admin/EntityFieldsClient";
import PersonFieldsClient from "@/app/legacy-admin/system/person-fields/PersonFieldsClient";
import LocationFieldsClient from "@/app/legacy-admin/system/location-fields/LocationFieldsClient";
import {
    ConfigurationContext,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES,
    isChildcareFieldsHubVisibleEntity,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import { FIELDS_HUB_REGISTRY_TRUST_NOTE } from "@/lib/fields/fieldSettingsOperatorUi";
import { SETTINGS_FIELDS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

const MANAGE_OPTION_SETS_HREF = "/settings/option-sets";

export type FieldEntityKey =
    | "person"
    | "location"
    | "customer"
    | "opportunity"
    | "inquiry_child";

const ENTITY_SELECT_ORDER: FieldEntityKey[] = [...CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES];
const ALLOWED_ENTITY_KEYS = new Set<string>(ENTITY_SELECT_ORDER);

function normalizeEntity(raw: string | undefined): FieldEntityKey {
    const t = (raw ?? "").trim().toLowerCase();
    if (t === "job") return "opportunity";
    if (!isChildcareFieldsHubVisibleEntity(t) || !ALLOWED_ENTITY_KEYS.has(t)) return "person";
    return t as FieldEntityKey;
}

function settingsFieldsBasePath(pathname: string): string {
    if (pathname.startsWith("/admin/v2/settings")) return "/admin/v2/settings/fields";
    if (pathname.startsWith("/adminv2/settings")) return "/adminv2/settings/fields";
    return "/settings/fields";
}

function FieldsEntityWorkspace({ entity }: { entity: FieldEntityKey }) {
    const { labels } = useEntityLabels();
    const entityFieldsTitle = `${adminFieldEntitySingularLabel(labels, entity)} Fields`;

    if (entity === "person") {
        return (
            <PersonFieldsClient
                manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                adminV2Chrome
                hideSettingsHeader
            />
        );
    }
    if (entity === "location") {
        return (
            <LocationFieldsClient
                manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                adminV2Chrome
                hideSettingsHeader
            />
        );
    }
    return (
        <EntityFieldsClient
            entityType={entity}
            title={entityFieldsTitle}
            manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
            adminV2Chrome
            hideSettingsHeader
        />
    );
}

export default function FieldsConfigurationPage({ initialEntity }: { initialEntity?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const { labels } = useEntityLabels();
    const entity = useMemo(() => normalizeEntity(initialEntity), [initialEntity]);

    const entityTabs = useMemo(
        () =>
            ENTITY_SELECT_ORDER.map((key) => ({
                key,
                label: adminFieldEntitySingularLabel(labels, key),
            })),
        [labels],
    );

    const onEntityChange = useCallback(
        (next: FieldEntityKey) => {
            router.replace(`${settingsFieldsBasePath(pathname)}?entity=${encodeURIComponent(next)}`);
        },
        [router, pathname],
    );

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-4 pb-4" data-testid="settings-fields-page">
            <ConfigurationContext
                eyebrow="Platform Configuration"
                title="Fields"
                subtitle={SETTINGS_FIELDS_SUBTITLE}
                testId="fields-configuration-context"
            >
                <p
                    className="rounded-lg border border-alloy-forge/10 bg-alloy-pine/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/65"
                    data-testid="fields-hub-registry-trust-note"
                >
                    {FIELDS_HUB_REGISTRY_TRUST_NOTE}
                </p>
            </ConfigurationContext>

            <ConfigurationShell
                testId="fields-configuration-shell"
                queueColumn={
                    <ConfigurationQueue title="Entities" testId="fields-configuration-entity-queue">
                        {entityTabs.map((tab) => (
                            <ConfigurationQueueItem
                                key={tab.key}
                                title={tab.label}
                                active={entity === tab.key}
                                onClick={() => onEntityChange(tab.key)}
                                testId={`fields-entity-${tab.key}`}
                            />
                        ))}
                    </ConfigurationQueue>
                }
            >
                <div key={entity} className="min-h-0 min-w-0" data-testid="fields-configuration-workspace">
                    <FieldsEntityWorkspace entity={entity} />
                </div>
            </ConfigurationShell>
        </div>
    );
}
