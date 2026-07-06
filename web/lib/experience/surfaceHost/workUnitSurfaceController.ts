"use client";

/**
 * Work Unit surface controller (Surface Host, Phase 2B Step 1).
 *
 * Lifts `WorkUnitSlugRouteHost`'s behavior — slug identity resolution (server seed + client warm),
 * record deep-link `openDrawer`, and drawer URL sync — into a reusable, Host-ownable hook. Behavior
 * is preserved EXACTLY; `WorkUnitSlugRouteHost` now renders from this controller's state. Once the
 * Surface Host mounts the work-unit surface (Step 3), it drives the SAME controller, so identity,
 * deep links, and record opening are byte-identical whether the surface is route- or Host-rendered.
 *
 * The record-opening + URL-sync DECISIONS are extracted as pure functions below (tested) so the
 * load-bearing behavior — the thing that must never break — is verifiable without the DOM.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import { syncOperatorWorkUnitUrlInBrowser } from "@/lib/admin/operatorWorkUnitDrawerUrlSync";
import { isLeavingWorkUnitSurface } from "@/lib/admin/workUnitOutboundHold";
import { warmWorkUnitSlugRoute } from "@/lib/admin/operatorWorkUnitEntryWarm";
import {
    peekWorkUnitSlugRouteCache,
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";
import { tracePlatformDrawerVm } from "@/lib/perf/platformSurfacePerfTrace";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";
import type { WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";

// ── Pure helpers (the load-bearing decisions — tested) ──────────────────────────────────────

/** The `:recordId` segment of the current work-unit URL, or null. */
export function routeRecordIdFromPathname(pathname: string): string | null {
    return parseOperatorWorkUnitPath(normalizeOperatorPathname(pathname)).recordId;
}

export type DeepLinkRecordAction =
    | { kind: "none" }
    /** The URL record is already the open drawer — mark handled, do NOT re-open. */
    | { kind: "mark-open"; recordId: string }
    /** Open the drawer for the URL record (a genuine deep link). */
    | { kind: "open"; recordId: string };

/**
 * Deep-link record open decision — mirrors WorkUnitSlugRouteHost exactly. Only opens once per
 * record, never re-opens the record already shown, and only when the surface identity is ready.
 */
export function resolveDeepLinkRecordAction(args: {
    ready: boolean;
    routeRecordId: string | null;
    alreadyOpenedRecordId: string | null;
    drawerType: string | null;
    drawerId: string | number | null;
}): DeepLinkRecordAction {
    if (!args.ready || !args.routeRecordId) return { kind: "none" };
    if (args.alreadyOpenedRecordId === args.routeRecordId) return { kind: "none" };
    if (args.drawerType === "opportunities" && String(args.drawerId) === args.routeRecordId) {
        return { kind: "mark-open", recordId: args.routeRecordId };
    }
    return { kind: "open", recordId: args.routeRecordId };
}

/** The recordId the URL should carry for the current drawer (opportunity drawer only). */
export function resolveUrlSyncRecordId(
    drawerType: string | null,
    drawerId: string | number | null,
): string | null {
    return drawerType === "opportunities" && drawerId != null ? String(drawerId) : null;
}

/** Cold-shell title from a cache entry — configured names only, never a slug-fabricated label. */
export function coldShellTitleFromCache(cache: WorkUnitSlugRouteCacheEntry | null): string {
    return cache?.departmentName ?? cache?.workUnitName ?? "";
}

// ── Controller state + hook ─────────────────────────────────────────────────────────────────

export type WorkUnitSurfaceControllerState =
    | {
          phase: "loading";
          /** URL has already left this work unit — hold (render nothing), never a foreign cold shell. */
          isLeaving: boolean;
          coldShell: { workUnitTitle: string; departmentId?: string };
      }
    | { phase: "error"; message: string }
    | { phase: "ready"; providerValue: WorkUnitSlugRouteValue };

type HostState =
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; value: WorkUnitSlugRouteValue };

function readyStateFromCache(entry: WorkUnitSlugRouteCacheEntry): HostState {
    return { phase: "ready", value: { ...entry, routeRecordId: null } };
}

/**
 * The Work Unit surface controller. Resolves identity, opens deep-link records, and syncs the URL —
 * identical to the prior `WorkUnitSlugRouteHost` inline logic. Consumers render from the returned state.
 */
export function useWorkUnitSurfaceController({
    workUnitSlug,
    initialRouteMeta = null,
}: {
    workUnitSlug: string;
    initialRouteMeta?: WorkUnitSlugRouteCacheEntry | null;
}): WorkUnitSurfaceControllerState {
    const pathname = usePathname();
    const { openDrawer, drawer } = useAdminDrawer();
    const initialCache = useMemo(
        () => peekWorkUnitSlugRouteCache(workUnitSlug) ?? initialRouteMeta,
        [workUnitSlug, initialRouteMeta],
    );
    const [state, setState] = useState<HostState>(() =>
        initialCache ? readyStateFromCache(initialCache) : { phase: "loading" },
    );
    const deepLinkOpenedRef = useRef<string | null>(null);
    const slugKey = useMemo(() => workUnitRouteSlugToKey(workUnitSlug), [workUnitSlug]);

    const routeRecordId = useMemo(() => routeRecordIdFromPathname(pathname), [pathname]);

    // Seed the module cache from the server-resolved identity BEFORE the fallback fetch effect runs.
    useEffect(() => {
        if (initialRouteMeta) putWorkUnitSlugRouteCache(workUnitSlug, initialRouteMeta);
    }, [workUnitSlug, initialRouteMeta]);

    useEffect(() => {
        let cancelled = false;
        const cached = peekWorkUnitSlugRouteCache(workUnitSlug);
        if (cached) {
            setState(readyStateFromCache(cached));
            return;
        }
        setState({ phase: "loading" });
        void warmWorkUnitSlugRoute(workUnitSlug, "route_host").then(({ entry, errorMessage }) => {
            if (cancelled) return;
            if (entry) {
                setState(readyStateFromCache(entry));
                return;
            }
            setState({ phase: "error", message: errorMessage ?? "Could not load work unit." });
        });
        return () => {
            cancelled = true;
        };
    }, [workUnitSlug]);

    // Record deep-link open — open the URL's record once, never re-open the record already shown.
    useEffect(() => {
        const action = resolveDeepLinkRecordAction({
            ready: state.phase === "ready",
            routeRecordId,
            alreadyOpenedRecordId: deepLinkOpenedRef.current,
            drawerType: drawer.type,
            drawerId: drawer.id ?? null,
        });
        if (action.kind === "none") return;
        deepLinkOpenedRef.current = action.recordId;
        if (action.kind === "open") {
            tracePlatformDrawerVm("wu_slug_deeplink_open", { opportunity_id: action.recordId });
            openDrawer({ type: "opportunities", id: action.recordId, source: "workspace_slug_record_url" });
        }
    }, [drawer.id, drawer.type, openDrawer, routeRecordId, state.phase]);

    // URL sync — append/strip the :recordId for the open opportunity drawer (replaceState).
    useEffect(() => {
        if (state.phase !== "ready") return;
        syncOperatorWorkUnitUrlInBrowser(slugKey, resolveUrlSyncRecordId(drawer.type, drawer.id ?? null));
    }, [drawer.id, drawer.type, slugKey, state.phase]);

    if (state.phase === "loading") {
        const cached = peekWorkUnitSlugRouteCache(workUnitSlug);
        return {
            phase: "loading",
            isLeaving: isLeavingWorkUnitSurface(pathname, workUnitSlug),
            coldShell: {
                workUnitTitle: coldShellTitleFromCache(cached),
                departmentId: cached?.departmentId,
            },
        };
    }
    if (state.phase === "error") {
        return { phase: "error", message: state.message };
    }
    return { phase: "ready", providerValue: { ...state.value, routeRecordId } };
}
