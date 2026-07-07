"use client";

import EntityLabelsClient from "@/app/legacy-admin/system/entity-labels/EntityLabelsClient";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";

const ENTITIES_SUBTITLE =
    "Configure tenant-facing labels for records, queues, and drawers (for example Lead, Child Enrollment, Family).";

export default function EntitiesConfigurationPage() {
    return (
        <SettingsConfigurationSurfaceShell
            title="Entities"
            subtitle={ENTITIES_SUBTITLE}
            testId="settings-entities-page"
        >
            <EntityLabelsClient adminV2Chrome omitOuterHeader />
        </SettingsConfigurationSurfaceShell>
    );
}
