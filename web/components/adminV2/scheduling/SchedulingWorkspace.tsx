"use client";

/**
 * Assignments Workspace — operational command center for Assignments on the shared
 * WorkspaceShell. Consumes Assignment Platform read models; scheduling (room board,
 * ratios) is a property of assignments, not a parallel model.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck } from "lucide-react";

import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import { WS_EYEBROW, WS_OVERVIEW_CONTENT } from "@/components/workspace/workspaceTokens";
import SchedulingWorkspaceShell, { type Site } from "@/app/adminV2/scheduling/SchedulingWorkspaceShell";
import SchedulingKpiStrip from "@/app/adminV2/scheduling/SchedulingKpiStrip";
import DailyRoster from "@/components/adminV2/scheduling/screens/DailyRoster";
import AttendanceWorkspace from "@/components/adminV2/scheduling/screens/AttendanceWorkspace";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import {
    SCHEDULING_SECTION_MODE,
    type SchedulingMode,
    type SchedulingStudioView,
    type SchedulingWorkView,
} from "@/app/adminV2/scheduling/schedulingSections";
import SchedulingOverview, {
    type AssignmentAttentionSummary,
    type OverviewChild,
    type OverviewStart,
    type RosterSummary,
    type TodayActivity,
} from "@/components/adminV2/scheduling/screens/SchedulingOverview";
import SchedulingRoster, {
    type RosterData,
    type RosterFilterKind,
    type RosterFilterContext,
    type RosterViewMode,
} from "@/components/adminV2/scheduling/screens/SchedulingRoster";
import type { AssignmentRosterSubject } from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";
import SchedulingStudio, { type StudioCalculation } from "@/components/adminV2/scheduling/screens/SchedulingStudio";
import type { AssignmentTypeAdminRecord } from "@/lib/operationalAssignments/assignmentTypeService";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import WorkspaceCreateAssignmentModal, {
    type WorkspaceCreateChildCandidate,
} from "@/components/adminV2/scheduling/WorkspaceCreateAssignmentModal";
import {
    ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY,
    type OpenSchedulingModalDetail,
} from "@/lib/adminV2/workspaceModalEvents";
import {
    type StudioPattern,
    type PatternEditorConfig,
    type PatternInput,
    type PatternMutation,
} from "@/components/adminV2/scheduling/screens/SchedulingPatterns";
import {
    emptyAssignmentsWorkspaceTimings,
    markAssignmentsWorkspacePerf,
    measureAssignmentsWorkspacePerf,
    type AssignmentsWorkspaceTimings,
} from "@/lib/adminV2/scheduling/assignmentsWorkspaceRuntime";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";

type OverviewResp = {
    unplaced?: OverviewChild[];
    startsThisWeek?: OverviewStart[];
    activity?: TodayActivity;
    assignmentAttention?: AssignmentAttentionSummary;
};

const EMPTY_STUDIO_CONFIG: PatternEditorConfig = { operatingDays: [], scheduleTypes: [], programs: [] };

/**
 * Map a raw `schedule_patterns` row — the exact `SchedulePatternRow` shape
 * `/api/admin/schedule-patterns` returns to both Studio and Locations →
 * `LocationSchedulePatternsSettingsPanel` (`fetchSchedulePatternsForSite`) — to the
 * Studio pattern shape (metadata preserved). Exported for the convergence test at
 * `tests/adminV2/scheduling/schedulePatternShapeConvergence.test.ts`.
 */
export function mapRawPattern(row: Record<string, any>): StudioPattern {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const weekdays = Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [];
    const defaultDays = Array.isArray(metadata.default_days) ? (metadata.default_days as unknown[]).map(Number) : weekdays;
    const programKeys = Array.isArray(metadata.applicable_program_keys)
        ? (metadata.applicable_program_keys as unknown[]).map(String)
        : [];
    return {
        id: String(row.id),
        key: String(row.key ?? ""),
        label: String(row.label ?? "Schedule"),
        scheduleTypeKey: String(row.schedule_type_key ?? ""),
        weekdays,
        isActive: row.is_active !== false,
        sortOrder: Number(row.sort_order ?? 100),
        metadata,
        hours: readPatternDefaultHours(metadata),
        perDayEnabled: metadata.per_day_enabled === true,
        defaultDays,
        programKeys,
    };
}

/** A unique, schema-valid pattern key (`^[a-z0-9_]{2,64}$`) derived from the label. */
function slugKey(label: string): string {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "pattern";
    return `${base}_${Date.now().toString(36).slice(-5)}`.replace(/[^a-z0-9_]/g, "").slice(0, 64);
}

/** Merge editor fields into a pattern's metadata, preserving existing (v3) keys. */
function buildPatternMeta(base: Record<string, unknown>, data: PatternInput): Record<string, unknown> {
    const meta: Record<string, unknown> = { ...base };
    if (data.hours) meta.hours = { opens_at: data.hours.arrive, closes_at: data.hours.depart };
    else delete meta.hours;
    meta.per_day_enabled = data.perDayEnabled;
    meta.default_days = data.defaultDays;
    meta.applicable_program_keys = data.programKeys;
    return meta;
}

async function patternApi(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`/api/admin/schedule-patterns${path}`, {
        headers: { "content-type": "application/json" },
        ...init,
    });
}

async function schedApi(path: string): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, { headers: { "content-type": "application/json" } });
    return res.json().catch(() => ({}));
}

function addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Client-side mirror of the server's compact week-range label, for optimistic display only. */
function fmtMonthDay(ymd: string): string {
    const [, m, d] = ymd.split("-").map(Number);
    if (!m || !d) return ymd;
    return `${MONTH_SHORT[m - 1]} ${d}`;
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Derive the Overview launch metrics + KPI counts from the roster read-model. */
function deriveRosterSummary(roster: RosterData | null): RosterSummary {
    if (!roster) return { roomsNearCapacity: [], ratioRisks: [], fill: null, roomsInRatio: null };
    const roomsNearCapacity: RosterSummary["roomsNearCapacity"] = [];
    const ratioRisks: RosterSummary["ratioRisks"] = [];
    let totalPeakOcc = 0;
    let totalCap = 0;
    let roomsInRatioCount = 0;

    for (const room of roster.rooms) {
        let peakPct = 0;
        let peakOcc = 0;
        let cap = 0;
        let breached = false;
        for (const cell of room.cells) {
            if (cell.state === "closed") continue;
            if (cell.pct > peakPct) peakPct = cell.pct;
            if ((cell.occupancy ?? 0) > peakOcc) peakOcc = cell.occupancy ?? 0;
            if (cell.capacity != null && cell.capacity > cap) cap = cell.capacity;
            if (cell.state === "breach") {
                breached = true;
                ratioRisks.push({ roomId: room.roomId, roomName: room.roomName, dayLabel: cell.dayLabel });
            }
        }
        if (!breached) roomsInRatioCount += 1;
        if (peakPct >= 85 && !breached) roomsNearCapacity.push({ roomId: room.roomId, roomName: room.roomName, pct: peakPct });
        totalPeakOcc += peakOcc;
        totalCap += cap;
    }

    roomsNearCapacity.sort((a, b) => b.pct - a.pct);
    const fill = totalCap > 0 ? `${Math.round((totalPeakOcc / totalCap) * 100)}%` : null;
    const roomsInRatio = roster.rooms.length > 0 ? `${roomsInRatioCount} / ${roster.rooms.length}` : null;
    return { roomsNearCapacity, ratioRisks, fill, roomsInRatio };
}

export default function SchedulingWorkspace({ onClose }: { onClose?: () => void } = {}) {
    const [sites, setSites] = useState<Site[] | null>(null);
    const [siteId, setSiteId] = useState<string>("");
    /**
     * True once the operator has chosen a site themselves. The bootstrap below
     * SEEDS the initial site; it must never overwrite a deliberate choice. Its
     * retry loop (3 attempts, 400ms apart) can otherwise resolve after the
     * operator has already switched and silently restore the previous site —
     * which is exactly why selecting Riverside appeared not to commit.
     */
    const siteChosenByOperatorRef = useRef(false);

    const [mode, setMode] = useState<SchedulingMode>("work");
    const [workView, setWorkView] = useState<SchedulingWorkView>("overview");
    const [rosterBulkIntent, setRosterBulkIntent] = useState<"assignment" | "room" | null>(null);
    const [studioView, setStudioView] = useState<SchedulingStudioView>("types");
    const [rosterView, setRosterView] = useState<RosterViewMode>("assignments");
    const [focusRoomId, setFocusRoomId] = useState<string | undefined>(undefined);
    const [rosterFilter, setRosterFilter] = useState<RosterFilterKind | null>(null);

    // Deep-link from Focus Panel (Configure Assignment Types) or header Actions.
    useEffect(() => {
        const apply = (detail: OpenSchedulingModalDetail | null) => {
            if (!detail) return;
            if (detail.mode === "studio" || detail.studioView) {
                setMode("studio");
                if (detail.studioView && detail.studioView !== "templates") {
                    setStudioView(detail.studioView);
                } else {
                    setStudioView("types");
                }
            }
            if (detail.mode === "work" || detail.workView) {
                setMode("work");
                if (detail.workView) setWorkView(detail.workView);
            }
        };
        try {
            const raw = sessionStorage.getItem(ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY);
            if (raw) {
                sessionStorage.removeItem(ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY);
                apply(JSON.parse(raw) as OpenSchedulingModalDetail);
            }
        } catch {
            /* ignore */
        }
        const onOpen = (event: Event) => {
            const detail = (event as CustomEvent<OpenSchedulingModalDetail>).detail ?? null;
            apply(detail);
        };
        window.addEventListener("adminv2:open-scheduling-modal", onOpen);
        return () => window.removeEventListener("adminv2:open-scheduling-modal", onOpen);
    }, []);

    const [overview, setOverview] = useState<OverviewResp | null>(null);
    const [roster, setRoster] = useState<RosterData | null>(null);
    const [assignmentRoster, setAssignmentRoster] = useState<AssignmentRosterSubject[] | null>(null);
    const [calculations, setCalculations] = useState<StudioCalculation[] | null>(null);
    const [assignmentTypes, setAssignmentTypes] = useState<AssignmentTypeAdminRecord[] | null>(null);
    const [pickerAssignmentTypes, setPickerAssignmentTypes] = useState<OrgAssignmentTypeOption[] | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createPrefillChildId, setCreatePrefillChildId] = useState<string | null>(null);
    const [studioPatterns, setStudioPatterns] = useState<StudioPattern[] | null>(null);
    const [studioConfig, setStudioConfig] = useState<PatternEditorConfig | null>(null);

    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingRoster, setLoadingRoster] = useState(false);
    const [loadingAssignmentRoster, setLoadingAssignmentRoster] = useState(false);
    const [loadingCalc, setLoadingCalc] = useState(false);
    const [loadingStudio, setLoadingStudio] = useState(false);
    /** Shared site snapshot: true after parallel core loads finish for the active site. */
    const [coreSnapshotReady, setCoreSnapshotReady] = useState(false);
    const [wsTimings, setWsTimings] = useState<AssignmentsWorkspaceTimings>(() =>
        emptyAssignmentsWorkspaceTimings(),
    );
    const siteBootstrapSeqRef = useRef(0);
    const workspaceOpenAtRef = useRef<number | null>(null);

    /** The week currently shown in the roster (weekStart from the last payload). */
    const [weekOf, setWeekOf] = useState<string>("");
    const weekStartRef = useRef<string>("");
    /** Instant label shown the moment an operator clicks week nav, before the fetch resolves. */
    const [optimisticWeekLabel, setOptimisticWeekLabel] = useState<string | null>(null);
    /** True from click until the target week's data is applied — drives the pending-label style. */
    const [weekChangePending, setWeekChangePending] = useState(false);
    /** Dev-only click→ready timing for the roster board, surfaced as a data attribute. */
    const [lastWeekLoadMs, setLastWeekLoadMs] = useState<number | null>(null);
    const weekClickAtRef = useRef<number | null>(null);
    /** Latest-request-wins guard so a fast double-click can't apply a stale response. */
    const rosterRequestSeqRef = useRef(0);
    /** In-memory cache of loaded weeks (by weekStart), so revisits + prefetches are instant. */
    const rosterCacheRef = useRef<Map<string, RosterData>>(new Map());

    // Sites (once) — resolve the operator's site. Retries a transient empty result
    // (e.g. a cold route compile) so the workspace never strands on an unresolved site.
    useEffect(() => {
        workspaceOpenAtRef.current = nowMs();
        markAssignmentsWorkspacePerf("workspace_click");
        markAssignmentsWorkspacePerf("shell_first_paint");
        const shellMs = measureAssignmentsWorkspacePerf(
            "shell_first_paint",
            "workspace_click",
            "shell_first_paint",
        );
        setWsTimings((t) => ({ ...t, shellPaintMs: shellMs }));

        let cancelled = false;
        (async () => {
            for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
                const r = await schedApi(`?view=sites`);
                const list: Site[] = r?.sites ?? [];
                if (list.length > 0) {
                    if (cancelled) return;
                    setSites(list);
                    // Seed only. A late-resolving bootstrap must not clobber the
                    // operator's selection.
                    if (!siteChosenByOperatorRef.current) {
                        setSiteId((prev) =>
                            prev ? prev : ((r.resolvedSiteId as string) || list[0]?.id || "")
                        );
                    }
                    return;
                }
                await new Promise((res) => setTimeout(res, 400));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const loadOverview = useCallback(async (id: string) => {
        setLoadingOverview(true);
        const r = (await schedApi(`?view=overview&site_location_id=${encodeURIComponent(id)}`)) as OverviewResp;
        setOverview(r ?? {});
        setLoadingOverview(false);
    }, []);

    /** Dev-only click→ready timing (console + a data attribute the board renders). */
    const recordWeekReady = useCallback((source: "cache" | "network") => {
        const clickedAt = weekClickAtRef.current;
        if (clickedAt == null) return;
        const elapsed = nowMs() - clickedAt;
        weekClickAtRef.current = null;
        setLastWeekLoadMs(Math.round(elapsed));
        if (process.env.NODE_ENV !== "production") {
            console.debug(`[SchedulingRoster] week ready in ${elapsed.toFixed(0)}ms (${source})`);
        }
    }, []);

    /** Background-fetch a week into the cache without touching visible state (best-effort). */
    const prefetchWeek = useCallback((id: string, week: string) => {
        if (!id || rosterCacheRef.current.has(week)) return;
        schedApi(`?view=roster&site_location_id=${encodeURIComponent(id)}&week_of=${encodeURIComponent(week)}`)
            .then((r) => {
                const d: RosterData | null = r?.roster ?? null;
                if (d?.weekStart) rosterCacheRef.current.set(d.weekStart, d);
            })
            .catch(() => {
                /* best-effort prefetch */
            });
    }, []);

    const loadRoster = useCallback(
        async (id: string, week: string) => {
            const seq = ++rosterRequestSeqRef.current;
            const cacheKey = week || "__current__";
            const cached = rosterCacheRef.current.get(cacheKey);

            // Serve a cached week instantly — keeps the previous board visible with zero
            // blank/loading flash when the operator revisits a recently-seen week.
            if (cached) {
                setRoster(cached);
                weekStartRef.current = cached.weekStart ?? "";
                setOptimisticWeekLabel(null);
                setWeekChangePending(false);
                recordWeekReady("cache");
            } else {
                setLoadingRoster(true);
            }

            const weekParam = week ? `&week_of=${encodeURIComponent(week)}` : "";
            const r = await schedApi(`?view=roster&site_location_id=${encodeURIComponent(id)}${weekParam}`);
            if (seq !== rosterRequestSeqRef.current) return; // superseded by a newer week-change

            const data: RosterData | null = r?.roster ?? null;
            if (data?.weekStart) {
                rosterCacheRef.current.set(data.weekStart, data);
                if (!week) rosterCacheRef.current.set("__current__", data);
            }
            setRoster(data);
            weekStartRef.current = data?.weekStart ?? "";
            setOptimisticWeekLabel(null);
            setWeekChangePending(false);
            setLoadingRoster(false);
            if (!cached) recordWeekReady("network");

            // Prefetch adjacent weeks so the next/previous click is instant.
            if (data?.weekStart) {
                prefetchWeek(id, addDaysYmd(data.weekStart, -7));
                prefetchWeek(id, addDaysYmd(data.weekStart, 7));
            }
        },
        [prefetchWeek, recordWeekReady]
    );

    const loadAssignmentRoster = useCallback(async (id: string) => {
        setLoadingAssignmentRoster(true);
        const r = await schedApi(`?view=assignment_roster&site_location_id=${encodeURIComponent(id)}`);
        setAssignmentRoster((r?.subjects as AssignmentRosterSubject[]) ?? []);
        setLoadingAssignmentRoster(false);
    }, []);

    const loadAssignmentTypesAdmin = useCallback(async () => {
        const r = await fetch("/api/admin/assignment-types").then((res) => res.json()).catch(() => ({}));
        setAssignmentTypes((r?.types as AssignmentTypeAdminRecord[]) ?? []);
    }, []);

    const loadPickerAssignmentTypes = useCallback(async () => {
        const r = await schedApi(`?view=assignment_types`);
        setPickerAssignmentTypes((r?.assignmentTypes as OrgAssignmentTypeOption[]) ?? []);
    }, []);

    const loadStudioData = useCallback(async (id: string) => {
        if (!id) return;
        setLoadingStudio(true);
        const [pRes, cRes] = await Promise.all([
            patternApi(`?site_location_id=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => ({})),
            schedApi(`?view=studio_config&site_location_id=${encodeURIComponent(id)}`),
        ]);
        setStudioPatterns(((pRes?.patterns ?? []) as Record<string, any>[]).map(mapRawPattern));
        setStudioConfig((cRes?.config as PatternEditorConfig) ?? EMPTY_STUDIO_CONFIG);
        setLoadingStudio(false);
    }, []);

    /**
     * Shared Assignments Workspace runtime snapshot — preload in parallel on site open /
     * site change. Tabs consume this snapshot; entering Studio must not cold-bootstrap.
     */
    useEffect(() => {
        if (!siteId) return;
        const seq = ++siteBootstrapSeqRef.current;
        const startedAt = nowMs();
        setCoreSnapshotReady(false);
        rosterCacheRef.current.clear();
        weekStartRef.current = "";
        setOptimisticWeekLabel(null);
        setWeekChangePending(false);
        setWeekOf("");

        // Hold prior rows while refreshing — do not blank UI on warm site switch.
        setLoadingOverview(true);
        setLoadingRoster(true);
        setLoadingAssignmentRoster(true);
        setLoadingStudio(true);
        setLoadingCalc(true);

        void (async () => {
            const [
                overviewRes,
                rosterRes,
                assignmentRosterRes,
                typesAdminRes,
                pickerTypesRes,
                patternsRes,
                studioConfigRes,
                calcRes,
            ] = await Promise.all([
                schedApi(`?view=overview&site_location_id=${encodeURIComponent(siteId)}`),
                schedApi(`?view=roster&site_location_id=${encodeURIComponent(siteId)}`),
                schedApi(`?view=assignment_roster&site_location_id=${encodeURIComponent(siteId)}`),
                fetch("/api/admin/assignment-types").then((res) => res.json()).catch(() => ({})),
                schedApi(`?view=assignment_types`),
                patternApi(`?site_location_id=${encodeURIComponent(siteId)}`)
                    .then((r) => r.json())
                    .catch(() => ({})),
                schedApi(`?view=studio_config&site_location_id=${encodeURIComponent(siteId)}`),
                schedApi(`?view=calculations`),
            ]);

            if (seq !== siteBootstrapSeqRef.current) return; // stale site response

            setOverview((overviewRes as OverviewResp) ?? {});
            setLoadingOverview(false);
            markAssignmentsWorkspacePerf("tab_overview_ready");

            const rosterData: RosterData | null = rosterRes?.roster ?? null;
            if (rosterData?.weekStart) {
                rosterCacheRef.current.set(rosterData.weekStart, rosterData);
                rosterCacheRef.current.set("__current__", rosterData);
                weekStartRef.current = rosterData.weekStart;
                prefetchWeek(siteId, addDaysYmd(rosterData.weekStart, -7));
                prefetchWeek(siteId, addDaysYmd(rosterData.weekStart, 7));
            }
            setRoster(rosterData);
            setLoadingRoster(false);
            markAssignmentsWorkspacePerf("tab_roster_ready");

            setAssignmentRoster((assignmentRosterRes?.subjects as AssignmentRosterSubject[]) ?? []);
            setLoadingAssignmentRoster(false);

            setAssignmentTypes((typesAdminRes?.types as AssignmentTypeAdminRecord[]) ?? []);
            markAssignmentsWorkspacePerf("tab_categories_ready");

            setPickerAssignmentTypes((pickerTypesRes?.assignmentTypes as OrgAssignmentTypeOption[]) ?? []);

            setStudioPatterns(((patternsRes?.patterns ?? []) as Record<string, any>[]).map(mapRawPattern));
            setStudioConfig((studioConfigRes?.config as PatternEditorConfig) ?? EMPTY_STUDIO_CONFIG);
            setLoadingStudio(false);
            markAssignmentsWorkspacePerf("tab_patterns_ready");

            setCalculations((calcRes?.calculations as StudioCalculation[]) ?? []);
            setLoadingCalc(false);
            markAssignmentsWorkspacePerf("tab_validation_ready");

            markAssignmentsWorkspacePerf("core_snapshot_ready");
            const coreMs = Math.round(nowMs() - startedAt);
            setWsTimings((t) => ({
                ...t,
                coreSnapshotMs: coreMs,
                overviewReadyMs: measureAssignmentsWorkspacePerf(
                    "overview_ready",
                    "workspace_click",
                    "tab_overview_ready",
                ),
                rosterReadyMs: measureAssignmentsWorkspacePerf(
                    "roster_ready",
                    "workspace_click",
                    "tab_roster_ready",
                ),
                categoriesReadyMs: measureAssignmentsWorkspacePerf(
                    "categories_ready",
                    "workspace_click",
                    "tab_categories_ready",
                ),
                patternsReadyMs: measureAssignmentsWorkspacePerf(
                    "patterns_ready",
                    "workspace_click",
                    "tab_patterns_ready",
                ),
                calculationsReadyMs: measureAssignmentsWorkspacePerf(
                    "validation_ready",
                    "workspace_click",
                    "tab_validation_ready",
                ),
                assignmentRosterReadyMs: coreMs,
            }));
            setCoreSnapshotReady(true);
            if (process.env.NODE_ENV !== "production") {
                console.debug(`[AssignmentsWorkspace] core snapshot ready in ${coreMs}ms (site=${siteId})`);
            }
        })();
    }, [siteId, prefetchWeek]);

    // Entering Studio no longer cold-loads — snapshot already holds categories / patterns / calcs.
    // Refresh on demand only when still null (e.g. race before first site bootstrap).
    useEffect(() => {
        if (mode !== "studio" || !siteId) return;
        if (calculations == null) {
            void (async () => {
                setLoadingCalc(true);
                const r = await schedApi(`?view=calculations`);
                setCalculations((r?.calculations as StudioCalculation[]) ?? []);
                setLoadingCalc(false);
            })();
        }
        if (assignmentTypes == null) void loadAssignmentTypesAdmin();
        if (studioPatterns == null) void loadStudioData(siteId);
    }, [mode, siteId, calculations, assignmentTypes, studioPatterns, loadAssignmentTypesAdmin, loadStudioData]);

    const onMutatePattern = useCallback(
        async (m: PatternMutation): Promise<{ ok: boolean; error?: string }> => {
            if (!siteId) return { ok: false, error: "No site selected." };
            const fail = async (res: Response): Promise<{ ok: boolean; error?: string }> => {
                const body = await res.json().catch(() => ({}));
                return { ok: false, error: (body as { error?: string }).error ?? "Could not save the pattern." };
            };
            try {
                let res: Response;
                if (m.kind === "create") {
                    res = await patternApi("", {
                        method: "POST",
                        body: JSON.stringify({
                            site_location_id: siteId,
                            key: slugKey(m.data.label),
                            label: m.data.label,
                            schedule_type_key: m.data.scheduleTypeKey,
                            weekdays: m.data.weekdays,
                            is_active: m.data.active,
                            sort_order: 100,
                            metadata: buildPatternMeta({}, m.data),
                        }),
                    });
                } else if (m.kind === "update") {
                    res = await patternApi(`/${m.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                            label: m.data.label,
                            schedule_type_key: m.data.scheduleTypeKey,
                            weekdays: m.data.weekdays,
                            is_active: m.data.active,
                            metadata: buildPatternMeta(m.baseMetadata, m.data),
                        }),
                    });
                } else if (m.kind === "archive" || m.kind === "restore") {
                    res = await patternApi(`/${m.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ is_active: m.kind === "restore" }),
                    });
                } else {
                    const s = m.source;
                    res = await patternApi("", {
                        method: "POST",
                        body: JSON.stringify({
                            site_location_id: siteId,
                            key: slugKey(`${s.label} copy`),
                            label: `${s.label} (copy)`,
                            schedule_type_key: s.scheduleTypeKey,
                            weekdays: s.weekdays,
                            is_active: true,
                            sort_order: s.sortOrder + 1,
                            metadata: s.metadata,
                        }),
                    });
                }
                if (!res.ok) return fail(res);
                await loadStudioData(siteId);
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : "Network error." };
            }
        },
        [siteId, loadStudioData]
    );

    const siteName = useMemo(() => sites?.find((s) => s.id === siteId)?.name ?? "All sites", [sites, siteId]);
    const drawer = useAdminDrawerOptional();
    const summary = useMemo(() => deriveRosterSummary(roster), [roster]);

    const unplaced = overview?.unplaced ?? [];
    const starts = overview?.startsThisWeek ?? [];
    const activity = overview?.activity ?? null;

    const createCandidates = useMemo((): WorkspaceCreateChildCandidate[] => {
        const byId = new Map<string, WorkspaceCreateChildCandidate>();
        for (const s of assignmentRoster ?? []) {
            // Child-creation candidates only. Staff subjects carry a null
            // customer member by constraint and would key the map on null and
            // sort on an undefined name.
            if (s.subjectType === "staff" || !s.customerMemberId) continue;
            byId.set(s.customerMemberId, {
                customerMemberId: s.customerMemberId,
                agreementId: s.enrollmentAgreementId ?? "",
                personId: null,
                name: s.subjectName,
                startDate: null,
            });
        }
        for (const u of unplaced) {
            if (!u.customerMemberId) continue;
            if (!byId.has(u.customerMemberId)) {
                byId.set(u.customerMemberId, {
                    customerMemberId: u.customerMemberId,
                    agreementId: u.agreementId,
                    personId: null,
                    name: u.name,
                    startDate: u.startDate ?? null,
                });
            }
        }
        return [...byId.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }, [assignmentRoster, unplaced]);

    const openCreateAssignment = useCallback(
        (prefillChildId?: string | null) => {
            setCreatePrefillChildId(prefillChildId ?? null);
            setCreateOpen(true);
        },
        [],
    );

    const refreshAfterMutation = useCallback(() => {
        if (!siteId) return;
        void loadAssignmentRoster(siteId);
        void loadOverview(siteId);
        void loadPickerAssignmentTypes();
        if (mode === "studio") void loadAssignmentTypesAdmin();
    }, [siteId, loadAssignmentRoster, loadOverview, loadPickerAssignmentTypes, loadAssignmentTypesAdmin, mode]);

    // Navigation — cards route into the correct operational context (no dead cards).
    // A filter kind carries the operator's intent (unplaced / starts / near-capacity /
    // ratio-risk) into the roster so it opens focused on exactly what the card was about.
    const navigateToRoster = useCallback((roomId?: string, filter?: string) => {
        setMode("work");
        setWorkView("roster");
        setFocusRoomId(roomId);
        setRosterFilter((filter as RosterFilterKind) ?? null);
    }, []);

    // The roster's focused context, resolved from the active filter + live data.
    const filterContext: RosterFilterContext | null = useMemo(() => {
        if (!rosterFilter) return null;
        if (rosterFilter === "unplaced") {
            return {
                kind: "unplaced",
                label: "Missing assignments",
                count: unplaced.length,
                children: unplaced.map((c) => ({ name: c.name, sub: c.startDate ? `starts ${c.startDate}` : "ready to assign" })),
            };
        }
        if (rosterFilter === "starts") {
            return {
                kind: "starts",
                label: "Upcoming assignments",
                count: starts.length,
                children: starts.map((s) => ({ name: s.name, sub: `starts ${s.startDate}` })),
            };
        }
        if (rosterFilter === "near_capacity") {
            return {
                kind: "near_capacity",
                label: "Rooms near capacity",
                count: summary.roomsNearCapacity.length,
                highlightRoomIds: summary.roomsNearCapacity.map((r) => r.roomId),
            };
        }
        return {
            kind: "ratio_risk",
            label: "Ratio risks",
            count: summary.ratioRisks.length,
            highlightRoomIds: [...new Set(summary.ratioRisks.map((r) => r.roomId))],
        };
    }, [rosterFilter, unplaced, starts, summary]);

    const onWeekChange = useCallback(
        (dir: -1 | 1 | 0) => {
            if (!siteId) return;
            weekClickAtRef.current = nowMs();
            setWeekChangePending(true);
            if (dir === 0) {
                setOptimisticWeekLabel("This week");
                setWeekOf("");
                void loadRoster(siteId, "");
                return;
            }
            const base = weekStartRef.current || weekOf;
            if (!base) return;
            const next = addDaysYmd(base, dir * 7);
            setOptimisticWeekLabel(`${fmtMonthDay(next)}–${fmtMonthDay(addDaysYmd(next, 6))}`);
            setWeekOf(next);
            void loadRoster(siteId, next);
        },
        [siteId, weekOf, loadRoster]
    );

    const onSelectWeek = useCallback(
        (weekStart: string) => {
            if (!siteId) return;
            weekClickAtRef.current = nowMs();
            setWeekChangePending(true);
            if (!weekStart) {
                setOptimisticWeekLabel("This week");
                setWeekOf("");
                void loadRoster(siteId, "");
                return;
            }
            setOptimisticWeekLabel(`${fmtMonthDay(weekStart)}–${fmtMonthDay(addDaysYmd(weekStart, 6))}`);
            setWeekOf(weekStart);
            void loadRoster(siteId, weekStart);
        },
        [siteId, loadRoster]
    );

    /** The roster shown to the operator, with the optimistic label applied instantly on click. */
    const displayRoster = useMemo(
        () => (roster && optimisticWeekLabel ? { ...roster, weekLabel: optimisticWeekLabel } : roster),
        [roster, optimisticWeekLabel]
    );

    // Operational health lives in the control band — hidden on the Work→Overview landing
    // (its launch surfaces carry the metrics), shown on Roster / Attendance / all Studio.
    const showMetrics = !(mode === "work" && workView === "overview");
    const assignmentAttention = overview?.assignmentAttention ?? null;
    const metricsColumn = showMetrics ? (
        <SchedulingKpiStrip
            mode={mode}
            loading={mode === "work" ? loadingRoster || loadingOverview || loadingAssignmentRoster : loadingCalc || loadingStudio}
            work={{
                childrenMissingAssignments: assignmentAttention?.childrenMissingAssignments ?? unplaced.length,
                multipleAssignments: assignmentAttention?.multipleAssignments ?? 0,
                upcomingAssignments: assignmentAttention?.upcomingAssignments ?? starts.length,
                futurePrimaryChanges: assignmentAttention?.futurePrimaryChanges ?? 0,
                assignmentConflicts: assignmentAttention?.assignmentConflicts ?? 0,
                expiringSoon: assignmentAttention?.expiringSoon ?? 0,
            }}
            studio={{
                assignmentTypes: assignmentTypes?.length ?? null,
                patterns: studioPatterns?.filter((p) => p.isActive).length ?? null,
            }}
        />
    ) : undefined;

    return (
        <SchedulingWorkspaceShell
            mode={mode}
            workView={workView}
            studioView={studioView}
            onModeChange={setMode}
            onWorkViewChange={(v) => {
                setWorkView(v);
                if (v !== "roster") {
                    setFocusRoomId(undefined);
                    setRosterFilter(null);
                }
            }}
            onStudioViewChange={setStudioView}
            sites={sites}
            siteId={siteId}
            onSiteChange={(next) => {
                    siteChosenByOperatorRef.current = true;
                    setSiteId(next);
                }}
            siteName={siteName}
            metricsColumn={metricsColumn}
            onClose={onClose}
            onAddAssignment={() => openCreateAssignment(null)}
            onBulkCommand={(command) => {
                setMode("work");
                setWorkView("roster");
                setRosterView("assignments");
                if (command === "assignment" || command === "room") {
                    setRosterBulkIntent(command);
                } else {
                    // Primary / Archive run from selection toolbar once rows are checked.
                    setRosterBulkIntent(null);
                }
            }}
        >
            <div
                className="sr-only"
                aria-hidden
                data-assignments-ws-timings="true"
                data-ws-core-ready={coreSnapshotReady ? "true" : "false"}
                data-ws-shell-ms={wsTimings.shellPaintMs ?? undefined}
                data-ws-core-ms={wsTimings.coreSnapshotMs ?? undefined}
                data-ws-overview-ms={wsTimings.overviewReadyMs ?? undefined}
                data-ws-roster-ms={wsTimings.rosterReadyMs ?? undefined}
                data-ws-categories-ms={wsTimings.categoriesReadyMs ?? undefined}
                data-ws-patterns-ms={wsTimings.patternsReadyMs ?? undefined}
                data-ws-validation-ms={wsTimings.calculationsReadyMs ?? undefined}
            />
            <WorkspaceCreateAssignmentModal
                open={createOpen}
                siteId={siteId}
                siteName={siteName}
                candidates={createCandidates}
                assignmentTypes={pickerAssignmentTypes ?? []}
                preselectedChildId={createPrefillChildId}
                onClose={() => setCreateOpen(false)}
                onSaved={refreshAfterMutation}
            />
            <WorkspaceSurface
                tone={mode === "work" && workView === "roster" ? "canvas" : "stone"}
                scroll
                padded
                data-scheduling-section={mode === "work" ? workView : studioView}
            >
                {mode === "work" && workView === "overview" ? (
                    <SchedulingOverview
                        loading={loadingOverview}
                        siteName={siteName}
                        unplaced={unplaced}
                        starts={starts}
                        summary={summary}
                        activity={activity}
                        assignmentAttention={overview?.assignmentAttention ?? null}
                        onNavigateRoster={navigateToRoster}
                    />
                ) : null}

                {mode === "work" && workView === "roster" ? (
                    <SchedulingRoster
                        data={displayRoster}
                        assignmentSubjects={assignmentRoster ?? []}
                        rosterView={rosterView}
                        onRosterViewChange={setRosterView}
                        loading={loadingRoster}
                        loadingAssignments={loadingAssignmentRoster}
                        siteName={siteName}
                        focusRoomId={focusRoomId}
                        filter={filterContext}
                        onClearFilter={() => setRosterFilter(null)}
                        onSelectRoom={(roomId) => setFocusRoomId(roomId)}
                        onSelectCell={(roomId) => setFocusRoomId(roomId)}
                        onWeekChange={onWeekChange}
                        onSelectWeek={onSelectWeek}
                        weekChangePending={weekChangePending}
                        lastWeekLoadMs={lastWeekLoadMs}
                        initialBulkMode={rosterBulkIntent}
                        rosterBulk={{
                            onCreateForChild: (customerMemberId) => openCreateAssignment(customerMemberId),
                            onBulkArchive: async (assignmentIds) => {
                                for (const assignment_id of assignmentIds) {
                                    await fetch("/api/admin/actions/execute", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({
                                            action_key: "assignment.archive",
                                            entity_type: "assignment",
                                            entity_id: assignment_id,
                                            payload: { assignment_id },
                                        }),
                                    });
                                }
                                refreshAfterMutation();
                            },
                            onBulkMakePrimary: async (rows) => {
                                for (const row of rows) {
                                    // Primary is a child concept; a staff subject has no
                                    // enrollment agreement and must not reach this command.
                                    const subject = (assignmentRoster ?? []).find(
                                        (s) => s.subjectKey === row.subjectKey
                                    );
                                    const agreementId = subject?.enrollmentAgreementId;
                                    if (!agreementId || subject?.subjectType === "staff") continue;
                                    await fetch("/api/admin/actions/execute", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({
                                            action_key: "assignment.set_primary",
                                            entity_type: "child",
                                            entity_id: agreementId,
                                            payload: {
                                                subject_type: "child",
                                                enrollment_agreement_id: agreementId,
                                                effective_date: row.effectiveFrom,
                                                promote_assignment_id: row.assignmentId,
                                            },
                                        }),
                                    });
                                }
                                refreshAfterMutation();
                            },
                            onBulkAssignment: async (_subjects, preview) => {
                                for (const row of preview.filter((p) => p.status === "ready")) {
                                    await fetch("/api/admin/actions/execute", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({
                                            action_key: "assignment.create",
                                            entity_type: "child",
                                            entity_id: row.customerMemberId,
                                            payload: row.payload,
                                        }),
                                    });
                                }
                                refreshAfterMutation();
                            },
                            onBulkRoomChange: async (rows) => {
                                for (const row of rows) {
                                    await fetch("/api/admin/actions/execute", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({
                                            action_key: "assignment.create",
                                            entity_type: "child",
                                            entity_id: row.customerMemberId,
                                            payload: row.payload,
                                        }),
                                    });
                                }
                                refreshAfterMutation();
                            },
                            assignmentTypes: pickerAssignmentTypes ?? [],
                            siteId,
                        }}
                    />
                ) : null}

                {mode === "work" && workView === "daily_roster" ? (
                    <DailyRoster
                        siteLocationId={siteId}
                        siteName={siteName}
                        todayYmd={new Date().toISOString().slice(0, 10)}
                        onOpenChild={(child) => {
                            // Canonical record only — a child opens as its person
                            // identity. Roster is a selection surface, not a record one.
                            if (child.personId) drawer?.openDrawer({ type: "persons", id: child.personId });
                        }}
                        onOpenStaff={(staff) => {
                            drawer?.openDrawer({ type: "persons", id: staff.personId });
                        }}
                    />
                ) : null}
                {mode === "work" && workView === "attendance" ? (
                    <AttendanceWorkspace
                        siteLocationId={siteId}
                        siteName={siteName}
                        onOpenChild={(child) => {
                            // Canonical Child record — never an attendance-specific surface.
                            if (child.personId) drawer?.openDrawer({ type: "persons", id: child.personId });
                        }}
                        onOpenStaff={(staff) => {
                            drawer?.openDrawer({ type: "persons", id: staff.personId });
                        }}
                    />
                ) : null}

                {mode === "studio" ? (
                    <SchedulingStudio
                        view={studioView}
                        patterns={studioPatterns ?? []}
                        assignmentTypes={assignmentTypes ?? []}
                        calculations={calculations ?? []}
                        editorConfig={studioConfig ?? EMPTY_STUDIO_CONFIG}
                        loading={
                            mode === "studio"
                                ? !coreSnapshotReady && (studioView === "validation" ? loadingCalc : loadingStudio)
                                : false
                        }
                        siteName={siteName}
                        sites={sites ?? []}
                        onMutatePattern={onMutatePattern}
                        onAssignmentTypesChanged={loadAssignmentTypesAdmin}
                    />
                ) : null}
            </WorkspaceSurface>
        </SchedulingWorkspaceShell>
    );
}

