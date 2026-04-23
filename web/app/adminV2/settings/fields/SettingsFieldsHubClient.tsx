"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import EntityFieldsClient from "@/components/admin/EntityFieldsClient";
import PersonFieldsClient from "@/app/admin/system/person-fields/PersonFieldsClient";
import LocationFieldsClient from "@/app/admin/system/location-fields/LocationFieldsClient";

const MANAGE_OPTION_SETS_HREF = "/adminV2/settings/option-sets";

export type FieldEntityKey = "person" | "location" | "customer" | "job" | "opportunity" | "vendor" | "schedule";

const ALLOWED_KEYS: FieldEntityKey[] = ["person", "location", "customer", "job", "opportunity", "vendor", "schedule"];

const ENTITY_OPTIONS: { key: FieldEntityKey; label: string }[] = [
    { key: "person", label: "Person" },
    { key: "customer", label: "Customer" },
    { key: "job", label: "Job" },
    { key: "opportunity", label: "Opportunity" },
    { key: "vendor", label: "Vendor" },
    { key: "schedule", label: "Schedule" },
    { key: "location", label: "Location" },
];

/** Matches legacy /admin/system/*-fields page titles for EntityFieldsClient. */
const LEGACY_ENTITY_FIELDS_TITLE: Partial<Record<FieldEntityKey, string>> = {
    customer: "Customer Fields",
    job: "Job Fields",
    opportunity: "Opportunity Fields",
    vendor: "Vendor Fields",
    schedule: "Schedule Fields",
};

function normalizeEntity(raw: string | undefined): FieldEntityKey {
    const t = (raw ?? "").trim().toLowerCase();
    return ALLOWED_KEYS.includes(t as FieldEntityKey) ? (t as FieldEntityKey) : "person";
}

function settingsFieldsBasePath(pathname: string): string {
    if (pathname.startsWith("/admin/v2/settings")) return "/admin/v2/settings/fields";
    if (pathname.startsWith("/adminv2/settings")) return "/adminv2/settings/fields";
    return "/adminV2/settings/fields";
}

export default function SettingsFieldsHubClient({ initialEntity }: { initialEntity?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const entity = useMemo(() => normalizeEntity(initialEntity), [initialEntity]);

    const onEntityChange = useCallback(
        (next: FieldEntityKey) => {
            router.replace(`${settingsFieldsBasePath(pathname)}?entity=${encodeURIComponent(next)}`);
        },
        [router, pathname]
    );

    return (
        <div className="w-full max-w-6xl space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-admin-border bg-white/70 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                    <label htmlFor="settings-fields-entity" className="block text-xs font-medium text-alloy-midnight/70">
                        Entity
                    </label>
                    <select
                        id="settings-fields-entity"
                        className="mt-1 w-full max-w-md rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                        value={entity}
                        onChange={(e) => onEntityChange(e.target.value as FieldEntityKey)}
                    >
                        {ENTITY_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <p className="mt-2 max-w-2xl text-xs text-alloy-midnight/55">
                        Rows are org-scoped in <code className="rounded bg-alloy-stone/30 px-1">field_definitions</code>.
                        Migrations that seed the registry run at deploy time (e.g. batch record-number fields for orgs
                        that existed then). New orgs or partial deploys can show an empty list until you add fields or
                        run the relevant backfill — this is expected, not an API filter bug.
                    </p>
                </div>
            </div>

            <div key={entity}>
                {entity === "person" ? (
                    <PersonFieldsClient manageOptionSetsHref={MANAGE_OPTION_SETS_HREF} />
                ) : entity === "location" ? (
                    <LocationFieldsClient manageOptionSetsHref={MANAGE_OPTION_SETS_HREF} />
                ) : (
                    <EntityFieldsClient
                        entityType={entity}
                        title={LEGACY_ENTITY_FIELDS_TITLE[entity] ?? "Fields"}
                        subtitle="Field definitions for forms, drawers, and tables. Same APIs as legacy System pages."
                        manageOptionSetsHref={MANAGE_OPTION_SETS_HREF}
                    />
                )}
            </div>
        </div>
    );
}
