"use client";

/**
 * Alloy OS — named core-surface preload registry.
 *
 * After the persistent shell mounts (on idle), warm the core operator surfaces so clicking
 * into them feels instant. This reuses existing warm helpers — it introduces no new fetch
 * primitive and no new payloads. Each helper is internally deduped/stale-guarded, so calling
 * the registry repeatedly is safe and does not overfetch.
 *
 * Code for these surfaces is already statically imported in the shell/top nav; this layer
 * pre-warms lightweight summary data only where a safe warm helper already exists.
 *
 * Ordering follows the documented positional priority in
 * `@/lib/adminV2/runtime/preloadPriorityModel` (primary surfaces first, offscreen later).
 */

import { prefetchWorkspaceNavTree } from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { perfAlloyOsRuntimeMark } from "@/lib/perf/adminV2PerfLog";

export type CoreSurfaceKey =
    | "workspace"
    | "work_units"
    | "communications"
    | "work_items"
    | "processing";

export type CoreSurfacePreloadEntry = {
    key: CoreSurfaceKey;
    label: string;
    /**
     * Optional lightweight data warm. Omitted for surfaces whose code is already eagerly
     * mounted and which have no safe lightweight summary prewarm (e.g. Processing).
     */
    warm?: () => void;
};

/** The named core surfaces preloaded after shell mount. Order = warm priority. */
export const CORE_SURFACE_PRELOAD_REGISTRY: readonly CoreSurfacePreloadEntry[] = [
    {
        key: "workspace",
        label: "Workspace",
        warm: () => prefetchWorkspaceNavTree(),
    },
    {
        key: "work_units",
        label: "Work Units",
        // Same department/work-unit tree powers the work-unit surfaces; the helper dedupes internally.
        warm: () => prefetchWorkspaceNavTree(),
    },
    {
        key: "communications",
        label: "Communications",
        // No eager warm on shell mount. The full communications warm (status-options, templates,
        // announcements, bindings, conversations, audience metadata) and the inbox thread warm
        // (5-folder loop) are NOT needed to make /workspace usable and were the bulk of the boot
        // request storm. They are interaction-triggered instead: TopNavBar warms comms on
        // Comms/quick-message open and inbox on Inbox open. The persistent unread-count badge
        // (useInboxUnreadNavCount) still loads a COUNT only — never threads.
    },
    {
        key: "work_items",
        label: "Work Items",
        // No eager warm on shell mount. The operational-tasks list (`/api/admin/operational-tasks`)
        // is not needed to make /workspace usable and is forbidden as boot work. It is already
        // interaction-triggered everywhere it matters — the Work Items nav badge hover/focus, the
        // KPI strip, My Tasks modal, TopNav, and the sidebar all warm it on intent/open.
    },
    {
        key: "processing",
        label: "Processing",
        // No eager warm on shell mount. Processing is interaction-triggered — TopNavBar warms the
        // Incoming queue on Processing open (onOpenProcessing → warmProcessingQueueCache).
    },
];

export function coreSurfacePreloadKeys(): CoreSurfaceKey[] {
    return CORE_SURFACE_PRELOAD_REGISTRY.map((e) => e.key);
}

let lastRunAtMs = 0;
const RERUN_MIN_INTERVAL_MS = 30_000;

/**
 * Warm the registered core surfaces. Safe to call repeatedly (helpers dedupe); a short
 * interval guard avoids redundant fan-out on rapid shell remounts.
 */
export function runCoreSurfacePreload(options?: { force?: boolean }): void {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (!options?.force && now - lastRunAtMs < RERUN_MIN_INTERVAL_MS) return;
    lastRunAtMs = now;

    let warmed = 0;
    for (const entry of CORE_SURFACE_PRELOAD_REGISTRY) {
        if (!entry.warm) continue;
        try {
            entry.warm();
            warmed += 1;
        } catch {
            /* non-fatal — never let a warm failure surface to the operator */
        }
    }

    // Analytics (OIP): the FULL metric set is NOT warmed on boot — that is the analytics-modal
    // dataset, not a first-commit KPI, and warming all keys on boot is forbidden. The workspace
    // surface already warms only the CONFIGURED first-paint header KPIs; the full set is
    // destination-triggered when the analytics modal opens.

    perfAlloyOsRuntimeMark("core_surface_prefetched", { count: warmed });
}

/** Test-only reset of the interval guard. */
export function resetCoreSurfacePreloadForTests(): void {
    lastRunAtMs = 0;
}
