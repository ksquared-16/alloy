"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import EntityFieldsClient from "@/components/admin/EntityFieldsClient";
import PersonFieldsClient from "@/app/legacy-admin/system/person-fields/PersonFieldsClient";
import LocationFieldsClient from "@/app/legacy-admin/system/location-fields/LocationFieldsClient";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES,
    isChildcareFieldsHubVisibleEntity,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";

const MANAGE_OPTION_SETS_HREF = "/admin/settings/option-sets";

export type FieldEntityKey =
    | "person"
    | "location"
    | "customer"
    | "opportunity"
    | "inquiry_child";

/** Childcare MVP: Person, Family, Lead, Child, Location only. */
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
    return "/admin/settings/fields";
}

export default function SettingsFieldsHubClient({ initialEntity }: { initialEntity?: string }) {
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
        [labels]
    );

    const entityFieldsTitle = useMemo(
        () => `${adminFieldEntitySingularLabel(labels, entity)} Fields`,
        [labels, entity]
    );

    const onEntityChange = useCallback(
        (next: FieldEntityKey) => {
            router.replace(`${settingsFieldsBasePath(pathname)}?entity=${encodeURIComponent(next)}`);
        },
        [router, pathname]
    );

    return (
        <div className="w-full min-w-0 space-y-4">
            <SettingsEntityTabBar tabs={entityTabs} activeKey={entity} onSelect={onEntityChange} />

            <div key={entity} className="space-y-4">
                {entity === "person" ? (
                    <PersonFieldsClient
                        manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                        adminV2Chrome
                        hideSettingsHeader
                    />
                ) : entity === "location" ? (
                    <LocationFieldsClient
                        manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                        adminV2Chrome
                        hideSettingsHeader
                    />
                ) : (
                    <EntityFieldsClient
                        entityType={entity}
                        title={entityFieldsTitle}
                        manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                        adminV2Chrome
                        hideSettingsHeader
                    />
                )}
            </div>
        </div>
    );
}
