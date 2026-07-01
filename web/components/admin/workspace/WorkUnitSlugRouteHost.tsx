"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AdminV2OpportunityWorkUnitPage from "@/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page";
import { WorkUnitWorkspaceColdShell } from "@/components/admin/workspace/WorkUnitWorkspaceColdShell";
import { WorkUnitSlugRouteProvider, type WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";
import {
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import { syncOperatorWorkUnitUrlInBrowser } from "@/lib/admin/operatorWorkUnitDrawerUrlSync";
import { isLeavingWorkUnitSurface } from "@/lib/admin/workUnitOutboundHold";
import {
    humanizeWorkUnitRouteSlug,
    warmWorkUnitSlugRoute,
} from "@/lib/admin/operatorWorkUnitEntryWarm";
import {
    peekWorkUnitSlugRouteCache,
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";
import { tracePlatformDrawerVm } from "@/lib/perf/platformSurfacePerfTrace";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

type HostState =
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; value: WorkUnitSlugRouteValue };

function readyStateFromCache(entry: WorkUnitSlugRouteCacheEntry): HostState {
    return {
        phase: "ready",
        value: {
            ...entry,
            routeRecordId: null,
        },
    };
}

export default function WorkUnitSlugRouteHost({
    workUnitSlug,
    initialRouteMeta = null,
}: {
    workUnitSlug: string;
    /** Server-resolved route identity (Doctrine §1/5) — present → no cold shell; null → client resolves. */
    initialRouteMeta?: WorkUnitSlugRouteCacheEntry | null;
}) {
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

    const routeRecordIdFromPath = useMemo(() => {
        const canonical = normalizeOperatorPathname(pathname);
        return parseOperatorWorkUnitPath(canonical).recordId;
    }, [pathname]);

    // Seed the module cache from the server-resolved identity BEFORE the fallback fetch effect
    // runs (effects fire in declaration order), so the client never issues a by-slug fetch when
    // the server already resolved the route — removing the cold-shell + slug-resolution waterfall.
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

    useEffect(() => {
        if (state.phase !== "ready" || !routeRecordIdFromPath) return;
        if (deepLinkOpenedRef.current === routeRecordIdFromPath) return;
        if (drawer.type === "opportunities" && String(drawer.id) === routeRecordIdFromPath) {
            deepLinkOpenedRef.current = routeRecordIdFromPath;
            return;
        }
        deepLinkOpenedRef.current = routeRecordIdFromPath;
        tracePlatformDrawerVm("wu_slug_deeplink_open", { opportunity_id: routeRecordIdFromPath });
        openDrawer({ type: "opportunities", id: routeRecordIdFromPath, source: "workspace_slug_record_url" });
    }, [drawer.id, drawer.type, openDrawer, routeRecordIdFromPath, state.phase]);

    useEffect(() => {
        if (state.phase !== "ready") return;
        const recordId =
            drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;
        syncOperatorWorkUnitUrlInBrowser(slugKey, recordId);
    }, [drawer.id, drawer.type, slugKey, state.phase]);

    const providerValue = useMemo((): WorkUnitSlugRouteValue | null => {
        if (state.phase !== "ready") return null;
        return {
            ...state.value,
            routeRecordId: routeRecordIdFromPath,
        };
    }, [routeRecordIdFromPath, state]);

    if (state.phase === "loading") {
        // Outbound transition: the URL has already left this work unit (back to Workspace,
        // to a department, or to another work unit). Hold instead of flashing this work
        // unit's cold shell at a foreign path — loading belongs to arrival, never departure
        // (Operational Experience Doctrine, Law 2: Continuity).
        if (isLeavingWorkUnitSurface(pathname, workUnitSlug)) {
            return null;
        }
        const cached = peekWorkUnitSlugRouteCache(workUnitSlug);
        return (
            <WorkUnitWorkspaceColdShell
                workUnitTitle={cached?.workUnitName ?? humanizeWorkUnitRouteSlug(workUnitSlug)}
                departmentId={cached?.departmentId}
                reserveActionsRail
            />
        );
    }

    if (state.phase === "error") {
        return (
            <div
                className="rounded-md border border-alloy-ember/30 bg-alloy-ember/5 px-4 py-3 text-sm text-alloy-ember"
                role="alert"
            >
                {state.message}
            </div>
        );
    }

    if (!providerValue) return null;

    return (
        <WorkUnitSlugRouteProvider value={providerValue}>
            <AdminV2OpportunityWorkUnitPage />
        </WorkUnitSlugRouteProvider>
    );
}
