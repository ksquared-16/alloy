"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AdminV2OpportunityWorkUnitPage from "@/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page";
import { WorkUnitSlugRouteProvider, type WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";
import {
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import { syncOperatorWorkUnitUrlInBrowser } from "@/lib/admin/operatorWorkUnitDrawerUrlSync";
import {
    peekWorkUnitSlugRouteCache,
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";
import { tracePlatformDrawerVm, tracePlatformRouteLoad } from "@/lib/perf/platformSurfacePerfTrace";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

type ResolvedPayload = {
    kind: "work_unit_key" | "queue_lane_key";
    route_slug: string;
    work_unit_id: string;
    department_id: string;
    work_unit_key: string;
    work_unit_name: string;
    initial_queue_key: string | null;
};

type HostState =
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; value: WorkUnitSlugRouteValue };

function cacheEntryFromPayload(json: ResolvedPayload): WorkUnitSlugRouteCacheEntry {
    return {
        routeSlug: json.route_slug,
        departmentId: json.department_id,
        workUnitId: json.work_unit_id,
        workUnitKey: json.work_unit_key,
        workUnitName: json.work_unit_name,
        initialQueueKey: json.initial_queue_key,
    };
}

function readyStateFromCache(entry: WorkUnitSlugRouteCacheEntry): HostState {
    return {
        phase: "ready",
        value: {
            ...entry,
            routeRecordId: null,
        },
    };
}

export default function WorkUnitSlugRouteHost({ workUnitSlug }: { workUnitSlug: string }) {
    const pathname = usePathname();
    const { openDrawer, drawer } = useAdminDrawer();
    const initialCache = useMemo(() => peekWorkUnitSlugRouteCache(workUnitSlug), [workUnitSlug]);
    const [state, setState] = useState<HostState>(() =>
        initialCache ? readyStateFromCache(initialCache) : { phase: "loading" },
    );
    const deepLinkOpenedRef = useRef<string | null>(null);
    const slugKey = useMemo(() => workUnitRouteSlugToKey(workUnitSlug), [workUnitSlug]);

    const routeRecordIdFromPath = useMemo(() => {
        const canonical = normalizeOperatorPathname(pathname);
        return parseOperatorWorkUnitPath(canonical).recordId;
    }, [pathname]);

    useEffect(() => {
        let cancelled = false;
        const cached = peekWorkUnitSlugRouteCache(workUnitSlug);
        if (cached) {
            tracePlatformRouteLoad("wu_slug_cache_hit", { work_unit_slug: workUnitSlug });
            setState(readyStateFromCache(cached));
            return;
        }

        tracePlatformRouteLoad("wu_slug_fetch_start", { work_unit_slug: workUnitSlug });
        setState({ phase: "loading" });

        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/work-units/by-slug/${encodeURIComponent(workUnitSlug)}`,
                    { credentials: "include" },
                );
                if (cancelled) return;

                if (res.status === 404) {
                    setState({ phase: "error", message: "Work unit not found." });
                    return;
                }
                if (res.status === 409) {
                    setState({
                        phase: "error",
                        message: "This work unit name exists in more than one department. Contact an admin to rename or disambiguate.",
                    });
                    return;
                }
                if (!res.ok) {
                    setState({ phase: "error", message: "Could not load work unit." });
                    return;
                }

                const json = (await res.json()) as ResolvedPayload;
                const entry = cacheEntryFromPayload(json);
                putWorkUnitSlugRouteCache(workUnitSlug, entry);
                tracePlatformRouteLoad("wu_slug_fetch_ready", {
                    work_unit_slug: workUnitSlug,
                    work_unit_id: entry.workUnitId,
                });
                setState(readyStateFromCache(entry));
            } catch {
                if (!cancelled) {
                    setState({ phase: "error", message: "Could not load work unit." });
                }
            }
        })();

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
        return (
            <div className="flex min-h-[12rem] items-center justify-center text-sm text-alloy-midnight/60">
                Loading work unit…
            </div>
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
