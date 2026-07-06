/**
 * Client service for the Work Unit Header Surface config.
 * Talks to /api/admin/surfaces/work-unit-header (GET load, PUT publish).
 */

import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    normalizeWorkUnitHeaderSurfaceConfig,
    type WorkUnitHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";

/** Fired after a successful publish so the runtime hook can refresh its cache. */
export const WORK_UNIT_HEADER_SURFACE_PUBLISHED_EVENT = "work-unit-header-surface-published";

const ENDPOINT = "/api/admin/surfaces/work-unit-header";

export async function loadWorkUnitHeaderSurfaceConfig(): Promise<WorkUnitHeaderSurfaceConfig> {
    try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG;
        const json = (await res.json().catch(() => null)) as { config?: unknown } | null;
        return normalizeWorkUnitHeaderSurfaceConfig(json?.config);
    } catch {
        return DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG;
    }
}

export async function publishWorkUnitHeaderSurfaceConfig(
    config: WorkUnitHeaderSurfaceConfig,
): Promise<void> {
    const res = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `Failed to publish (${res.status})`);
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(WORK_UNIT_HEADER_SURFACE_PUBLISHED_EVENT));
    }
}
