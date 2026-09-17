"use client";

/**
 * THE CURRENT WORK WORKSPACE STATE, OWNED ONCE.
 *
 * `BusinessProcessCard` executes every configured command the same way: it asks its host to open the
 * Current Work workspace, and the workspace mounts `CurrentWorkCard` which hosts the action panel
 * and, for a communication action, the canonical composer. The card therefore cannot run ANY action
 * on a host that does not implement that opener — and the call site is
 * `coordination?.openCurrentWorkWorkspace?.(…)`, so a missing host is not an error, it is silence.
 *
 * Measured: the durable child record rendered the Process card with `Send enrollment paperwork`
 * enabled, and clicking it produced no execute request, no panel, no composer and no error, because
 * the contextual card passed no coordination at all.
 *
 * This state lived inside `OpportunityFocusPanelModeGrid`, which is why only that host could execute.
 * It is lifted here UNCHANGED — the same three callbacks and the same two resets — so the grid keeps
 * the behaviour it had and any other host of the same card can have it too. Lifting rather than
 * reimplementing is the point: a second copy would drift, and the drift would show up as an action
 * that works on one surface and dies on another, which is exactly the defect this closes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
    FocusPanelCurrentWorkWorkspaceIntent,
    FocusPanelCurrentWorkWorkspaceState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

export type CurrentWorkWorkspaceCoordination = {
    currentWorkWorkspace: FocusPanelCurrentWorkWorkspaceState;
    openCurrentWorkWorkspace: (intent?: FocusPanelCurrentWorkWorkspaceIntent | null) => void;
    closeCurrentWorkWorkspace: () => void;
    clearCurrentWorkWorkspaceIntent: () => void;
};

export function useCurrentWorkWorkspaceCoordination(input: {
    /**
     * The active panel mode. Leaving Work/summary closes the workspace so identity-card composition
     * is restored later. A host with no modes passes "summary" and the reset never fires.
     */
    mode: FocusPanelMode;
    /**
     * Attention identity (queue row / subject), NOT a resolved family opportunity id. Child Waitlist
     * truth enrichment flips a drawer id from process-instance to family opportunity without changing
     * Attention, and resetting on the drawer id closed Current Work mid-open — the Message and Tour
     * Invitation composers vanished as they painted.
     */
    subjectId: string;
}): CurrentWorkWorkspaceCoordination {
    const [currentWorkWorkspace, setCurrentWorkWorkspace] = useState<FocusPanelCurrentWorkWorkspaceState>({
        open: false,
        intent: null,
    });

    const openCurrentWorkWorkspace = useCallback(
        (intent: FocusPanelCurrentWorkWorkspaceIntent | null = { kind: "drill_in" }) => {
            setCurrentWorkWorkspace({ open: true, intent: intent ?? { kind: "drill_in" } });
        },
        [],
    );
    const closeCurrentWorkWorkspace = useCallback(() => {
        setCurrentWorkWorkspace({ open: false, intent: null });
    }, []);
    const clearCurrentWorkWorkspaceIntent = useCallback(() => {
        setCurrentWorkWorkspace((prev) => (prev.intent ? { ...prev, intent: null } : prev));
    }, []);

    const { mode, subjectId } = input;
    useEffect(() => {
        if (mode !== "summary" && mode !== "work") {
            setCurrentWorkWorkspace({ open: false, intent: null });
        }
    }, [mode]);

    /*
     * Skip the initial mount: the grid remounts on context enrich, and a mount-time reset collapsed a
     * just-opened workspace before the composer could paint.
     */
    const prevSubjectIdRef = useRef<string | null>(null);
    useEffect(() => {
        const prev = prevSubjectIdRef.current;
        prevSubjectIdRef.current = subjectId;
        if (prev == null || prev === subjectId) return;
        setCurrentWorkWorkspace({ open: false, intent: null });
    }, [subjectId]);

    return {
        currentWorkWorkspace,
        openCurrentWorkWorkspace,
        closeCurrentWorkWorkspace,
        clearCurrentWorkWorkspaceIntent,
    };
}
