/**
 * THE canonical Work Unit navigation prewarm (Trust Closure §11). Every affordance that navigates to
 * a Work Unit — sidebar links, shell navigation, Work View pills, tiles — calls this one helper so
 * they share one prewarm contract and none retain an obsolete path. It warms BOTH:
 *   - the route identity + operational bootstrap (`warmOperatorWorkUnitEntryFromHref`), and
 *   - the PRV2 surface session cache the runtime actually seeds from
 *     (`warmOperatorWorkUnitSurfaceFromHref`), keyed by the live workspace org/user/scope.
 *
 * Fire-and-forget and deduped; a warm under an unknown scope is simply not consumed, never harmful.
 */

import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import { warmOperatorWorkUnitSurfaceFromHref } from "@/lib/presentation/runtime/warmWorkUnitSurfaceSession";
import { getCurrentWorkspaceScope } from "@/lib/workspace/currentWorkspaceScope";

export function warmOperatorWorkUnitNavEntry(
    href: string,
    selectedSiteId: string | null,
    reason: string = "nav_intent",
): void {
    warmOperatorWorkUnitEntryFromHref(href, selectedSiteId, reason);
    const scope = getCurrentWorkspaceScope();
    warmOperatorWorkUnitSurfaceFromHref(href, selectedSiteId, scope);
}
