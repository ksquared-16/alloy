import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

/** Canonical settings route for Business Processes configuration. */
export const ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH = adminSettingsSubpathHref(
    "business-processes"
) as "/settings/business-processes";

/** Legacy bookmark — `/admin/settings/lifecycle` redirects here. */
export const ADMIN_V2_SETTINGS_LIFECYCLE_LEGACY_PATH = adminSettingsSubpathHref(
    "lifecycle"
) as "/settings/lifecycle";

/** @deprecated Import {@link ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH} — value is canonical route. */
export const ADMIN_V2_SETTINGS_LIFECYCLE_PATH = ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH;
