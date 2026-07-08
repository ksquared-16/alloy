"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";

/** Card key → nested surface id for in-canvas drill-in composition. */
export const FOCUS_PANEL_CARD_NESTED_SURFACE: Partial<Record<FocusPanelCardKey, string>> = {
    household: HOUSEHOLD_SURFACE_ID,
    children: CHILDREN_SURFACE_ID,
    billing_preview: FINANCIAL_CONFIG_SURFACE_ID,
};

export type FocusPanelComposerDrillDepth =
    | { kind: "surface" }
    | { kind: "contact-edit"; personId: string }
    | { kind: "child-focus"; childId: string }
    | { kind: "child-edit"; childId: string };

export type FocusPanelComposerDrillIn = {
    cardKey: FocusPanelCardKey;
    surfaceId: string;
    depth: FocusPanelComposerDrillDepth;
};

export type FocusPanelComposerSelection =
    | { kind: "card"; cardKey: FocusPanelCardKey }
    | { kind: "region"; surfaceId: string; groupKey: string }
    | { kind: "field"; surfaceId: string; groupKey: string; fieldKey: string };

type FocusPanelComposerContextValue = {
    enabled: boolean;
    drillIn: FocusPanelComposerDrillIn | null;
    selection: FocusPanelComposerSelection | null;
    nestedConfigs: Record<string, NestedSurfaceConfig>;
    enterDrillIn: (cardKey: FocusPanelCardKey, surfaceId: string) => void;
    setDrillDepth: (depth: FocusPanelComposerDrillDepth) => void;
    exitDrillIn: () => void;
    select: (selection: FocusPanelComposerSelection | null) => void;
    configFor: (surfaceId: string) => NestedSurfaceConfig;
    updateConfig: (surfaceId: string, config: NestedSurfaceConfig) => void;
    isComposingSurface: (surfaceId: string) => boolean;
    isComposingGroup: (surfaceId: string, groupKey: string) => boolean;
    /** Edit Mode = composing a nested surface in-place (Surface Composer V3.5). */
    isEditMode: (surfaceId: string) => boolean;
};

const FocusPanelComposerContext = createContext<FocusPanelComposerContextValue | null>(null);

export function useFocusPanelComposer(): FocusPanelComposerContextValue | null {
    return useContext(FocusPanelComposerContext);
}

export function useFocusPanelComposerRequired(): FocusPanelComposerContextValue {
    const ctx = useContext(FocusPanelComposerContext);
    if (!ctx) throw new Error("FocusPanelComposerContext missing");
    return ctx;
}

type ProviderProps = {
    children: ReactNode;
    enabled?: boolean;
    initialNestedConfigs?: Record<string, NestedSurfaceConfig>;
    onNestedConfigsChange?: (configs: Record<string, NestedSurfaceConfig>) => void;
};

export function FocusPanelComposerProvider({
    children,
    enabled = true,
    initialNestedConfigs = {},
    onNestedConfigsChange,
}: ProviderProps) {
    const [drillIn, setDrillIn] = useState<FocusPanelComposerDrillIn | null>(null);
    const [selection, setSelection] = useState<FocusPanelComposerSelection | null>(null);
    const [nestedConfigs, setNestedConfigs] = useState<Record<string, NestedSurfaceConfig>>(initialNestedConfigs);

    const configFor = useCallback(
        (surfaceId: string) =>
            reconcileNestedSurfaceConfig(surfaceId, nestedConfigs[surfaceId] ?? null),
        [nestedConfigs],
    );

    const updateConfig = useCallback(
        (surfaceId: string, config: NestedSurfaceConfig) => {
            const reconciled = reconcileNestedSurfaceConfig(surfaceId, config);
            setNestedConfigs((prev) => {
                const next = { ...prev, [surfaceId]: reconciled };
                onNestedConfigsChange?.(next);
                return next;
            });
        },
        [onNestedConfigsChange],
    );

    const enterDrillIn = useCallback((cardKey: FocusPanelCardKey, surfaceId: string) => {
        setDrillIn({ cardKey, surfaceId, depth: { kind: "surface" } });
        setSelection({ kind: "region", surfaceId, groupKey: defaultGroupForSurface(surfaceId) });
    }, []);

    const setDrillDepth = useCallback((depth: FocusPanelComposerDrillDepth) => {
        setDrillIn((prev) => (prev ? { ...prev, depth } : prev));
    }, []);

    const exitDrillIn = useCallback(() => {
        setDrillIn(null);
        setSelection(null);
    }, []);

    const isComposingSurface = useCallback(
        (surfaceId: string) => Boolean(enabled && drillIn?.surfaceId === surfaceId),
        [enabled, drillIn],
    );

    const isComposingGroup = useCallback(
        (surfaceId: string, groupKey: string) =>
            Boolean(
                enabled &&
                    drillIn?.surfaceId === surfaceId &&
                    selection?.kind === "region" &&
                    selection.surfaceId === surfaceId &&
                    selection.groupKey === groupKey,
            ),
        [enabled, drillIn, selection],
    );

    const isEditMode = isComposingSurface;

    const value = useMemo(
        (): FocusPanelComposerContextValue => ({
            enabled,
            drillIn,
            selection,
            nestedConfigs,
            enterDrillIn,
            setDrillDepth,
            exitDrillIn,
            select: setSelection,
            configFor,
            updateConfig,
            isComposingSurface,
            isComposingGroup,
            isEditMode,
        }),
        [
            enabled,
            drillIn,
            selection,
            nestedConfigs,
            enterDrillIn,
            setDrillDepth,
            exitDrillIn,
            configFor,
            updateConfig,
            isComposingSurface,
            isComposingGroup,
            isEditMode,
        ],
    );

    return <FocusPanelComposerContext.Provider value={value}>{children}</FocusPanelComposerContext.Provider>;
}

function defaultGroupForSurface(surfaceId: string): string {
    if (surfaceId === HOUSEHOLD_SURFACE_ID) return "primary_contact";
    if (surfaceId === CHILDREN_SURFACE_ID) return "roster";
    if (surfaceId === FINANCIAL_CONFIG_SURFACE_ID) return "current_configuration";
    return "identity";
}

export type { SurfaceFieldVisibility };
