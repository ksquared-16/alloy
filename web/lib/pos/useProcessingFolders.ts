"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
    addProcessingFolder,
    getProcessingFoldersSnapshot,
    hideProcessingFolder,
    reorderProcessingFolder,
    reorderProcessingFolders,
    resetProcessingFolders,
    saveProcessingFolders,
    subscribeProcessingFolders,
    updateProcessingFolder,
} from "./processingFolderStore";
import { visibleFoldersForScope, type ProcessingFolderDefinition, type ProcessingFolderScope } from "./processingFolderModel";

export function useProcessingFolders(orgId?: string | null) {
    const folders = useSyncExternalStore(
        subscribeProcessingFolders,
        () => getProcessingFoldersSnapshot(orgId),
        () => getProcessingFoldersSnapshot(orgId)
    );

    const forScope = useCallback(
        (scope: ProcessingFolderScope) => visibleFoldersForScope(folders, scope),
        [folders]
    );

    return {
        folders,
        formFolders: forScope("form"),
        workFolders: forScope("work"),
        categoryFolders: forScope("category"),
        addFolder: (input: Parameters<typeof addProcessingFolder>[0]) => addProcessingFolder(input, orgId),
        updateFolder: (id: string, patch: Parameters<typeof updateProcessingFolder>[1]) =>
            updateProcessingFolder(id, patch, orgId),
        reorderFolder: (id: string, direction: "up" | "down") => reorderProcessingFolder(id, direction, orgId),
        reorderFolders: (orderedIds: string[]) => reorderProcessingFolders(orderedIds, orgId),
        hideFolder: (id: string) => hideProcessingFolder(id, orgId),
        resetFolders: () => resetProcessingFolders(orgId),
        saveFolders: (next: ProcessingFolderDefinition[]) => saveProcessingFolders(next, orgId),
    };
}
