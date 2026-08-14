import { setActionWorkspaceOpenDocumentFlag } from "@/lib/bos/bosRailPresentationFlags";

/**
 * Shell-level modals owned by AdminV2 workspace chrome (mutually exclusive).
 *
 * `roster` is the operating plan — who is expected where and when — and its
 * actuality mode, Attendance. `scheduling` is Assignments: the durable commitment
 * ledger those expectations are derived from. They lived under one noun and
 * answered two different questions.
 */
export type AdminV2WorkspaceModalKey =
    | "inbox"
    | "tasks"
    | "quick_message"
    | "analytics"
    | "processing"
    | "scheduling"
    | "roster";

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
