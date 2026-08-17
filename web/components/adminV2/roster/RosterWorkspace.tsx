"use client";

/**
 * Roster — the operational workspace for the expected operating plan, and for the
 * day as it actually goes.
 *
 *   Roster      who is expected where and when (Day/Week × Rooms/Staff)
 *   Attendance  who is actually here, today
 *
 * It lived inside Assignments, which owns something else: the durable placement
 * and schedule COMMITMENTS these expectations are derived from. One workspace was
 * answering two questions, and every Roster tab was topped by an assignment-ledger
 * attention band that has nothing to do with running a day.
 *
 * Roster authors NOTHING. It composes certified projections and routes every
 * change to the registered assignment commands Assignments owns.
 *
 * This workspace deliberately loads less than Assignments does. It needs sites,
 * the week roster projection, and the assignment subjects the room detail panel
 * lists — not assignment attention, not studio config, not calculations. Roster
 * should not pay for the ledger's bootstrap to show a day.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import OperationsWorkspaceShell, {
    type OperationsSite as RosterSite,
} from "@/app/adminV2/operations/OperationsWorkspaceShell";
import OperationsStudio from "@/components/adminV2/operations/OperationsStudio";
import RosterKpiStrip, { type RosterHealthCounts } from "@/app/adminV2/roster/RosterKpiStrip";
import {
    resolveOperationsStudioSection,
    resolveOperationsWorkSection as resolveRosterSection,
    type OperationsMode,
    type OperationsStudioSection,
    type OperationsWorkSection as RosterSection,
} from "@/app/adminV2/operations/operationsSections";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import RosterSurface, { type RosterLens } from "@/components/adminV2/scheduling/screens/RosterSurface";
import { buildAssignmentRosterBulkHandlers } from "@/lib/adminV2/scheduling/assignmentRosterBulkHandlers";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import AttendanceWorkspace from "@/components/adminV2/scheduling/screens/AttendanceWorkspace";
import RecordsStaffSection from "@/components/adminV2/records/RecordsStaffSection";
import RecordsChildrenSection from "@/components/adminV2/records/RecordsChildrenSection";
import WorkspaceDurableRecordHost from "@/components/presentation/durableRecord/WorkspaceDurableRecordHost";
import {
    type RosterData,
    type RosterFilterContext,
    type RosterFilterKind,
} from "@/components/adminV2/scheduling/screens/SchedulingRoster";
import type { AssignmentRosterSubject } from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";
import { mondayOfWeekContaining, addDaysYmdLocal } from "@/components/workspace/WeekPicker";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import {
    DURABLE_RECORD_CLOSED_EVENT,
    type DurableRecordClosedDetail,
} from "@/lib/runtime/focus/DurableRecordHostContext";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import {
    ROSTER_WORKSPACE_DEEPLINK_KEY,
    type OpenRosterModalDetail,
} from "@/lib/adminV2/workspaceModalEvents";
import type { RosterRange } from "@/app/adminV2/operations/operationsSections";

async function schedApi(path: string): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, {
        headers: { "content-type": "application/json" },
    });
    return res.json().catch(() => ({}));
}

export default function RosterWorkspace({ onClose }: { onClose?: () => void }) {
    /**
     * WORK or STUDIO — running the operating day, or configuring what it is made of.
     *
     * Defaults to Work every time the workspace opens. Studio is where an operator goes
     * deliberately and rarely; remembering it across opens would land someone on a configuration
     * screen when they came to look at the day.
     */
    const [mode, setMode] = useState<OperationsMode>("work");
    const [studioSection, setStudioSection] =
        useState<Exclude<OperationsStudioSection, "templates">>("types");
    const [section, setSection] = useState<RosterSection>("roster");
    const [range, setRange] = useState<RosterRange>("day");
    const [lens, setLens] = useState<RosterLens>("rooms");

    const [sites, setSites] = useState<RosterSite[] | null>(null);
    const [siteId, setSiteId] = useState<string>("");
    /**
     * The org's configured Assignment Categories, for the Assignments lens' Bulk Assign picker.
     *
     * ORG-scoped, not site-scoped, so it is loaded once rather than per site — which is also why it
     * is not folded into the site effect below. Authored in Studio; this is only a read.
     */
    const [assignmentTypes, setAssignmentTypes] = useState<OrgAssignmentTypeOption[] | null>(null);
    /**
     * Once the operator picks a site, no late bootstrap response may move them.
     * The same hazard the day roster had: a slower response arriving after a
     * deliberate choice silently restores the previous site.
     */
    const siteChosenRef = useRef(false);

    const [week, setWeek] = useState<RosterData | null>(null);
    const [loadingWeek, setLoadingWeek] = useState(false);
    const [weekChangePending, setWeekChangePending] = useState(false);
    const [subjects, setSubjects] = useState<AssignmentRosterSubject[] | null>(null);
    const [focusRoomId, setFocusRoomId] = useState<string | undefined>(undefined);
    const [rosterFilter, setRosterFilter] = useState<RosterFilterKind | null>(null);
    /** Room to open when Roster hands off to Attendance. */
    const [attendanceRoomId, setAttendanceRoomId] = useState<string | null>(null);
    /** Day-range health, reported up by the day surface for the control band. */
    const [dayHealth, setDayHealth] = useState<RosterHealthCounts | null>(null);

    /**
     * Positions and the org's SERVICE DATE, for the durable population sections.
     *
     * One bootstrap for the workspace, not one per section. Records loaded its own, and two
     * bootstraps in one workspace is two answers to "what day is it" — a section that read the
     * browser clock would disagree with the roster rendered beside it. Sites already come from
     * Roster's own load, so this asks only for what Roster does not already have.
     */
    const [peopleBootstrap, setPeopleBootstrap] = useState<{
        positions: { id: string; key: string | null; label: string }[];
        todayYmd: string;
    } | null>(null);

    /** Stale-response guard for the WEEK load. */
    const loadSeq = useRef(0);
    /**
     * Stale-response guard for the ASSIGNMENT LEDGER load — its own counter, deliberately.
     *
     * These were one shared counter, and sharing it silently broke the refresh seam. The ledger
     * reload captured `loadSeq`, issued its fetch, and then called `loadWeek`, which increments
     * `loadSeq` — so by the time the ledger response arrived the sequence had moved and the result
     * was discarded as stale. It was not stale; it was the only fresh data in the request.
     *
     * The effect is that an assignment edit wrote correctly, announced itself correctly, and the
     * Assignments lens went on showing the old room — indistinguishable from a broken write, and
     * invisible to any test that asserted on the action's response rather than on the projection.
     *
     * A stale-response guard belongs to ONE request stream. Two independent loads sharing one
     * counter means either can cancel the other, and which one wins is a race.
     */
    const assignSeq = useRef(0);
    const weekCache = useRef<Map<string, RosterData>>(new Map());

    const focusRecord = useOperatorRecordFocus();
    const focusRecordAndYield = useCallback(
        async (input: Parameters<typeof focusRecord>[0]) => {
            const resolved = await focusRecord(input);
            // A record gesture takes the operator out of this workspace; leaving the
            // modal open behind the destination is the drawer habit in another shape.
            if (resolved !== false) onClose?.();
            return resolved;
        },
        [focusRecord, onClose],
    );

    /*
     * Assignment Categories — loaded ONCE, on first need.
     *
     * Deferred until the Assignments lens is actually opened, for the same reason the people
     * bootstrap is deferred: Roster opens on the operating day, and paying for the org's category
     * catalogue on every Roster open would make the common case slower to serve a lens the operator
     * may never select.
     *
     * The endpoint is `?view=assignment_types` — the same one the Assignments workspace calls, which
     * resolves `loadOrgAssignmentTypes`. There is no Roster-specific list and no second config owner.
     */
    useEffect(() => {
        if (lens !== "assignments" || assignmentTypes) return;
        let alive = true;
        void schedApi("?view=assignment_types").then((r) => {
            if (!alive) return;
            setAssignmentTypes((r?.assignmentTypes as OrgAssignmentTypeOption[]) ?? []);
        });
        return () => {
            alive = false;
        };
    }, [lens, assignmentTypes]);

    // ── Durable population bootstrap — loaded once, on first need ────────────
    //
    // Deferred until Staff or Children is actually opened: the operating day is what Roster opens
    // on, and paying for positions + service date on every Roster open would make the common case
    // slower to serve a section the operator may never visit.
    const needsPeopleBootstrap = section === "staff" || section === "children";
    useEffect(() => {
        if (!needsPeopleBootstrap || peopleBootstrap) return;
        let alive = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/records/bootstrap", { credentials: "include" });
                const json = (await res.json()) as {
                    ok?: boolean;
                    positions?: { id: string; key: string | null; label: string }[];
                    todayYmd?: string;
                };
                if (!alive || !json.ok) return;
                setPeopleBootstrap({
                    positions: json.positions ?? [],
                    todayYmd: json.todayYmd ?? new Date().toISOString().slice(0, 10),
                });
            } catch {
                // The sections still work without positions (they only shape Staff cohorts), and a
                // failed bootstrap must not leave the operator on a permanent spinner.
                if (alive) {
                    setPeopleBootstrap({ positions: [], todayYmd: new Date().toISOString().slice(0, 10) });
                }
            }
        })();
        return () => {
            alive = false;
        };
    }, [needsPeopleBootstrap, peopleBootstrap]);

    // ── Deep link ────────────────────────────────────────────────────────────
    /**
     * Every link ever written to Roster, Records or Assignments arrives here.
     *
     * A STUDIO destination is checked first and returns, because Studio and Work are mutually
     * exclusive placements: a link naming `types` wants Assignment Categories, and also applying a
     * work section for it would leave the workspace in Studio while a Work tab reads as selected.
     */
    const applyDeepLink = useCallback((detail: OpenRosterModalDetail | null) => {
        if (!detail) return;
        // Site first — it applies to both modes, and a Studio link carrying one means "configure
        // THIS site's patterns".
        if (detail.siteLocationId) {
            siteChosenRef.current = true;
            setSiteId(detail.siteLocationId);
        }
        const studio = resolveOperationsStudioSection(detail.studioSection ?? null);
        if (studio) {
            setMode("studio");
            setStudioSection(studio);
            return;
        }
        setMode("work");
        const resolved = resolveRosterSection(detail.section);
        if (resolved) setSection(resolved);
        if (detail.range) setRange(detail.range);
        if (detail.lens) setLens(detail.lens);
        if (detail.roomLocationId) {
            setFocusRoomId(detail.roomLocationId);
            setAttendanceRoomId(detail.roomLocationId);
        }
        if (detail.filter) setRosterFilter(detail.filter as RosterFilterKind);
    }, []);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(ROSTER_WORKSPACE_DEEPLINK_KEY);
            if (raw) {
                sessionStorage.removeItem(ROSTER_WORKSPACE_DEEPLINK_KEY);
                applyDeepLink(JSON.parse(raw) as OpenRosterModalDetail);
            }
        } catch {
            /* ignore */
        }
        const onOpen = (event: Event) =>
            applyDeepLink((event as CustomEvent<OpenRosterModalDetail>).detail ?? null);
        window.addEventListener("adminv2:open-roster-modal", onOpen);
        return () => window.removeEventListener("adminv2:open-roster-modal", onOpen);
    }, [applyDeepLink]);

    // ── Sites ────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const res = await schedApi("?view=sites");
            if (cancelled) return;
            const list = (res?.sites ?? []) as RosterSite[];
            setSites(list);
            if (!siteChosenRef.current && list.length > 0) {
                setSiteId((prev) => prev || list[0].id);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Week roster + assignment subjects for the selected site ──────────────
    const loadWeek = useCallback(
        async (id: string, weekStart: string) => {
            if (!id) return;
            const cacheKey = weekStart || "__current__";
            const cached = weekCache.current.get(cacheKey);
            if (cached) {
                setWeek(cached);
                setWeekChangePending(false);
                return;
            }
            const seq = ++loadSeq.current;
            setLoadingWeek(true);
            const qs = `?view=roster&site_location_id=${encodeURIComponent(id)}${
                weekStart ? `&week_of=${encodeURIComponent(weekStart)}` : ""
            }`;
            const res = await schedApi(qs);
            if (seq !== loadSeq.current) return;
            const data = (res?.roster ?? null) as RosterData | null;
            if (data?.weekStart) {
                weekCache.current.set(data.weekStart, data);
                if (!weekStart) weekCache.current.set("__current__", data);
            }
            setWeek(data);
            setLoadingWeek(false);
            setWeekChangePending(false);
            // Adjacent weeks, so stepping through the plan is instant.
            if (data?.weekStart) {
                for (const offset of [-7, 7]) {
                    const w = addDaysYmdLocal(data.weekStart, offset);
                    if (weekCache.current.has(w)) continue;
                    void schedApi(
                        `?view=roster&site_location_id=${encodeURIComponent(id)}&week_of=${encodeURIComponent(w)}`,
                    ).then((r) => {
                        const d = (r?.roster ?? null) as RosterData | null;
                        if (d?.weekStart) weekCache.current.set(d.weekStart, d);
                    });
                }
            }
        },
        [],
    );

    useEffect(() => {
        if (!siteId) return;
        weekCache.current.clear();
        setWeek(null);
        setSubjects(null);
        void loadWeek(siteId, "");
        const seq = ++assignSeq.current;
        void schedApi(`?view=assignment_roster&site_location_id=${encodeURIComponent(siteId)}`).then(
            (res) => {
                if (seq !== assignSeq.current) return;
                setSubjects((res?.subjects ?? []) as AssignmentRosterSubject[]);
            },
        );
    }, [siteId, loadWeek]);

    const onWeekChange = useCallback(
        (dir: -1 | 1 | 0) => {
            if (!siteId) return;
            setWeekChangePending(true);
            if (dir === 0) {
                void loadWeek(siteId, "");
                return;
            }
            const base = week?.weekStart ?? "";
            if (!base) {
                void loadWeek(siteId, "");
                return;
            }
            void loadWeek(siteId, addDaysYmdLocal(base, dir * 7));
        },
        [siteId, week, loadWeek],
    );

    const onSelectWeek = useCallback(
        (weekStart: string) => {
            if (!siteId) return;
            setWeekChangePending(true);
            void loadWeek(siteId, weekStart || "");
        },
        [siteId, loadWeek],
    );

    const siteName = useMemo(
        () => sites?.find((s) => s.id === siteId)?.name ?? "All sites",
        [sites, siteId],
    );

    /**
     * Re-read the commitments this workspace already loads, after one changes.
     *
     * The WEEK is invalidated too, and that is the point of Roster being a projection of commitments
     * rather than a plan of its own: change an assignment and who is expected where changes with it.
     * A lens that refreshed only its own list would leave the Rooms board asserting the old plan.
     */
    const reloadAssignments = useCallback(() => {
        if (!siteId) return;
        const seq = ++assignSeq.current;
        void schedApi(`?view=assignment_roster&site_location_id=${encodeURIComponent(siteId)}`).then(
            (res) => {
                if (seq !== assignSeq.current) return;
                setSubjects((res?.subjects ?? []) as AssignmentRosterSubject[]);
            },
        );
        weekCache.current.clear();
        void loadWeek(siteId, week?.weekStart ?? "");
    }, [siteId, loadWeek, week?.weekStart]);

    /*
     * ── AN EDITED COMMITMENT RELOADS THE PROJECTION ──
     *
     * The durable host announces a close with `changed`, and Staff/Children already listen for their
     * own rows. Roster listens for the same signal because an assignment write changes something it
     * PROJECTS rather than something it lists: who is expected where, and the ledger the Assignments
     * lens reads.
     *
     * `changed` is respected, not ignored — a record that was only looked at must not cost a
     * re-query. And Roster RE-READS rather than patching a row it already has: an optimistic edit
     * here would be a second answer about a commitment whose authority is the ledger.
     */
    useEffect(() => {
        const onClosed = (ev: Event) => {
            const detail = (ev as CustomEvent<DurableRecordClosedDetail>).detail;
            if (!detail?.changed) return;
            reloadAssignments();
        };
        window.addEventListener(DURABLE_RECORD_CLOSED_EVENT, onClosed);
        return () => window.removeEventListener(DURABLE_RECORD_CLOSED_EVENT, onClosed);
    }, [reloadAssignments]);

    /*
     * The ledger's bulk commands for the Assignments lens.
     *
     * Built by the SAME factory the Assignments workspace uses — one wiring, one set of canonical
     * action keys, one grain guard. Roster supplies its own refresh because it owns its own reads;
     * nothing about what the commands DO is decided here.
     */
    const assignmentBulk = useMemo(
        () =>
            buildAssignmentRosterBulkHandlers({
                subjects: subjects ?? [],
                // The org's configured Assignment Categories, from `?view=assignment_types` — the
                // SAME endpoint and the same `loadOrgAssignmentTypes` owner the Assignments
                // workspace reads. Studio remains where they are authored; this is a read of that
                // configuration, never a Roster-local list.
                assignmentTypes: assignmentTypes ?? [],
                siteId,
                onRefresh: reloadAssignments,
                // Single-subject create belongs to the child's own record, not to a second modal in
                // the lens: the operator opens the child and uses the canonical Schedule card, which
                // is the same surface every other single-assignment gesture now reaches.
                onCreateForChild: (customerMemberId) => {
                    void focusRecord({
                        entity_type: "customer_members",
                        entity_id: customerMemberId,
                        intent: "durable_record",
                        preferred_context_key: "schedule",
                    });
                },
            }),
        [subjects, assignmentTypes, siteId, reloadAssignments, focusRecord],
    );

    /**
     * Operational health for the control band — the day's counts when showing a
     * day, the week's when showing a week. A room the platform could not evaluate
     * is counted as unknown, never folded into a healthy number.
     */
    const healthCounts: RosterHealthCounts | null = useMemo(() => {
        if (range === "day") return dayHealth;
        if (!week) return null;
        const operating = (r: RosterData["rooms"][number]) =>
            r.cells.some((c) => (c.occupancy ?? 0) > 0 || (c.scheduledStaffCount ?? 0) > 0);
        return {
            roomsShort: week.rooms.filter((r) => r.staffing?.verdict === "short").length,
            roomsUnknown: week.rooms.filter(
                (r) => r.staffing?.verdict === "unknown" && operating(r),
            ).length,
            expectedChildren: week.rooms.reduce(
                (n, r) => n + r.cells.reduce((m, c) => m + (c.occupancy ?? 0), 0),
                0,
            ),
            scheduledStaff: week.rooms.reduce(
                (n, r) => n + r.cells.reduce((m, c) => m + (c.scheduledStaffCount ?? 0), 0),
                0,
            ),
        };
    }, [range, dayHealth, week]);

    const filterContext: RosterFilterContext | null = useMemo(() => {
        if (!rosterFilter || !week) return null;
        if (rosterFilter === "ratio_risk") {
            const rooms = week.rooms.filter((r) => r.staffing?.verdict === "short");
            return {
                kind: "ratio_risk",
                label: "Rooms needing staffing attention",
                count: rooms.length,
                highlightRoomIds: rooms.map((r) => r.roomId),
            };
        }
        if (rosterFilter === "near_capacity") {
            const rooms = week.rooms.filter((r) => r.cells.some((c) => c.state === "breach" || c.pct >= 85));
            return {
                kind: "near_capacity",
                label: "Rooms near capacity",
                count: rooms.length,
                highlightRoomIds: rooms.map((r) => r.roomId),
            };
        }
        return null;
    }, [rosterFilter, week]);

    return (
        <OperationsWorkspaceShell
            mode={mode}
            /*
             * SWITCHING MODE CHANGES NOTHING ELSE.
             *
             * `mode` is the only state a Work ↔ Studio switch touches: site, date, week, Roster lens,
             * focused room, filter, and every section's own cohort/offset/scroll all live in state
             * that stays mounted. Studio renders BESIDE Work rather than replacing this component,
             * so returning from Studio returns to the operating day exactly as it was left.
             *
             * That is a structural property, not a restore step — there is no snapshot to take and
             * nothing to put back, which is why there is no code here doing either.
             */
            onModeChange={setMode}
            workSection={section}
            studioSection={studioSection}
            onWorkSectionChange={(next) => {
                setSection(next);
                if (next !== "roster") {
                    setFocusRoomId(undefined);
                    setRosterFilter(null);
                }
            }}
            onStudioSectionChange={setStudioSection}
            sites={sites}
            siteId={siteId}
            onSiteChange={(next) => {
                siteChosenRef.current = true;
                setSiteId(next);
            }}
            siteName={siteName}
            onClose={onClose}
            metricsColumn={
                mode === "work" && section === "roster" ? (
                    <RosterKpiStrip counts={healthCounts} range={range} loading={loadingWeek && !healthCounts} />
                ) : undefined
            }
        >
            {/*
              * The record host wraps the whole body, so opening Lennon layers his record OVER the
              * section rather than replacing it. Nothing below is unmounted while a record is open,
              * which is why the cohort, the server-paged offset, the filter and the scroll are still
              * there on close — a structural property, not something restored afterwards.
              */}
            <WorkspaceDurableRecordHost hostKey="roster">
            <WorkspaceSurface
                tone={mode === "work" && section === "roster" ? "canvas" : "stone"}
                scroll
                padded
            >
                {/*
                  * STUDIO — configuration, beside the operating day rather than instead of it.
                  *
                  * Rendered inside the SAME surface and the same record host, so entering Studio does
                  * not unmount Work. That is what makes returning free: there is no state to restore
                  * because none was ever torn down.
                  */}
                {mode === "studio" ? (
                    <OperationsStudio
                        view={studioSection}
                        siteId={siteId}
                        siteName={siteName}
                        sites={(sites ?? []).map((s) => ({ id: s.id, name: s.name }))}
                    />
                ) : null}

                {mode === "work" && section === "roster" ? (
                    <RosterSurface
                        range={range}
                        onRangeChange={setRange}
                        lens={lens}
                        onLensChange={setLens}
                        siteLocationId={siteId}
                        siteName={siteName}
                        weekData={week}
                        assignmentSubjects={subjects ?? []}
                        assignmentBulk={assignmentBulk}
                        loadingWeek={loadingWeek}
                        focusRoomId={focusRoomId}
                        filter={filterContext}
                        onClearFilter={() => setRosterFilter(null)}
                        onSelectRoom={(roomId) => setFocusRoomId(roomId)}
                        onSelectCell={(roomId) => setFocusRoomId(roomId)}
                        onWeekChange={onWeekChange}
                        onSelectWeek={onSelectWeek}
                        weekChangePending={weekChangePending}
                        onDayHealth={setDayHealth}
                        onOpenAttendance={(roomLocationId) => {
                            // Expectation → actuality, inside one workspace. Site is
                            // already shared; the room travels; the date does not need
                            // to, because Roster only offers this on the org's today
                            // and Attendance resolves that date itself.
                            setAttendanceRoomId(roomLocationId);
                            setSection("attendance");
                        }}
                        onManageAssignment={(subject) => {
                            /*
                             * ── THE HANDOFF THAT LEFT OPERATIONS, REMOVED ──
                             *
                             * This dispatched `adminv2:open-scheduling-modal` and took the operator
                             * to a different workspace to change a commitment — costing them the
                             * lens, the site, the date and the filter they had set up, and making
                             * "Assignments" a destination again.
                             *
                             * It now opens the subject's own durable record OVER Roster, with the
                             * Schedule context preferred, so the canonical `scheduling` card is what
                             * they land on. Same six RegisteredActions, same card; the difference is
                             * that Roster stays mounted underneath and is still there on close.
                             *
                             * `focusRecord`, NOT `focusRecordAndYield`: yielding closes this
                             * workspace, which is right when the destination REPLACES Roster and
                             * exactly wrong here, where the record opens on top of it.
                             */
                            const isStaff = subject.subjectType === "staff";
                            const entityId = isStaff ? subject.personId : subject.customerMemberId;
                            if (!entityId) return;
                            void focusRecord({
                                entity_type: isStaff ? "persons" : "customer_members",
                                entity_id: entityId,
                                intent: "durable_record",
                                preferred_context_key: "schedule",
                            });
                        }}
                        onOpenChild={(child) => {
                            if (!child.personId) return false;
                            return focusRecordAndYield({
                                entity_type: "persons",
                                entity_id: child.personId,
                                card_focus: {
                                    card_key: OPERATOR_FOCUS_CARDS.children,
                                    item_id: child.personId,
                                },
                            });
                        }}
                        onOpenStaff={(staff) =>
                            focusRecordAndYield({
                                entity_type: "persons",
                                entity_id: staff.personId,
                                card_focus: {
                                    card_key: OPERATOR_FOCUS_CARDS.employment,
                                    item_id: staff.personId,
                                },
                            })
                        }
                        onOpenStaffSubject={(staff) =>
                            focusRecordAndYield({
                                entity_type: "persons",
                                entity_id: staff.personId,
                                card_focus: {
                                    card_key: OPERATOR_FOCUS_CARDS.employment,
                                    item_id: staff.personId,
                                },
                            })
                        }
                    />
                ) : null}

                {mode === "work" && section === "attendance" ? (
                    <AttendanceWorkspace
                        siteLocationId={siteId}
                        siteName={siteName}
                        initialRoomId={attendanceRoomId}
                        onBackToRoster={(roomLocationId) => {
                            // The reciprocal move. Site is workspace state and the day
                            // roster resolves the org's today itself, so returning only
                            // has to carry the room.
                            if (roomLocationId) setFocusRoomId(roomLocationId);
                            setRange("day");
                            setSection("roster");
                        }}
                        onOpenChild={(child) => {
                            if (!child.personId) return false;
                            return focusRecordAndYield({
                                entity_type: "persons",
                                entity_id: child.personId,
                                card_focus: {
                                    card_key: OPERATOR_FOCUS_CARDS.children,
                                    item_id: child.personId,
                                },
                            });
                        }}
                        onOpenStaff={(staff) =>
                            focusRecordAndYield({
                                entity_type: "persons",
                                entity_id: staff.personId,
                                card_focus: {
                                    card_key: OPERATOR_FOCUS_CARDS.employment,
                                    item_id: staff.personId,
                                },
                            })
                        }
                    />
                ) : null}

                {/*
                  * The durable population. Recomposed, not rewritten: the same section components,
                  * the same server-owned cohort projections and the same record gesture Records
                  * shipped — now with Roster's site actually supplied to Children, which Records
                  * could never do because it had no site picker.
                  */}
                {mode === "work" && section === "staff" ? (
                    peopleBootstrap ? (
                        <RecordsStaffSection
                            positions={peopleBootstrap.positions}
                            sites={(sites ?? []).map((s) => ({ id: s.id, label: s.name }))}
                            todayYmd={peopleBootstrap.todayYmd}
                        />
                    ) : (
                        <p className="px-2 py-6 text-[12px] text-alloy-midnight/50">Loading staff…</p>
                    )
                ) : null}

                {mode === "work" && section === "children" ? (
                    peopleBootstrap ? (
                        /*
                         * NOT scoped by the workspace's site picker, and that is deliberate.
                         *
                         * Passing Roster's `siteId` here looked like a free win — the prop existed
                         * and Records never had a site to supply. Browser certification showed what
                         * it actually does: site scope is implemented as "children with an ACTIVE
                         * `child_placements` row at that site", the picker defaults to the first
                         * site rather than All, and in the certification tenant NOT ONE of 1500
                         * children holds an active placement. Children rendered empty, and an empty
                         * list reads as "this tenant has no children" rather than "you are looking
                         * at one site's placements".
                         *
                         * The deeper reason it was wrong: this section is the DURABLE population —
                         * a child is here because the household record exists, not because a
                         * placement is running. Scoping it by today's operating site contradicts
                         * the section's own doctrine. The header control means "which site's
                         * operating day", which is Roster and Attendance; it does not mean "which
                         * children exist".
                         *
                         * A site filter FOR Children would be a product decision with its own
                         * control and its own default — not a side effect of sharing a header.
                         */
                        <RecordsChildrenSection todayYmd={peopleBootstrap.todayYmd} />
                    ) : (
                        <p className="px-2 py-6 text-[12px] text-alloy-midnight/50">Loading children…</p>
                    )
                ) : null}
            </WorkspaceSurface>
            </WorkspaceDurableRecordHost>
        </OperationsWorkspaceShell>
    );
}
