"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LayoutEditorBlockEditMode } from "@/lib/layout/layoutEditorBlockConfig";
import {
    LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT,
    LAYOUT_RUNTIME_DRAWER_SAVED_EVENT,
} from "@/lib/layout/runtime/layoutRuntimeDrawerBlockEditEvents";

type LayoutRuntimeBlockEditContextValue = {
    editMode: LayoutEditorBlockEditMode;
    blockEditing: boolean;
    setBlockEditing: (editing: boolean) => void;
};

const LayoutRuntimeBlockEditContext = createContext<LayoutRuntimeBlockEditContextValue | null>(null);

export function LayoutRuntimeBlockEditProvider({
    editMode,
    children,
}: {
    editMode: LayoutEditorBlockEditMode;
    children: ReactNode;
}) {
    const [blockEditing, setBlockEditing] = useState(false);

    useEffect(() => {
        const exitEditMode = () => setBlockEditing(false);
        window.addEventListener(LAYOUT_RUNTIME_DRAWER_SAVED_EVENT, exitEditMode);
        window.addEventListener(LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT, exitEditMode);
        return () => {
            window.removeEventListener(LAYOUT_RUNTIME_DRAWER_SAVED_EVENT, exitEditMode);
            window.removeEventListener(LAYOUT_RUNTIME_DRAWER_REVERTED_EVENT, exitEditMode);
        };
    }, []);

    const value = useMemo(
        (): LayoutRuntimeBlockEditContextValue => ({
            editMode,
            blockEditing,
            setBlockEditing,
        }),
        [editMode, blockEditing],
    );
    return <LayoutRuntimeBlockEditContext.Provider value={value}>{children}</LayoutRuntimeBlockEditContext.Provider>;
}

export function useLayoutRuntimeBlockEdit(): LayoutRuntimeBlockEditContextValue | null {
    return useContext(LayoutRuntimeBlockEditContext);
}

export function layoutRuntimeBlockAllowsFieldEdit(ctx: LayoutRuntimeBlockEditContextValue | null): boolean {
    if (!ctx) return false;
    if (ctx.editMode === "display_only") return false;
    return ctx.blockEditing;
}
