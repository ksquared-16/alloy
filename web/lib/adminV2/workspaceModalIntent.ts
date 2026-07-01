import type { AdminV2WorkspaceModalKey } from "@/lib/adminV2/workspaceModalCoordinator";

/**
 * Deep-link → modal intent bridge.
 *
 * Workspace modals are client state (not routed). A `?workspaceModal=…` param lets a
 * settings/config surface (e.g. Surfaces → "Open in Workspace") ask the shell to open
 * a runtime modal once, after which the param is cleaned from the URL. The param is an
 * implementation detail for modal state — NOT a product route.
 *
 * Only the Operational Intelligence runtime (`analytics`) is deep-linkable today.
 */
export const WORKSPACE_MODAL_INTENT_PARAM = "workspaceModal";

const DEEP_LINKABLE_MODALS: ReadonlySet<string> = new Set<AdminV2WorkspaceModalKey>(["analytics"]);

/** Parse a modal-open intent from a URL query, or null when none/invalid/not deep-linkable. */
export function parseWorkspaceModalIntent(
    search: string | URLSearchParams,
): AdminV2WorkspaceModalKey | null {
    const params = typeof search === "string" ? new URLSearchParams(search) : search;
    const requested = (params.get(WORKSPACE_MODAL_INTENT_PARAM) ?? "").trim();
    return requested && DEEP_LINKABLE_MODALS.has(requested) ? (requested as AdminV2WorkspaceModalKey) : null;
}
