/**
 * The portal admission capability KEY — its one spelling, and nothing else.
 *
 * Client-safe: it holds no decision and reads nothing. Admission itself — the grant read, the three
 * outcomes and the fail-closed rule — stays in `lib/admin/portalAdmission.ts`, which binds this key as
 * `PORTAL_ADMISSION_CAPABILITY`. A client module that only needs to NAME the capability (e.g. the
 * workspace visibility registry) imports it from here, so it never imports the server admission module.
 */
export const PORTAL_ADMISSION_CAPABILITY_KEY = "portal.access";
