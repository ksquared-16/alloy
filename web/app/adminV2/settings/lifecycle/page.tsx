import Link from "next/link";
import LifecycleSettingsHubClient from "./LifecycleSettingsHubClient";
import { ADMIN_V2_SETTINGS_ENROLLMENT_PROCESS_PATH } from "@/lib/adminV2/settings/enrollmentProcessSettingsPaths";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsLifecyclePage() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-lifecycle-page">
            <header className="space-y-2">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Lifecycle</h1>
                <p className={SETTINGS_PAGE_INTRO_CLASS} data-testid="lifecycle-page-compact-helper">
                    Choose what must be complete before a family moves forward.{" "}
                    <Link href={ADMIN_V2_SETTINGS_ENROLLMENT_PROCESS_PATH} className="font-medium text-alloy-pine hover:underline">
                        Open Enrollment Process
                    </Link>{" "}
                    for the full stage configuration hub.
                </p>
            </header>
            <LifecycleSettingsHubClient />
        </div>
    );
}
