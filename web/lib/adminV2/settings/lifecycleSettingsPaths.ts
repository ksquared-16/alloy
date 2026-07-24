/**
 * Canonical Organization Processes path.
 * Legacy `/settings/processes` redirects here.
 */
import { CANONICAL_ORGANIZATION_PROCESSES_HREF } from "@/lib/admin/canonicalAdminRoutes";

/** Canonical Organization route for Processes configuration. */
export const ADMIN_V2_SETTINGS_PROCESSES_PATH = CANONICAL_ORGANIZATION_PROCESSES_HREF;

/** @deprecated Legacy slug — resolves to {@link ADMIN_V2_SETTINGS_PROCESSES_PATH}. */
export const ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH = ADMIN_V2_SETTINGS_PROCESSES_PATH;

/** Legacy bookmark — `/admin/settings/lifecycle` redirected via next.config; keep helper for callers. */
export const ADMIN_V2_SETTINGS_LIFECYCLE_LEGACY_PATH = "/settings/lifecycle" as const;

/** @deprecated Import {@link ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH} — value is canonical route. */
export const ADMIN_V2_SETTINGS_LIFECYCLE_PATH = ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH;
