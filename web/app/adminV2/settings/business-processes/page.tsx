import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
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
            <SettingsPageHeader
                variant="hero"
                title={BUSINESS_PROCESS_SETTINGS_PAGE_TITLE}
                subtitle={BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE}
                className="mb-4"
            />
            <LifecycleSettingsShell />
        </div>
    );
}
