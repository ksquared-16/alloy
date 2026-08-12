import { ADMINV2_SHELL_CHROME_Z } from "@/components/admin/Drawer";

/**
 * Presentation constants that outlived the drawer product.
 *
 * The Search → drawer navigation that used to live here is DELETED:
 * `launchGlobalRecordSearchOpen`, `dispatchGlobalRecordSearchOpen`, the stored
 * open-intent, and the drawer-host path test. Search now emits Focus Panel
 * targets (`@/lib/adminV2/runtime/focusPanel/focusPanelTarget`) — subject + card
 * + item — so there is no longer any address that means "open the generic record
 * overlay", and no operator navigation path can reach it.
 *
 * What remains is genuinely presentation/telemetry and has no product behaviour.
 */

/** Dropdown stacks above portaled panels within shell chrome. */
export const GLOBAL_SEARCH_DROPDOWN_Z_INDEX = ADMINV2_SHELL_CHROME_Z + 5;

/**
 * Open-source tag carried into view-model prefetch so warmed payloads are
 * attributable to Search. Names the origin, not a destination.
 */
export const GLOBAL_SEARCH_DRAWER_OPEN_SOURCE = "global_search";
