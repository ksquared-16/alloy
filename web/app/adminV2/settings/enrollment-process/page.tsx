import { redirect } from "next/navigation";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

/** Legacy route — canonical Lifecycle hub is /adminV2/settings/lifecycle */
export default function AdminV2SettingsEnrollmentProcessRedirectPage() {
    redirect(ADMIN_V2_SETTINGS_LIFECYCLE_PATH);
}
