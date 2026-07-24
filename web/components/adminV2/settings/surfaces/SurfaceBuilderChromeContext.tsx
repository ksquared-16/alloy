"use client";

/**
 * Lets an embedded Surface builder register Save / Publish / Undo / Reset and
 * publication label with the Surfaces shell so chrome can live on the tab row
 * and version can appear in the collection list — not duplicated under the tabs.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

export type SurfaceBuilderChromeRegistration = {
    surfaceId: string;
    /** Shown in the collection list (e.g. "Published v72"). */
    publicationLabel?: string | null;
    dirty?: boolean;
    saving?: boolean;
    publishing?: boolean;
    canUndo?: boolean;
    /** When false, Save draft is hidden (publish-only builders). Default true when onSaveDraft is set. */
    showSaveDraft?: boolean;
    /** When false, Undo / Reset are hidden. Default true when handlers are set. */
    showHistoryControls?: boolean;
    onSaveDraft?: () => void;
    onPublish?: () => void;
    onUndo?: () => void;
    onReset?: () => void;
    saveDisabled?: boolean;
    publishDisabled?: boolean;
};

type SurfaceBuilderChromeContextValue = {
    chrome: SurfaceBuilderChromeRegistration | null;
    registerChrome: (next: SurfaceBuilderChromeRegistration | null) => void;
    /** Latest publication labels by surface id for the collection rail. */
    publicationBySurfaceId: Record<string, string>;
};

const SurfaceBuilderChromeContext = createContext<SurfaceBuilderChromeContextValue | null>(null);

export function SurfaceBuilderChromeProvider({ children }: { children: ReactNode }) {
    const [chrome, setChrome] = useState<SurfaceBuilderChromeRegistration | null>(null);
    const [publicationBySurfaceId, setPublicationBySurfaceId] = useState<Record<string, string>>({});

    const registerChrome = useCallback((next: SurfaceBuilderChromeRegistration | null) => {
        setChrome(next);
        if (next?.surfaceId && next.publicationLabel) {
            const label = next.publicationLabel;
            setPublicationBySurfaceId((prev) => {
                if (prev[next.surfaceId] === label) return prev;
                return { ...prev, [next.surfaceId]: label };
            });
        }
    }, []);

    const value = useMemo(
        () => ({ chrome, registerChrome, publicationBySurfaceId }),
        [chrome, registerChrome, publicationBySurfaceId],
    );

    return (
        <SurfaceBuilderChromeContext.Provider value={value}>{children}</SurfaceBuilderChromeContext.Provider>
    );
}

export function useSurfaceBuilderChromeContext(): SurfaceBuilderChromeContextValue {
    const ctx = useContext(SurfaceBuilderChromeContext);
    if (!ctx) {
        return {
            chrome: null,
            registerChrome: () => undefined,
            publicationBySurfaceId: {},
        };
    }
    return ctx;
}

/**
 * Registers builder chrome with the Surfaces shell for the lifetime of the editor.
 * Clears registration on unmount so tab-row actions do not leak across selections.
 */
export function useRegisterSurfaceBuilderChrome(registration: SurfaceBuilderChromeRegistration) {
    const { registerChrome } = useSurfaceBuilderChromeContext();
    const handlersRef = useRef(registration);
    handlersRef.current = registration;

    const {
        surfaceId,
        publicationLabel,
        dirty,
        saving,
        publishing,
        canUndo,
        showSaveDraft,
        showHistoryControls,
        saveDisabled,
        publishDisabled,
    } = registration;

    useEffect(() => {
        registerChrome({
            surfaceId,
            publicationLabel,
            dirty,
            saving,
            publishing,
            canUndo,
            showSaveDraft,
            showHistoryControls,
            saveDisabled,
            publishDisabled,
            onSaveDraft: handlersRef.current.onSaveDraft
                ? () => handlersRef.current.onSaveDraft?.()
                : undefined,
            onPublish: handlersRef.current.onPublish
                ? () => handlersRef.current.onPublish?.()
                : undefined,
            onUndo: handlersRef.current.onUndo ? () => handlersRef.current.onUndo?.() : undefined,
            onReset: handlersRef.current.onReset ? () => handlersRef.current.onReset?.() : undefined,
        });
        return () => registerChrome(null);
    }, [
        registerChrome,
        surfaceId,
        publicationLabel,
        dirty,
        saving,
        publishing,
        canUndo,
        showSaveDraft,
        showHistoryControls,
        saveDisabled,
        publishDisabled,
    ]);
}
