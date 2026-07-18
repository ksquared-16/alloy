"use client";

/**
 * WORKSPACE-RETURN INTENT — a one-hop channel from the shell chrome to the Surface Host.
 *
 * The Sidebar "Workspace" (Home) control lives in AdminV2Shell, which is mounted by the adminV2
 * layout ABOVE the workspace kernel providers — so it cannot call `kernel.attention.move` directly.
 * A plain `<Link href="/workspace">` changed the URL but never moved attention, so the committed
 * work-unit Focus never yielded and the Workspace never took over (Kelly A2).
 *
 * This is not a second Focus authority: it carries NO state and makes NO decision. It only forwards
 * the operator's "take me back to the Workspace" gesture to the Surface Host, which owns the kernel
 * and performs the real `attention.move`. One publisher (the Home control), one subscriber (the
 * Surface Host).
 */

type WorkspaceReturnListener = () => void;

const listeners = new Set<WorkspaceReturnListener>();

/** Fired by the Home control — asks the Surface Host to move attention back to the Workspace. */
export function requestWorkspaceReturn(): void {
    for (const listener of listeners) listener();
}

/** Subscribed by the Surface Host (which owns the kernel). Returns an unsubscribe. */
export function subscribeWorkspaceReturn(listener: WorkspaceReturnListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
