import { Suspense } from "react";
import ActionPlacementsSettingsClient from "@/components/adminV2/settings/ActionPlacementsSettingsClient";
import ConfigurationPatternPlaceholder from "@/components/adminV2/settings/configurationRuntime/ConfigurationPatternPlaceholder";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { SETTINGS_ACTIONS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

export const dynamic = "force-dynamic";

function ActionsSettingsFallback() {
    return <p className="text-sm text-alloy-midnight/55">Loading action buttons…</p>;
}

export default function AdminV2SettingsActionsPage() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS}>
            <header className="space-y-0.5">
                <h1 className="config-typo-page-title">Action buttons</h1>
                <p className={`config-typo-sublabel ${SETTINGS_PAGE_INTRO_CLASS}`}>{SETTINGS_ACTIONS_SUBTITLE}</p>
            </header>
            <ConfigurationPatternPlaceholder surface="actions" />
            <Suspense fallback={<ActionsSettingsFallback />}>
                <ActionPlacementsSettingsClient />
            </Suspense>
        </div>
    );
}
