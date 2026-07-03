/**
 * Client service for the Workspace Process Surface behavior config.
 * Talks to /api/admin/surfaces/workspace-processes (GET load, PUT publish).
 */

import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    normalizeWorkspaceProcessSurfaceConfig,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

/** Fired after a successful publish so the runtime hook can refresh its cache. */
export const WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT = "workspace-process-surface-published";

const ENDPOINT = "/api/admin/surfaces/workspace-processes";

export async function loadWorkspaceProcessSurfaceConfig(): Promise<WorkspaceProcessSurfaceConfig> {
    try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;
        const json = (await res.json().catch(() => null)) as { config?: unknown } | null;
        return normalizeWorkspaceProcessSurfaceConfig(json?.config);
    } catch {
        return DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;
    }
}

export async function publishWorkspaceProcessSurfaceConfig(
    config: WorkspaceProcessSurfaceConfig,
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
        window.dispatchEvent(new Event(WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT));
    }
}
