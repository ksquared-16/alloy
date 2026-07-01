import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

/** Legacy route — redirects to {@link ADMIN_V2_SETTINGS_LIFECYCLE_PATH}. */
export const ADMIN_V2_SETTINGS_ENROLLMENT_PROCESS_PATH =
    adminSettingsSubpathHref("enrollment-process") as "/admin/settings/enrollment-process";

/** Canonical Settings route for lifecycle configuration. */
export { ADMIN_V2_SETTINGS_LIFECYCLE_PATH };
