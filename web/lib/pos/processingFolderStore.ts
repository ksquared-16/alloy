"use client";

import {
    DEFAULT_PROCESSING_FOLDERS,
    mergeFolderDefaults,
    sortFolders,
    slugifyFolderId,
    type ProcessingFolderDefinition,
    PROCESSING_FOLDER_STORAGE_VERSION,
} from "./processingFolderModel";

const STORAGE_KEY_PREFIX = "alloy.processing.folders.v1";

type StoredPayload = {
    version: number;
    folders: ProcessingFolderDefinition[];
};

let memoryCache: ProcessingFolderDefinition[] | null = null;
const listeners = new Set<() => void>();

function storageKey(orgId?: string | null): string {
    return orgId ? `${STORAGE_KEY_PREFIX}:${orgId}` : `${STORAGE_KEY_PREFIX}:global`;
}

function notify(): void {
    listeners.forEach((l) => l());
}

function readRaw(orgId?: string | null): StoredPayload | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(storageKey(orgId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredPayload;
        if (parsed.version !== PROCESSING_FOLDER_STORAGE_VERSION || !Array.isArray(parsed.folders)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeRaw(folders: ProcessingFolderDefinition[], orgId?: string | null): void {
    if (typeof window === "undefined") return;
    const payload: StoredPayload = { version: PROCESSING_FOLDER_STORAGE_VERSION, folders };
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(payload));
    memoryCache = mergeFolderDefaults(folders);
    notify();
}

export function getProcessingFoldersSnapshot(orgId?: string | null): ProcessingFolderDefinition[] {
    if (memoryCache) return memoryCache;
    const stored = readRaw(orgId);
    memoryCache = mergeFolderDefaults(stored?.folders ?? null);
    return memoryCache;
}

export function subscribeProcessingFolders(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function saveProcessingFolders(folders: ProcessingFolderDefinition[], orgId?: string | null): void {
    writeRaw(sortFolders(folders), orgId);
}

export function resetProcessingFolders(orgId?: string | null): void {
    writeRaw([...DEFAULT_PROCESSING_FOLDERS], orgId);
}

export function addProcessingFolder(
    input: { label: string; description?: string; scopes?: ProcessingFolderDefinition["scopes"] },
    orgId?: string | null
): ProcessingFolderDefinition {
    const current = getProcessingFoldersSnapshot(orgId);
    const maxOrder = current.reduce((m, f) => Math.max(m, f.order), 0);
    const id = slugifyFolderId(input.label);
    if (current.some((f) => f.id === id)) {
        throw new Error("A folder with this name already exists.");
    }
    const next: ProcessingFolderDefinition = {
        id,
        label: input.label.trim(),
        description: input.description?.trim() || undefined,
        scopes: input.scopes ?? ["form", "category"],
        accent: "pine",
        order: maxOrder + 10,
        isSystem: false,
        keywords: [id.replace(/_/g, " ")],
    };
    saveProcessingFolders([...current, next], orgId);
    return next;
}

export function updateProcessingFolder(
    id: string,
    patch: Partial<Pick<ProcessingFolderDefinition, "label" | "description" | "order" | "hidden" | "accent">>,
    orgId?: string | null
): void {
    const current = getProcessingFoldersSnapshot(orgId);
    saveProcessingFolders(
        current.map((f) => (f.id === id ? { ...f, ...patch, label: patch.label?.trim() || f.label } : f)),
        orgId
    );
}

export function reorderProcessingFolder(id: string, direction: "up" | "down", orgId?: string | null): void {
    const current = sortFolders(getProcessingFoldersSnapshot(orgId));
    const idx = current.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= current.length) return;
    const a = current[idx]!;
    const b = current[swapIdx]!;
    if (a.isSystem && b.isSystem) return;
    const next = current.map((f) => {
        if (f.id === a.id) return { ...f, order: b.order };
        if (f.id === b.id) return { ...f, order: a.order };
        return f;
    });
    saveProcessingFolders(next, orgId);
}

/**
 * Reorder a set of folders to an explicit sequence (drag-and-drop).
 *
 * Reassigns each dragged folder into the SAME set of order slots it already occupies, in the new
 * sequence. This preserves the position of any folders not in `orderedIds` and — unlike the adjacent
 * up/down swap — lets a custom folder move past a block of system folders in a single gesture.
 */
export function reorderProcessingFolders(orderedIds: string[], orgId?: string | null): void {
    const current = sortFolders(getProcessingFoldersSnapshot(orgId));
    const idSet = new Set(orderedIds);
    if (idSet.size !== orderedIds.length) return; // duplicate ids — refuse
    const slots = current
        .filter((f) => idSet.has(f.id))
        .map((f) => f.order)
        .sort((a, b) => a - b);
    if (slots.length !== orderedIds.length) return; // ids not all present — refuse
    const orderById = new Map<string, number>();
    orderedIds.forEach((id, i) => orderById.set(id, slots[i]!));
    const next = current.map((f) => (orderById.has(f.id) ? { ...f, order: orderById.get(f.id)! } : f));
    saveProcessingFolders(next, orgId);
}

export function hideProcessingFolder(id: string, orgId?: string | null): void {
    const folder = getProcessingFoldersSnapshot(orgId).find((f) => f.id === id);
    if (!folder) return;
    if (folder.isSystem) throw new Error("System folders cannot be hidden.");
    updateProcessingFolder(id, { hidden: true }, orgId);
}
