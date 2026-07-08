/**
 * C3 — same-host pill queue warm plan resolver.
 *
 * Pure helper: mirrors `resolveSelectWorkViewAction` so hover warms the same path the
 * click will take (in-page queue prefetch vs cross-host entry warm). No side effects —
 * the runtime owner builds the route and fires the existing `dedupeAdminFetch` / TTL path.
 */

import {
    resolveSelectWorkViewAction,
    type SelectWorkViewAction,
} from "@/lib/presentation/runtime/workUnitPillSwitching";
import type { WorkViewTargetInputs } from "@/lib/presentation/runtime/workViewTargetHref";
import type { WorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";

export type SameHostPillQueueWarmPlan =
    | { kind: "noop" }
    | {
          kind: "same_host_queue";
          workViewId: string;
          workUnitId: string;
          baseQueueKey: string;
      }
    | { kind: "cross_host_entry"; workViewId: string; href: string };

/** Short TTL reused by warm + active rows GETs so hover can seed the click path. */
export const SAME_HOST_PILL_QUEUE_WARM_TTL_MS = 30_000;

export function resolveSameHostPillQueueWarmPlan(args: {
    workViewId: string;
    currentWorkViewId: string | null;
    currentWorkUnitId: string | null;
    canonicalLocationByViewId: ReadonlyMap<string, WorkViewCanonicalLocation>;
    /** Validated base lane for the CURRENT host (fallback when location omits a key). */
    hostBaseQueueKey: string | null;
    targetInputs: WorkViewTargetInputs;
}): SameHostPillQueueWarmPlan {
    const action: SelectWorkViewAction = resolveSelectWorkViewAction({
        workViewId: args.workViewId,
        currentWorkViewId: args.currentWorkViewId,
        currentWorkUnitId: args.currentWorkUnitId,
        canonicalLocationByViewId: args.canonicalLocationByViewId,
        targetInputs: args.targetInputs,
    });

    if (action.kind === "noop") return { kind: "noop" };

    if (action.kind === "navigate") {
        return { kind: "cross_host_entry", workViewId: action.workViewId, href: action.href };
    }

    // in-page — warm the queue rows for this host + view.
    const location = args.canonicalLocationByViewId.get(action.workViewId);
    const workUnitId =
        location?.workUnitId?.trim() || args.currentWorkUnitId?.trim() || "";
    const baseQueueKey =
        location?.baseQueueKey?.trim() || args.hostBaseQueueKey?.trim() || "";
    if (!workUnitId || !baseQueueKey) return { kind: "noop" };

    return {
        kind: "same_host_queue",
        workViewId: action.workViewId,
        workUnitId,
        baseQueueKey,
    };
}
