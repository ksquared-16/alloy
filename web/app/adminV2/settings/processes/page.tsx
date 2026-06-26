import {
    BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE,
    BUSINESS_PROCESS_SETTINGS_PAGE_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import LifecycleSettingsShell from "@/components/adminV2/settings/LifecycleSettingsShell";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsProcessesPage() {
    return (
        <div className="process-config-page" data-testid="settings-processes-page">
            <header className="process-config-top shrink-0 px-0 pb-3">
                <h1 className="text-2xl font-semibold tracking-tight text-alloy-midnight">
                    {BUSINESS_PROCESS_SETTINGS_PAGE_TITLE}
                </h1>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-alloy-midnight/65">
                    {BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE}
                </p>
            </header>
            <LifecycleSettingsShell />
        </div>
    );
}
