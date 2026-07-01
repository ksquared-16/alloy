import { redirect } from "next/navigation";
import { ADMIN_V2_SETTINGS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

/** Legacy route — canonical Processes hub is {@link ADMIN_V2_SETTINGS_PROCESSES_PATH}. */
export default function AdminV2SettingsBusinessProcessesRedirectPage() {
    redirect(ADMIN_V2_SETTINGS_PROCESSES_PATH);
}
