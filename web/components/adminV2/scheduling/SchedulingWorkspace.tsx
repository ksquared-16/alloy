"use client";

/**
 * Scheduling Workspace — a first-class Alloy Operational Workspace on the shared
 * WorkspaceShell (the same chrome Processing / Communications / Work Items use).
 *
 * This container owns state, data, and navigation only. The invariant chrome (Work |
 * Studio modes, section tabs, control-band operational health) comes from
 * `SchedulingWorkspaceShell` → the canonical `WorkspaceShell`; the section bodies are
 * doctrine surfaces. Occupancy / ratio / placement signals are consumed from the
 * scheduling read API (which composes the operational calculation engine) — the
 * workspace never owns that logic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck } from "lucide-react";

import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import SchedulingWorkspaceShell, { type Site } from "@/app/adminV2/scheduling/SchedulingWorkspaceShell";
import SchedulingKpiStrip from "@/app/adminV2/scheduling/SchedulingKpiStrip";
import {
    SCHEDULING_SECTION_MODE,
    type SchedulingMode,
    type SchedulingStudioView,
    type SchedulingWorkView,
} from "@/app/adminV2/scheduling/schedulingSections";
import SchedulingOverview, {
    type OverviewChild,
    type OverviewStart,
    type RosterSummary,
    type TodayActivity,
} from "@/components/adminV2/scheduling/screens/SchedulingOverview";
import SchedulingRoster, {
    type RosterData,
    type RosterFilterKind,
    type RosterFilterContext,
} from "@/components/adminV2/scheduling/screens/SchedulingRoster";
import SchedulingStudio, { type StudioCalculation } from "@/components/adminV2/scheduling/screens/SchedulingStudio";
import {
    type StudioPattern,
    type PatternEditorConfig,
    type PatternInput,
    type PatternMutation,
} from "@/components/adminV2/scheduling/screens/SchedulingPatterns";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";

type OverviewResp = {
    unplaced?: OverviewChild[];
    startsThisWeek?: OverviewStart[];
    activity?: TodayActivity;
};

const EMPTY_STUDIO_CONFIG: PatternEditorConfig = { operatingDays: [], scheduleTypes: [], programs: [] };

/** Map a raw `schedule_patterns` row to the Studio pattern shape (metadata preserved). */
function mapRawPattern(row: Record<string, any>): StudioPattern {
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

    const [mode, setMode] = useState<SchedulingMode>("work");
    const [workView, setWorkView] = useState<SchedulingWorkView>("overview");
    const [studioView, setStudioView] = useState<SchedulingStudioView>("patterns");
    const [focusRoomId, setFocusRoomId] = useState<string | undefined>(undefined);
    const [rosterFilter, setRosterFilter] = useState<RosterFilterKind | null>(null);

    const [overview, setOverview] = useState<OverviewResp | null>(null);
    const [roster, setRoster] = useState<RosterData | null>(null);
    const [calculations, setCalculations] = useState<StudioCalculation[] | null>(null);
    const [studioPatterns, setStudioPatterns] = useState<StudioPattern[] | null>(null);
    const [studioConfig, setStudioConfig] = useState<PatternEditorConfig | null>(null);

    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingRoster, setLoadingRoster] = useState(false);
    const [loadingCalc, setLoadingCalc] = useState(false);
    const [loadingStudio, setLoadingStudio] = useState(false);

    /** The week currently shown in the roster (weekStart from the last payload). */
    const [weekOf, setWeekOf] = useState<string>("");
    const weekStartRef = useRef<string>("");

    // Sites (once) — resolve the operator's site. Retries a transient empty result
    // (e.g. a cold route compile) so the workspace never strands on an unresolved site.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
                const r = await schedApi(`?view=sites`);
                const list: Site[] = r?.sites ?? [];
                if (list.length > 0) {
                    if (cancelled) return;
                    setSites(list);
                    setSiteId((r.resolvedSiteId as string) || list[0]?.id || "");
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

    const loadRoster = useCallback(async (id: string, week: string) => {
        setLoadingRoster(true);
        const weekParam = week ? `&week_of=${encodeURIComponent(week)}` : "";
        const r = await schedApi(`?view=roster&site_location_id=${encodeURIComponent(id)}${weekParam}`);
        const data: RosterData | null = r?.roster ?? null;
        setRoster(data);
        weekStartRef.current = (r?.roster?.weekStart as string) ?? "";
        setLoadingRoster(false);
    }, []);

    // Site change → (re)load overview + roster; reset to current week.
    useEffect(() => {
        if (!siteId) return;
        setWeekOf("");
        void loadOverview(siteId);
        void loadRoster(siteId, "");
    }, [siteId, loadOverview, loadRoster]);

    // Entering Studio → lazily load the calculations catalogue (registry — read-only).
    useEffect(() => {
        if (mode !== "studio" || calculations != null) return;
        (async () => {
            setLoadingCalc(true);
            const r = await schedApi(`?view=calculations`);
            setCalculations((r?.calculations as StudioCalculation[]) ?? []);
            setLoadingCalc(false);
        })();
    }, [mode, calculations]);

    // Studio administration data (patterns + editor config) — loaded for the active site
    // whenever Studio is open (reloads on site change).
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

    useEffect(() => {
        if (mode !== "studio" || !siteId) return;
        void loadStudioData(siteId);
    }, [mode, siteId, loadStudioData]);

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
    const summary = useMemo(() => deriveRosterSummary(roster), [roster]);

    const unplaced = overview?.unplaced ?? [];
    const starts = overview?.startsThisWeek ?? [];
    const activity = overview?.activity ?? null;

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
                label: "Needs placement",
                count: unplaced.length,
                children: unplaced.map((c) => ({ name: c.name, sub: c.startDate ? `starts ${c.startDate}` : "ready to place" })),
            };
        }
        if (rosterFilter === "starts") {
            return {
                kind: "starts",
                label: "Starting this week",
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
            if (dir === 0) {
                setWeekOf("");
                void loadRoster(siteId, "");
                return;
            }
            const base = weekStartRef.current || weekOf;
            if (!base) return;
            const next = addDaysYmd(base, dir * 7);
            setWeekOf(next);
            void loadRoster(siteId, next);
        },
        [siteId, weekOf, loadRoster]
    );

    // Operational health lives in the control band — hidden on the Work→Overview landing
    // (its launch surfaces carry the metrics), shown on Roster / Attendance / all Studio.
    const showMetrics = !(mode === "work" && workView === "overview");
    const metricsColumn = showMetrics ? (
        <SchedulingKpiStrip
            mode={mode}
            loading={mode === "work" ? loadingRoster || loadingOverview : loadingCalc}
            work={{
                toDecide: unplaced.length,
                roomsInRatio: summary.roomsInRatio,
                fill: summary.fill,
                startsThisWeek: starts.length,
            }}
            studio={{
                patterns: studioPatterns?.filter((p) => p.isActive).length ?? null,
                calculations: calculations?.length ?? null,
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
            onSiteChange={setSiteId}
            siteName={siteName}
            metricsColumn={metricsColumn}
            onClose={onClose}
        >
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
                        onNavigateRoster={navigateToRoster}
                    />
                ) : null}

                {mode === "work" && workView === "roster" ? (
                    <SchedulingRoster
                        data={roster}
                        loading={loadingRoster}
                        siteName={siteName}
                        focusRoomId={focusRoomId}
                        filter={filterContext}
                        onClearFilter={() => setRosterFilter(null)}
                        onSelectRoom={(roomId) => setFocusRoomId(roomId)}
                        onSelectCell={(roomId) => setFocusRoomId(roomId)}
                        onWeekChange={onWeekChange}
                    />
                ) : null}

                {mode === "work" && workView === "attendance" ? <AttendanceScreen siteName={siteName} /> : null}

                {mode === "studio" ? (
                    <SchedulingStudio
                        view={studioView}
                        patterns={studioPatterns ?? []}
                        calculations={calculations ?? []}
                        editorConfig={studioConfig ?? EMPTY_STUDIO_CONFIG}
                        loading={studioView === "calculations" ? loadingCalc : loadingStudio}
                        siteName={siteName}
                        onMutatePattern={onMutatePattern}
                    />
                ) : null}
            </WorkspaceSurface>
        </SchedulingWorkspaceShell>
    );
}

function AttendanceScreen({ siteName }: { siteName: string }) {
    return (
        <div className="mx-auto flex w-full max-w-[1180px] flex-col">
            <p className={WS_EYEBROW}>Attendance</p>
            <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/25 bg-white px-6 py-16 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-alloy-stone/40 text-alloy-midnight">
                    <CalendarCheck className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <p className="text-[13px] font-semibold text-alloy-midnight">Attendance arrives with the Attendance runtime</p>
                <p className="mt-1 max-w-md text-[12px] text-alloy-slate">
                    Expected-vs-actual attendance for {siteName} this week will surface here in Phase 2. Expected occupancy
                    already drives the Roster today.
                </p>
            </div>
        </div>
    );
}
