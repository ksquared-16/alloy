"use client";

import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";
import EntitiesWorkspaceClient from "@/components/adminV2/settings/entities/EntitiesWorkspaceClient";

const ENTITIES_SUBTITLE =
    "Name the record types your team works with — Person, Family, Child, Lead / Enrollment, and Location / Site.";

export default function EntitiesConfigurationPage() {
    return (
        <SettingsConfigurationSurfaceShell
            title="Entities"
            subtitle={ENTITIES_SUBTITLE}
            testId="settings-entities-page"
        >
            <EntitiesWorkspaceClient />
        </SettingsConfigurationSurfaceShell>
    );
}
