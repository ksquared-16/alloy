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

import RosterWorkspaceShell, { type RosterSite } from "@/app/adminV2/roster/RosterWorkspaceShell";
import RosterKpiStrip, { type RosterHealthCounts } from "@/app/adminV2/roster/RosterKpiStrip";
import {
    resolveRosterSection,
    type RosterSection,
} from "@/app/adminV2/roster/rosterSections";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import RosterSurface, { type RosterLens } from "@/components/adminV2/scheduling/screens/RosterSurface";
import { buildAssignmentRosterBulkHandlers } from "@/lib/adminV2/scheduling/assignmentRosterBulkHandlers";
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
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import {
    dispatchAdminV2OpenSchedulingModal,
    ROSTER_WORKSPACE_DEEPLINK_KEY,
    type OpenRosterModalDetail,
} from "@/lib/adminV2/workspaceModalEvents";
import type { RosterRange } from "@/app/adminV2/scheduling/schedulingSections";

async function schedApi(path: string): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, {
        headers: { "content-type": "application/json" },
    });
    return res.json().catch(() => ({}));
}

export default function RosterWorkspace({ onClose }: { onClose?: () => void }) {
    const [section, setSection] = useState<RosterSection>("roster");
    const [range, setRange] = useState<RosterRange>("day");
    const [lens, setLens] = useState<RosterLens>("rooms");

    const [sites, setSites] = useState<RosterSite[] | null>(null);
    const [siteId, setSiteId] = useState<string>("");
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

    /** Stale-response guard for every site-scoped load. */
    const loadSeq = useRef(0);
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
    const applyDeepLink = useCallback((detail: OpenRosterModalDetail | null) => {
        if (!detail) return;
        const resolved = resolveRosterSection(detail.section);
        if (resolved) setSection(resolved);
        if (detail.range) setRange(detail.range);
        if (detail.lens) setLens(detail.lens);
        if (detail.roomLocationId) {
            setFocusRoomId(detail.roomLocationId);
            setAttendanceRoomId(detail.roomLocationId);
        }
        if (detail.filter) setRosterFilter(detail.filter as RosterFilterKind);
        if (detail.siteLocationId) {
            siteChosenRef.current = true;
            setSiteId(detail.siteLocationId);
        }
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
        const seq = loadSeq.current;
        void schedApi(`?view=assignment_roster&site_location_id=${encodeURIComponent(siteId)}`).then(
            (res) => {
                if (seq !== loadSeq.current) return;
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
        const seq = loadSeq.current;
        void schedApi(`?view=assignment_roster&site_location_id=${encodeURIComponent(siteId)}`).then(
            (res) => {
                if (seq !== loadSeq.current) return;
                setSubjects((res?.subjects ?? []) as AssignmentRosterSubject[]);
            },
        );
        weekCache.current.clear();
        void loadWeek(siteId, week?.weekStart ?? "");
    }, [siteId, loadWeek, week?.weekStart]);

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
                // Bulk ASSIGN's type picker needs the org's assignment types. Roster does not load
                // them, so that one mode is unavailable here rather than offered against an empty
                // list — an empty picker reads as "this org has no types", which is a claim.
                assignmentTypes: [],
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
        [subjects, siteId, reloadAssignments, focusRecord],
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
        <RosterWorkspaceShell
            section={section}
            onSectionChange={(next) => {
                setSection(next);
                if (next !== "roster") {
                    setFocusRoomId(undefined);
                    setRosterFilter(null);
                }
            }}
            sites={sites}
            siteId={siteId}
            onSiteChange={(next) => {
                siteChosenRef.current = true;
                setSiteId(next);
            }}
            siteName={siteName}
            onClose={onClose}
            metricsColumn={
                section === "roster" ? (
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
            <WorkspaceSurface tone={section === "roster" ? "canvas" : "stone"} scroll padded>
                {section === "roster" ? (
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
                            // Roster writes nothing. The authoritative surface is
                            // Assignments, in its own workspace, opened at this subject.
                            dispatchAdminV2OpenSchedulingModal({
                                mode: "work",
                                workView: "assignments",
                                siteLocationId: siteId || null,
                                focusSubject:
                                    subject.subjectType === "staff"
                                        ? { personId: subject.personId }
                                        : {
                                              customerMemberId: subject.customerMemberId,
                                              enrollmentAgreementId: subject.enrollmentAgreementId,
                                          },
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

                {section === "attendance" ? (
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
                {section === "staff" ? (
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

                {section === "children" ? (
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
        </RosterWorkspaceShell>
    );
}
