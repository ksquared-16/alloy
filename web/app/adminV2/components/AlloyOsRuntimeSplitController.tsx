"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import {
    ALLOY_OS_RUNTIME_ATTR,
    ALLOY_OS_RUNTIME_ENABLED,
    ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR,
    ALLOY_OS_RUNTIME_SPLIT_ATTR,
    alloyOsRuntimeSplitActive,
    isWorkUnitQueueSurfacePath,
    shouldClearFocusPanelOnPerspectiveChange,
} from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import { runtimePerspectiveAttrValue } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import { measureAndApplyDrawerWorkspaceGeometry } from "@/lib/bos/drawerWorkspaceGeometry";
import AlloyOsLayoutSurfaceDiagnostics from "./AlloyOsLayoutSurfaceDiagnostics";

import "./alloyOsRuntime.css";

/**
 * Drives the Alloy OS runtime root attributes (first slice). Renders nothing.
 *
 * - `data-alloy-os-runtime="on"`         — token layer; set whenever the flag is enabled.
 * - `data-alloy-os-runtime-perspective`  — `<workUnitId>:<perspectiveKey>` while a Perspective is active.
 * - `data-alloy-os-runtime-split="true"` — State 2 (compressed queue + docked Focus Panel), set when:
 *     • the runtime flag is on,
 *     • an active RuntimePerspective exists (URL, pill, bootstrap, or default — not `?queue=tours`),
 *     • the Focus Panel / drawer is open,
 *     • the current surface is a work-unit surface.
 *
 * No-op when `NEXT_PUBLIC_ALLOY_OS_RUNTIME` is unset. Touches no data/VM/reveal/queue-state
 * contract — purely presentational root attributes driven by runtime state.
 */
export default function AlloyOsRuntimeSplitController() {
    const drawerCtx = useAdminDrawerOptional();
    const pathname = usePathname();
    const perspective = useActiveRuntimePerspective();

    const drawerOpen = drawerCtx?.drawer?.type != null;
    const onWorkUnitSurface = isWorkUnitQueueSurfacePath(pathname);
    const perspectiveAttr = runtimePerspectiveAttrValue(perspective);

    // Token layer: opt the document in whenever the flag is enabled.
    useEffect(() => {
        if (!ALLOY_OS_RUNTIME_ENABLED) return;
        const root = document.documentElement;
        root.setAttribute(ALLOY_OS_RUNTIME_ATTR, "on");
        return () => {
            root.removeAttribute(ALLOY_OS_RUNTIME_ATTR);
        };
    }, []);

    // Active Perspective marker (diagnostic + scoping) — driven by runtime state, not URL.
    useEffect(() => {
        if (!ALLOY_OS_RUNTIME_ENABLED) return;
        const root = document.documentElement;
        if (perspectiveAttr) {
            root.setAttribute(ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR, perspectiveAttr);
        } else {
            root.removeAttribute(ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR);
        }
        return () => {
            root.removeAttribute(ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR);
        };
    }, [perspectiveAttr]);

    const splitActive = alloyOsRuntimeSplitActive({
        perspectiveActive: Boolean(perspectiveAttr),
        drawerOpen,
        onWorkUnitSurface,
    });

    // Concept B "Perspective change": when the active Perspective changes while the
    // Focus Panel is open, close the panel + clear selection and reset queue scroll to
    // top. A perspective is a context shift, not a record swap — opening/swapping
    // records keeps the same perspective key, so this never fires on record nav.
    const previousPerspectiveAttrRef = useRef<string | null>(perspectiveAttr);
    useEffect(() => {
        if (!ALLOY_OS_RUNTIME_ENABLED) return;
        const previous = previousPerspectiveAttrRef.current;
        previousPerspectiveAttrRef.current = perspectiveAttr;
        const shouldClear = shouldClearFocusPanelOnPerspectiveChange({
            previousPerspectiveKey: previous,
            nextPerspectiveKey: perspectiveAttr,
            drawerOpen,
        });
        if (!shouldClear) return;
        drawerCtx?.closeDrawer();
        const scrollport = document.querySelector<HTMLElement>(
            '[data-workspace-queue-scrollport="true"]'
        );
        if (scrollport) scrollport.scrollTop = 0;
        // drawerCtx intentionally excluded — closeDrawer identity is stable and we only
        // want this to run on a perspective-key transition, not on drawer state changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [perspectiveAttr]);

    // State 2: active Perspective + open Focus Panel on a work-unit surface.
    // useLayoutEffect so the attribute exists BEFORE drawer geometry measures (same frame).
    useLayoutEffect(() => {
        if (!ALLOY_OS_RUNTIME_ENABLED) return;
        const root = document.documentElement;
        if (splitActive) {
            root.setAttribute(ALLOY_OS_RUNTIME_SPLIT_ATTR, "true");
            measureAndApplyDrawerWorkspaceGeometry(root);
        } else {
            root.removeAttribute(ALLOY_OS_RUNTIME_SPLIT_ATTR);
            measureAndApplyDrawerWorkspaceGeometry(root);
        }
        return () => {
            root.removeAttribute(ALLOY_OS_RUNTIME_SPLIT_ATTR);
        };
    }, [splitActive]);

    // Re-measure on drawer open/close while split is already active (perspective unchanged).
    useLayoutEffect(() => {
        if (!ALLOY_OS_RUNTIME_ENABLED || !splitActive) return;
        measureAndApplyDrawerWorkspaceGeometry();
    }, [splitActive, drawerOpen]);

    // Operational surface anchors (System 1.5). The Work Unit Context (control deck) is sticky
    // (CSS), so its viewport top/bottom are stable across scroll. We publish two measured anchors
    // while split is active and restore stylesheet defaults on exit:
    //   • --alloy-os-op-surface-top  = deck BOTTOM → shared top Y for Queue · Focus Panel · BOS.
    //   • --alloy-os-op-surface-col-top = deck TOP → primary-column top (drives the column height
    //     so the queue stretches to the shared bottom Y).
    // Bottom safe-area + the derived heights live in CSS (`--alloy-os-op-surface-bottom` /
    // `-height` / `-col-height`).
    //
    // IMPORTANT: we intentionally do NOT override `--adminv2-drawer-inset-top` here. Doing so fed
    // `--adminv2-workspace-rail-height = calc(100vh - inset-top - …)`, which shrank the primary
    // column (and the queue) by the full Work Unit Context height — the queue stopped early. The
    // Focus Panel now positions from `--alloy-os-op-surface-top` directly, so the inset override
    // is unnecessary and harmful in split.
    useEffect(() => {
        if (!ALLOY_OS_RUNTIME_ENABLED || !splitActive) return;
        const root = document.documentElement;
        const apply = () => {
            const deck = document.querySelector<HTMLElement>(ALLOY_OS_CONTROL_DECK_SELECTOR);
            if (!deck) return;
            const rect = deck.getBoundingClientRect();
            const top = Math.round(rect.top);
            const bottom = Math.round(rect.bottom);
            const right = Math.round(rect.right);
            if (bottom > 0) {
                root.style.setProperty(ALLOY_OS_OP_SURFACE_TOP_VAR, `${bottom}px`);
                root.style.setProperty(ALLOY_OS_OP_SURFACE_COL_TOP_VAR, `${Math.max(0, top)}px`);
            }
            // The Focus Panel right edge must align with the Work Unit Context right edge so
            // both regions end at the same X (the WUC layout is authoritative). Publish the
            // measured deck right; the panel ends here, not at the BOS-derived band right.
            if (right > 0) {
                root.style.setProperty(ALLOY_OS_OP_SURFACE_RIGHT_VAR, `${right}px`);
            }
        };
        const raf = requestAnimationFrame(apply);
        window.addEventListener("resize", apply);
        const deck = document.querySelector<HTMLElement>(ALLOY_OS_CONTROL_DECK_SELECTOR);
        const ro = deck && "ResizeObserver" in window ? new ResizeObserver(apply) : null;
        if (deck && ro) ro.observe(deck);
        // The deck top can also shift on scroll within the surface; keep it fresh cheaply.
        const scrollSurface = document.querySelector(".adminv2-workspace-scroll-surface");
        scrollSurface?.addEventListener("scroll", apply, { passive: true });
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", apply);
            scrollSurface?.removeEventListener("scroll", apply);
            ro?.disconnect();
            root.style.removeProperty(ALLOY_OS_OP_SURFACE_TOP_VAR);
            root.style.removeProperty(ALLOY_OS_OP_SURFACE_COL_TOP_VAR);
            root.style.removeProperty(ALLOY_OS_OP_SURFACE_RIGHT_VAR);
        };
    }, [splitActive]);

    return <AlloyOsLayoutSurfaceDiagnostics />;
}

/** Fixed work-unit header (title + KPI strip + pills + filters). */
const ALLOY_OS_CONTROL_DECK_SELECTOR =
    '[data-ws-surface="work_unit"].adminv2-ws-wu-v2 .adminv2-ws-dept-v2-control-deck';

/** Operational-surface top var — shared top Y for Queue · Focus Panel · BOS (System 1.5). */
const ALLOY_OS_OP_SURFACE_TOP_VAR = "--alloy-os-op-surface-top";

/** Operational-surface column top var — primary-column top (drives queue column height). */
const ALLOY_OS_OP_SURFACE_COL_TOP_VAR = "--alloy-os-op-surface-col-top";

/** Operational-surface right var — Work Unit Context right edge; Focus Panel ends here. */
const ALLOY_OS_OP_SURFACE_RIGHT_VAR = "--alloy-os-op-surface-right";
