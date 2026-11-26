"use client";

/**
 * Operational workspace RESUME — one shared owner.
 *
 * Product decision: an operational workspace reopens to its LAST STABLE INTERNAL POSITION. First
 * open (or an invalid remembered position) lands on the workspace default.
 *
 * Implemented once here rather than as ProcessingResumeState / WorkItemsResumeState /
 * OperationsResumeState, so a future operational workspace inherits resume by declaring a position
 * instead of by reimplementing one.
 *
 * ── WHY THE TYPE IS THE CONTRACT ─────────────────────────────────────────────────────────────
 *
 * A stable position is `Record<string, string>` — a flat set of declared NAVIGATION keys (section,
 * mode, view, lens, filter, lane). Transient interaction state is excluded STRUCTURALLY, not by
 * reviewer discipline: an open editor, a confirmation dialog, a popover, a half-completed form, an
 * ephemeral row action and a command destination have no representation in a flat string record of
 * navigation identity, so they cannot be committed here even by mistake. This is the same move the
 * runtime already makes elsewhere — put the boundary in the type and the wrong value becomes
 * unsayable rather than merely discouraged.
 *
 * It also means NO business-record payload is persisted. What is stored is the identity of a
 * navigation position ("section=staff"), never the data that position displays. Restoring where the
 * operator was must never become a second, stale copy of what they were looking at.
 *
 * Storage is `sessionStorage`: it survives close/reopen and a page reload, and it does NOT outlive
 * the browser session or leak across tabs — appropriate for navigation identity that is convenience,
 * not truth.
 */

export type StableWorkspacePosition = Record<string, string>;

const KEY_PREFIX = "alloy.workspace.resume.";

const storage = (): Storage | null => {
    try {
        if (typeof window === "undefined") return null;
        return window.sessionStorage;
    } catch {
        // Storage can throw outright (disabled cookies, privacy modes). Resume is a convenience;
        // losing it must never break opening a workspace.
        return null;
    }
};

/** The remembered position for a workspace, or null when there is none / it is unreadable. */
export function readWorkspaceResume(workspaceKey: string): StableWorkspacePosition | null {
    const s = storage();
    if (!s) return null;
    try {
        const raw = s.getItem(KEY_PREFIX + workspaceKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        // Keep only string→string entries. Anything else was not a navigation position.
        const out: StableWorkspacePosition = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === "string") out[k] = v;
        }
        return Object.keys(out).length > 0 ? out : null;
    } catch {
        return null;
    }
}

/**
 * Record part of a workspace's stable position. Called only on a stable navigation change.
 *
 * MERGES rather than replaces, because a workspace's position can have more than one owner: Work
 * Items keeps its view in the modal and its queue scope in the panel, and each must be able to
 * declare its own keys without erasing the other's. Keys are only ever added or updated — a
 * navigation position has no meaningful "removal", and anything stale is caught by the workspace's
 * own validity guard on read.
 */
export function writeWorkspaceResume(workspaceKey: string, position: StableWorkspacePosition): void {
    const s = storage();
    if (!s) return;
    try {
        const out: StableWorkspacePosition = { ...(readWorkspaceResume(workspaceKey) ?? {}) };
        for (const [k, v] of Object.entries(position)) {
            if (typeof v === "string" && v.length > 0) out[k] = v;
        }
        s.setItem(KEY_PREFIX + workspaceKey, JSON.stringify(out));
    } catch {
        // Quota or privacy mode — resume degrades to "always default", which is the safe direction.
    }
}

export function clearWorkspaceResume(workspaceKey: string): void {
    try {
        storage()?.removeItem(KEY_PREFIX + workspaceKey);
    } catch {
        /* see writeWorkspaceResume */
    }
}

/**
 * The position a workspace should OPEN at: the remembered one when it is still valid, otherwise the
 * workspace default.
 *
 * `isValid` is the workspace's own guard. A remembered section that no longer exists, or that this
 * operator is no longer permitted to see, must fall back to the default rather than open something
 * broken — the remembered value is a hint, never an authority.
 */
export function resolveWorkspaceOpenPosition<T extends StableWorkspacePosition>(
    workspaceKey: string,
    defaults: T,
    isValid?: (position: StableWorkspacePosition) => boolean,
): T {
    const remembered = readWorkspaceResume(workspaceKey);
    if (!remembered) return defaults;
    const merged = { ...defaults, ...remembered } as T;
    if (isValid && !isValid(merged)) return defaults;
    return merged;
}
