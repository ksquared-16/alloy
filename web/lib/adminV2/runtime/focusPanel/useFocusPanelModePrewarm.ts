"use client";

import { useEffect, useRef } from "react";

import {
    FOCUS_PANEL_MODES,
    type FocusPanelMode,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { perfAlloyOsRuntimeMark } from "@/lib/perf/adminV2PerfLog";

/**
 * Non-active modes to prewarm, in stable priority order, excluding the active mode.
 * Active mode always wins (it is interactive first); these warm in the background after.
 */
export function selectFocusPanelModesToPrewarm(active: FocusPanelMode): FocusPanelMode[] {
    return FOCUS_PANEL_MODES.filter((mode) => mode !== active);
}

type Params = {
    enabled: boolean;
    activeMode: FocusPanelMode;
    subjectId: string | null;
    /**
     * Optional per-mode data prewarm callbacks (reuse existing prefetch helpers).
     * Summary/Work are VM-derived and typically need no callback; Activity warms legacy tab metadata
     * plus family-workspace VM prefetch when V2 flags are on (immediate when active, idle when not).
     */
    prewarm?: Partial<Record<FocusPanelMode, () => void>>;
};

/**
 * Focus Panel mode prewarm orchestration.
 *
 * 1. Active mode is interactive immediately (Summary is instant): emit `focus_panel_opened`
 *    once per subject and `focus_panel_mode_ready` for the active mode.
 * 2. After a short idle, prewarm each non-active mode's metadata (deduped helpers) so switching
 *    feels instant, then emit `focus_panel_mode_ready` for each.
 *
 * Resets per subject so a new operational subject re-warms. Does not change `useFocusPanelMode`
 * session behavior; it only schedules background warming + observational marks.
 */
export function useFocusPanelModePrewarm({ enabled, activeMode, subjectId, prewarm }: Params): void {
    const openedSubjectRef = useRef<string | null>(null);
    const warmedSubjectRef = useRef<string | null>(null);
    const activeReadySubjectRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled || !subjectId) return;

        if (openedSubjectRef.current !== subjectId) {
            openedSubjectRef.current = subjectId;
            perfAlloyOsRuntimeMark("focus_panel_opened", { entity_id: subjectId });
        }

        // Active mode is ready as soon as it paints — warm its own data immediately (active wins).
        const activeKey = `${subjectId}:${activeMode}`;
        if (activeReadySubjectRef.current !== activeKey) {
            activeReadySubjectRef.current = activeKey;
            try {
                prewarm?.[activeMode]?.();
            } catch {
                /* non-fatal */
            }
            perfAlloyOsRuntimeMark("focus_panel_mode_ready", { entity_id: subjectId, tab: activeMode });
        }

        if (warmedSubjectRef.current === subjectId) return;

        const cancel = scheduleAdminV2BackgroundWork(
            () => {
                warmedSubjectRef.current = subjectId;
                for (const mode of selectFocusPanelModesToPrewarm(activeMode)) {
                    try {
                        prewarm?.[mode]?.();
                    } catch {
                        /* non-fatal — warm failures never block mode switch */
                    }
                    perfAlloyOsRuntimeMark("focus_panel_mode_ready", {
                        entity_id: subjectId,
                        tab: mode,
                    });
                }
            },
            { idleTimeoutMs: 1_400, fallbackMs: 600 },
        );

        return cancel;
    }, [enabled, activeMode, subjectId, prewarm]);
}
