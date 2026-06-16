"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LayoutEditorBlockEditMode } from "@/lib/layout/layoutEditorBlockConfig";

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
    const [blockEditing, setBlockEditing] = useState(editMode === "inline_editable");
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
    if (!ctx) return true;
    if (ctx.editMode === "display_only") return false;
    if (ctx.editMode === "inline_editable") return true;
    return ctx.blockEditing;
}
