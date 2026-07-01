import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

/** Canonical settings route for Processes configuration. */
export const ADMIN_V2_SETTINGS_PROCESSES_PATH = adminSettingsSubpathHref("processes") as "/settings/processes";

/** @deprecated Legacy slug — redirects to {@link ADMIN_V2_SETTINGS_PROCESSES_PATH}. */
export const ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH = ADMIN_V2_SETTINGS_PROCESSES_PATH;

/** Legacy bookmark — `/admin/settings/lifecycle` redirects here. */
export const ADMIN_V2_SETTINGS_LIFECYCLE_LEGACY_PATH = adminSettingsSubpathHref(
    "lifecycle"
) as "/settings/lifecycle";

/** @deprecated Import {@link ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH} — value is canonical route. */
export const ADMIN_V2_SETTINGS_LIFECYCLE_PATH = ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH;
