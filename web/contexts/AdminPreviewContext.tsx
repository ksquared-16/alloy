"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import type { AdminDrawerEntityType } from "./AdminDrawerContext";

export type PreviewAnchor = { top: number; left: number; right: number; bottom: number; width: number; height: number };

/** Optional: actual click position for contextual panel placement. */
export type PreviewClickPosition = { x: number; y: number };

export interface PreviewState {
    type: AdminDrawerEntityType;
    id: string;
    anchor: PreviewAnchor;
    /** When provided, used for viewport-aware placement (left/right half, vertical alignment). */
    clickPosition?: PreviewClickPosition;
}

interface AdminPreviewContextValue {
    preview: PreviewState | null;
    openPreview: (params: { type: AdminDrawerEntityType; id: string; anchor: PreviewAnchor; clickPosition?: PreviewClickPosition }) => void;
    closePreview: () => void;
}

const AdminPreviewContext = createContext<AdminPreviewContextValue | null>(null);

export function useAdminPreview() {
    const ctx = useContext(AdminPreviewContext);
    if (!ctx) throw new Error("useAdminPreview must be used within AdminPreviewProvider");
    return ctx;
}

export function AdminPreviewProvider({ children }: { children: ReactNode }) {
    const [preview, setPreview] = useState<PreviewState | null>(null);

    const openPreview = useCallback((params: { type: AdminDrawerEntityType; id: string; anchor: PreviewAnchor; clickPosition?: PreviewClickPosition }) => {
        setPreview({ type: params.type, id: params.id, anchor: params.anchor, clickPosition: params.clickPosition });
    }, []);

    const closePreview = useCallback(() => {
        setPreview(null);
    }, []);

    return (
        <AdminPreviewContext.Provider value={{ preview, openPreview, closePreview }}>
            {children}
        </AdminPreviewContext.Provider>
    );
}
