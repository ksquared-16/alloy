"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    FOCUS_PANEL_MODE_SESSION_KEY,
    type FocusPanelMode,
    drawerTabToFocusPanelMode,
    isFocusPanelMode,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

function readSessionMode(): FocusPanelMode | null {
    if (typeof sessionStorage === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(FOCUS_PANEL_MODE_SESSION_KEY);
        return isFocusPanelMode(raw) ? raw : null;
    } catch {
        return null;
    }
}

function writeSessionMode(mode: FocusPanelMode): void {
    if (typeof sessionStorage === "undefined") return;
    try {
        sessionStorage.setItem(FOCUS_PANEL_MODE_SESSION_KEY, mode);
    } catch {
        /* non-fatal */
    }
}

type Options = {
    /** When the subject record id changes, scroll body resets but mode persists. */
    subjectId: string | null | undefined;
    /** Optional scroll container ref for reset-on-swap. */
    bodyScrollRef?: React.RefObject<HTMLElement | null>;
};

/**
 * Focus Panel mode state — persists across warm record swaps; resets body scroll on swap.
 */
export function useFocusPanelMode({ subjectId, bodyScrollRef }: Options) {
    const [mode, setModeState] = useState<FocusPanelMode>(() => readSessionMode() ?? "summary");
    const previousSubjectRef = useRef<string | null>(null);

    const setMode = useCallback((next: FocusPanelMode) => {
        setModeState(next);
        writeSessionMode(next);
    }, []);

    const selectFromDrawerTab = useCallback((tab: string) => {
        setMode(drawerTabToFocusPanelMode(tab));
    }, [setMode]);

    useEffect(() => {
        const id = subjectId?.trim() || null;
        const prev = previousSubjectRef.current;
        previousSubjectRef.current = id;
        if (!id || !prev || id === prev) return;
        const el =
            bodyScrollRef?.current ??
            document.querySelector<HTMLElement>("[data-adminv2-record-modal-scroll]");
        if (el) el.scrollTop = 0;
    }, [subjectId, bodyScrollRef]);

    return { mode, setMode, selectFromDrawerTab };
}
