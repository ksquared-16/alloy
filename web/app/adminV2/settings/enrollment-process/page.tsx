import EnrollmentProcessHubClient from "@/app/adminV2/settings/enrollment-process/EnrollmentProcessHubClient";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { lifecycleProcessType, ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsEnrollmentProcessPage() {
    const process = lifecycleProcessType(ENROLLMENT_PROCESS_KEY);
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-enrollment-process-page">
            <header className="space-y-2">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">{process.title}</h1>
                <p className={SETTINGS_PAGE_INTRO_CLASS} data-testid="enrollment-process-subtitle">
                    {process.subtitle}
                </p>
            </header>
            <EnrollmentProcessHubClient />
        </div>
    );
}
