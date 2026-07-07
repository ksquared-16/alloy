"use client";

import CommunicationsSetupClient from "@/app/adminV2/settings/communications/CommunicationsSetupClient";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";

const COMMUNICATIONS_SUBTITLE = "Org-scoped email and SMS provider bindings.";

export default function CommunicationsConfigurationPage() {
    return (
        <SettingsConfigurationSurfaceShell
            title="Communications setup"
            subtitle={COMMUNICATIONS_SUBTITLE}
            testId="settings-communications-page"
        >
            <CommunicationsSetupClient />
        </SettingsConfigurationSurfaceShell>
    );
}
