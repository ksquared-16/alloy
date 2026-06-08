import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

/** Legacy route — redirects to {@link ADMIN_V2_SETTINGS_LIFECYCLE_PATH}. */
export const ADMIN_V2_SETTINGS_ENROLLMENT_PROCESS_PATH = "/adminV2/settings/enrollment-process" as const;

/** Canonical Settings route for lifecycle configuration. */
export { ADMIN_V2_SETTINGS_LIFECYCLE_PATH };
