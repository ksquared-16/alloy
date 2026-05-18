"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import EntityFieldsClient from "@/components/admin/EntityFieldsClient";
import PersonFieldsClient from "@/app/admin/system/person-fields/PersonFieldsClient";
import LocationFieldsClient from "@/app/admin/system/location-fields/LocationFieldsClient";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";

const MANAGE_OPTION_SETS_HREF = "/adminV2/settings/option-sets";

export type FieldEntityKey = "person" | "location" | "customer" | "job" | "opportunity" | "vendor" | "schedule";

/** Tab order: person, customer, job, opportunity, vendor, schedule, location */
const ENTITY_SELECT_ORDER: FieldEntityKey[] = ["person", "customer", "job", "opportunity", "vendor", "schedule", "location"];

const ALLOWED_ENTITY_KEYS = new Set<string>(ENTITY_SELECT_ORDER);

function normalizeEntity(raw: string | undefined): FieldEntityKey {
    const t = (raw ?? "").trim().toLowerCase();
    return ALLOWED_ENTITY_KEYS.has(t) ? (t as FieldEntityKey) : "person";
}

function settingsFieldsBasePath(pathname: string): string {
    if (pathname.startsWith("/admin/v2/settings")) return "/admin/v2/settings/fields";
    if (pathname.startsWith("/adminv2/settings")) return "/adminv2/settings/fields";
    return "/adminV2/settings/fields";
}

export default function SettingsFieldsHubClient({ initialEntity }: { initialEntity?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const { labels } = useEntityLabels();
    const entity = useMemo(() => normalizeEntity(initialEntity), [initialEntity]);

    const entityTabs = useMemo(
        () => ENTITY_SELECT_ORDER.map((key) => ({ key, label: adminFieldEntitySingularLabel(labels, key) })),
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
        <div className="w-full max-w-6xl space-y-6">
            <SettingsEntityTabBar tabs={entityTabs} activeKey={entity} onSelect={onEntityChange} />

            <header className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-alloy-midnight/40">Field registry</p>
                <p className="max-w-2xl text-xs leading-relaxed text-alloy-midnight/55">
                    Define fields and rules for each record type: labels, help text, required when saving, staff editability,
                    and where fields appear. Drawer section order is on{" "}
                    <a href="/adminV2/settings/layouts" className="font-medium text-alloy-pine hover:underline">
                        Record layouts
                    </a>
                    ; catalog group names are on{" "}
                    <a href="/adminV2/settings/field-sections" className="font-medium text-alloy-pine hover:underline">
                        Field grouping
                    </a>
                    .
                </p>
            </header>

            <div key={entity} className="space-y-4">
                {entity === "person" ? (
                    <PersonFieldsClient manageOptionSetsHref={MANAGE_OPTION_SETS_HREF} adminV2Chrome />
                ) : entity === "location" ? (
                    <LocationFieldsClient manageOptionSetsHref={MANAGE_OPTION_SETS_HREF} adminV2Chrome />
                ) : (
                    <EntityFieldsClient
                        entityType={entity}
                        title={entityFieldsTitle}
                        manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                        adminV2Chrome
                    />
                )}
            </div>
        </div>
    );
}
