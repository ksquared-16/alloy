import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import type { LifecycleSiblingWorkUnitNavRow } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

/**
 * Switching → navigation (Operational Runtime Doctrine: continuous navigation, one owner).
 *
 * A lifecycle sibling work unit is its own route entry + Route VM. Selecting a sibling pill should
 * navigate to that work unit's canonical slug (`/workspace/work-unit/:slug`) — server-resolved Route
 * VM, fresh queue load — instead of the compat page mutating `activeWorkUnitId` in place and acting
 * as a client-side multi-work-unit switcher.
 *
 * Resolves the platform key (sidebar-parity `nav_platform_key` first, then the work unit `key`) and
 * returns the canonical href. Returns `null` when no platform key is resolvable — the caller then
 * falls back to the legacy in-page switch (a sibling with neither key cannot address a slug route).
 */
export function resolveLifecycleSiblingNavHref(
    row: LifecycleSiblingWorkUnitNavRow | null | undefined,
): string | null {
    const platformKey =
        (typeof row?.nav_platform_key === "string" ? row.nav_platform_key.trim() : "") ||
        (typeof row?.key === "string" ? row.key.trim() : "");
    if (!platformKey) return null;
    return operatorWorkUnitHrefFromKey(platformKey);
}
