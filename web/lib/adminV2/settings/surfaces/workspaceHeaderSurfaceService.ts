/**
 * Client service for the Workspace Header Surface config.
 * Talks to /api/admin/surfaces/workspace-header (GET load, PUT publish).
 */

import {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    normalizeWorkspaceHeaderSurfaceConfig,
    type WorkspaceHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

/** Fired after a successful publish so the runtime hook can refresh its cache. */
export const WORKSPACE_HEADER_SURFACE_PUBLISHED_EVENT = "workspace-header-surface-published";

const ENDPOINT = "/api/admin/surfaces/workspace-header";

export async function loadWorkspaceHeaderSurfaceConfig(): Promise<WorkspaceHeaderSurfaceConfig> {
    try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG;
        const json = (await res.json().catch(() => null)) as { config?: unknown } | null;
        return normalizeWorkspaceHeaderSurfaceConfig(json?.config);
    } catch {
        return DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG;
    }
}

export async function publishWorkspaceHeaderSurfaceConfig(
    config: WorkspaceHeaderSurfaceConfig,
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
        window.dispatchEvent(new Event(WORKSPACE_HEADER_SURFACE_PUBLISHED_EVENT));
    }
}
