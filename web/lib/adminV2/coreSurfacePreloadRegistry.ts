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
import { scheduleOipAnalyticsWarm } from "@/lib/metrics/oipWorkspaceWarmCache";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
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
        warm: () => {
            if (isOperationalWorkV1Enabled()) {
                prefetchWorkspaceOperationalTasks("open");
            }
        },
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

    // Analytics (OIP) is not a primary nav surface but is warmed alongside for parity with prior behavior.
    try {
        scheduleOipAnalyticsWarm();
    } catch {
        /* non-fatal */
    }

    perfAlloyOsRuntimeMark("core_surface_prefetched", { count: warmed });
}

/** Test-only reset of the interval guard. */
export function resetCoreSurfacePreloadForTests(): void {
    lastRunAtMs = 0;
}
