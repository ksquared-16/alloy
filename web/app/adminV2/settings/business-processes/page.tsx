import {
    BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE,
    BUSINESS_PROCESS_SETTINGS_PAGE_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import LifecycleSettingsShell from "@/components/adminV2/settings/LifecycleSettingsShell";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsBusinessProcessesPage() {
    return (
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS} data-testid="settings-business-processes-page">
            <header className="space-y-0.5" data-testid="business-processes-page-header">
                <h1 className="text-lg font-semibold tracking-tight text-alloy-midnight">
                    {BUSINESS_PROCESS_SETTINGS_PAGE_TITLE}
                </h1>
                <p className="text-xs text-alloy-midnight/55" data-testid="business-processes-page-subtitle">
                    {BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE}
                </p>
            </header>
            <LifecycleSettingsShell />
        </div>
    );
}
