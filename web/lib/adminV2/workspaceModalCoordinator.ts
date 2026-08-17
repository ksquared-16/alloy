import { setActionWorkspaceOpenDocumentFlag } from "@/lib/bos/bosRailPresentationFlags";

/**
 * Shell-level modals owned by AdminV2 workspace chrome (mutually exclusive).
 *
 * `operations` is the operating day and its configuration: Roster, Attendance, Staff and Children
 * under WORK, and Assignment Categories, Patterns and Validation under STUDIO.
 *
 * It absorbed three keys. `roster` was the operating plan, `records` the durable population, and
 * `scheduling` the commitment ledger plus its configuration — three doors that made an operator
 * declare in advance which question they were about to ask about the same day and the same people.
 *
 * None of the three survives here, and that is the point: a modal key is the workspace's identity,
 * so keeping `roster` as the internal key "for convenience" would teach every later reader that the
 * workspace IS Roster. Old callers reach Operations through the dispatchers in
 * `workspaceModalEvents`, which forward by NAME — a compatibility layer with no state of its own,
 * rather than a second key that could drift out of sync with this one.
 */
export type AdminV2WorkspaceModalKey =
    | "inbox"
    | "tasks"
    | "quick_message"
    | "analytics"
    | "processing"
    | "operations";

export type AdminV2WorkspaceModalSnapshot = {
    active: AdminV2WorkspaceModalKey | null;
};

let snapshot: AdminV2WorkspaceModalSnapshot = { active: null };
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners) {
        listener();
    }
}

export function getAdminV2WorkspaceModalSnapshot(): AdminV2WorkspaceModalSnapshot {
    return snapshot;
}

export function getAdminV2WorkspaceModal(): AdminV2WorkspaceModalKey | null {
    return snapshot.active;
}

export function subscribeAdminV2WorkspaceModal(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function suppressBosActionWorkspace(): void {
    setActionWorkspaceOpenDocumentFlag(false);
}

/** Close every shell-level modal and suppress BOS Action Workspace overlay. */
export function closeAllWorkspaceModals(): void {
    if (!snapshot.active) {
        suppressBosActionWorkspace();
        return;
    }
    snapshot = { active: null };
    suppressBosActionWorkspace();
    notify();
}

/** Close only when `key` is the active modal (or when key omitted). */
export function closeWorkspaceModal(key?: AdminV2WorkspaceModalKey): void {
    if (key != null && snapshot.active !== key) return;
    if (!snapshot.active) return;
    snapshot = { active: null };
    notify();
}

/** Open one shell modal — closes any other active shell modal first. */
export function openWorkspaceModal(key: AdminV2WorkspaceModalKey): void {
    if (snapshot.active === key) return;
    suppressBosActionWorkspace();
    snapshot = { active: key };
    notify();
}

/** Test-only reset. */
export function resetAdminV2WorkspaceModalForTests(): void {
    snapshot = { active: null };
    listeners.clear();
}
