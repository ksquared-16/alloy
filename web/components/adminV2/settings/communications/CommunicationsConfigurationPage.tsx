"use client";

import CommunicationsIdentityAdminClient from "@/app/adminV2/settings/communications/CommunicationsIdentityAdminClient";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";

const COMMUNICATIONS_SUBTITLE =
    "Configure provider accounts, communication identities, location defaults, and user access.";

export default function CommunicationsConfigurationPage() {
    return (
        <SettingsConfigurationSurfaceShell
            title="Communications"
            subtitle={COMMUNICATIONS_SUBTITLE}
            testId="settings-communications-page"
        >
            <CommunicationsIdentityAdminClient />
        </SettingsConfigurationSurfaceShell>
    );
}
