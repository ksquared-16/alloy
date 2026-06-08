import LifecycleSettingsShell from "@/components/adminV2/settings/LifecycleSettingsShell";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsLifecyclePage() {
    return (
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS} data-testid="settings-lifecycle-page">
            <header className="space-y-0.5" data-testid="lifecycle-page-header">
                <h1 className="text-lg font-semibold tracking-tight text-alloy-midnight">Lifecycle</h1>
                <p className="text-xs text-alloy-midnight/55" data-testid="lifecycle-page-subtitle">
                    Configure stages, queue views, and actions for the workspace.
                </p>
            </header>
            <LifecycleSettingsShell />
        </div>
    );
}
