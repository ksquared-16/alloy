"use client";

import { useCallback, useState } from "react";

export type WorkViewEditorSectionId =
    | "basics"
    | "conditions"
    | "sort"
    | "presentation"
    | "visibility"
    | "advanced";

const DEFAULT_OPEN: Record<WorkViewEditorSectionId, boolean> = {
    basics: true,
    conditions: false,
    sort: false,
    presentation: false,
    visibility: false,
    advanced: false,
};

function storageKey(viewId: string): string {
    return `alloy:cr:work-view-sections:${viewId}`;
}

function readStored(viewId: string): Record<WorkViewEditorSectionId, boolean> {
    if (typeof window === "undefined") return { ...DEFAULT_OPEN };
    try {
        const raw = localStorage.getItem(storageKey(viewId));
        if (!raw) return { ...DEFAULT_OPEN };
        const parsed = JSON.parse(raw) as Partial<Record<WorkViewEditorSectionId, boolean>>;
        return { ...DEFAULT_OPEN, ...parsed };
    } catch {
        return { ...DEFAULT_OPEN };
    }
}

export function useWorkViewEditorSectionState(viewId: string) {
    const [open, setOpen] = useState<Record<WorkViewEditorSectionId, boolean>>(() => readStored(viewId));

    const setSectionOpen = useCallback(
        (section: WorkViewEditorSectionId, isOpen: boolean) => {
            setOpen((prev) => {
                const next = { ...prev, [section]: isOpen };
                try {
                    localStorage.setItem(storageKey(viewId), JSON.stringify(next));
                } catch {
                    /* ignore quota / private mode */
                }
                return next;
            });
        },
        [viewId],
    );

    return { open, setSectionOpen };
}
