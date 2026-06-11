import { redirect } from "next/navigation";
import { ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

/** Legacy route — canonical Business Processes hub is /admin/settings/business-processes */
export default function AdminV2SettingsLifecycleRedirectPage() {
    redirect(ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH);
}
