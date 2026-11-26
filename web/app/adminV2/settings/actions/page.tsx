import { Suspense } from "react";
import ActionPlacementsSettingsClient from "@/components/adminV2/settings/ActionPlacementsSettingsClient";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";
import { SETTINGS_ACTIONS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

export const dynamic = "force-dynamic";

function ActionsSettingsFallback() {
    return <p className="text-sm text-alloy-midnight/55">Loading action buttons…</p>;
}

export default function AdminV2SettingsActionsPage() {
    return (
        <SettingsConfigurationSurfaceShell
            title="Action buttons"
            subtitle={SETTINGS_ACTIONS_SUBTITLE}
            testId="settings-actions-page"
        >
            <Suspense fallback={<ActionsSettingsFallback />}>
                <ActionPlacementsSettingsClient />
            </Suspense>
        </SettingsConfigurationSurfaceShell>
    );
}
