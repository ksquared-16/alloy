import { Suspense } from "react";
import ActionPlacementsSettingsClient from "@/components/adminV2/settings/ActionPlacementsSettingsClient";
import { SETTINGS_ACTIONS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

export const dynamic = "force-dynamic";

function ActionsSettingsFallback() {
    return <p className="text-sm text-alloy-midnight/55">Loading action buttons…</p>;
}

export default function AdminV2SettingsActionsPage() {
    return (
        <div className="w-full max-w-5xl space-y-3 pb-2">
            <header className="space-y-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Action buttons</h1>
                <p className="max-w-2xl text-sm text-alloy-midnight/60">{SETTINGS_ACTIONS_SUBTITLE}</p>
            </header>
            <Suspense fallback={<ActionsSettingsFallback />}>
                <ActionPlacementsSettingsClient />
            </Suspense>
        </div>
    );
}
