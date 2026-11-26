/**
 * BP V2 Slice 3 — the five Assignments projections, the workspace-selected location, and the temporal
 * rules (child single operational primary per agreement vs staff non-overlapping primaries), proven over
 * an in-memory PostgREST subset that applies the same filters and paging the database would.
 */

import { describe, expect, it, vi } from "vitest";

// The org-local business date is the resolver's input; pinned so boundaries are exact.
vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", () => ({
    resolveOperationalEnrollmentTodayYmd: async () => "2026-10-20",
}));

import {
    addDaysYmd,
    loadAssignmentUpcomingChanges,
    loadAssignmentsEndingSoon,
    loadAssignmentsProposedIncomplete,
    loadCurrentAssignments,
    loadScheduleGaps,
} from "@/lib/businessProcesses/projections/assignmentsProjections";
import { loadChargesNeedingReview } from "@/lib/businessProcesses/projections/chargesNeedingReviewProjection";
import { DOMAIN_PROJECTIONS, domainProjectionScopeFromAccess, loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import { DOMAIN_PROJECTION_CATALOG } from "@/lib/businessProcesses/projections/domainProjectionCatalog";
import { effectiveProjectionSiteIds, type DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import { domainProjectionQueueRowContext } from "@/lib/businessProcesses/projections/domainProjectionQueueRow";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { projectionTableStub } from "./projectionTableStub";

const ORG = "11111111-1111-4111-8111-000000000001";
const TODAY = "2026-10-20";
const SITE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const ROOM_1 = "cccccccc-0000-4000-8000-00000000000c";
const ROOM_2 = "dddddddd-0000-4000-8000-00000000000d";
const TYPE = "eeeeeeee-0000-4000-8000-00000000000e";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };
const ctx = (scope: DomainProjectionScope = ALL) => ({ orgId: ORG, userId: "u1", scope });
const opts = { todayYmd: TODAY };

function a(over: Row): Row {
    return {
        org_id: ORG, subject_type: "child", customer_member_id: null, subject_person_id: null, enrollment_agreement_id: null,
        site_location_id: SITE_A, room_location_id: ROOM_1, operational_assignment_type_id: TYPE, supersedes_assignment_id: null,
        is_primary: true, status: "active", commitment_kind: "committed", start_date: "2026-09-01", end_date: null, ...over,
    };
}
const reference = {
    locations: [
        { id: SITE_A, org_id: ORG, label: "Riverside" },
        { id: SITE_B, org_id: ORG, label: "Lakeside" },
        { id: ROOM_1, org_id: ORG, label: "Toddler Room" },
        { id: ROOM_2, org_id: ORG, label: "Preschool Room" },
    ],
    operational_assignment_types: [{ id: TYPE, org_id: ORG, label: "Full day" }],
    customer_members: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: uuid(n), org_id: ORG, display_name: `Child ${n}` })),
    persons: [{ id: uuid(90), org_id: ORG, first_name: "Sam", last_name: "Staff" }, { id: uuid(91), org_id: ORG, first_name: "Ria", last_name: "Lead" }],
};
const db = (assignments: Row[], extra: Record<string, Row[]> = {}) => projectionTableStub({ ...reference, schedule_assignments: assignments, ...extra });

describe("A · Current Assignments — the canonical resolver, people not assignments", () => {
    it("one row per subject; counts the assignments behind it; carries site, room, type and dates", async () => {
        const r = await loadCurrentAssignments(db([
            a({ id: uuid(101), customer_member_id: uuid(1) }),
            a({ id: uuid(102), customer_member_id: uuid(1), is_primary: false, room_location_id: ROOM_2 }),
            a({ id: uuid(103), customer_member_id: uuid(2), status: "planned" }), // stored status lags the calendar → Active
            a({ id: uuid(104), customer_member_id: uuid(3), status: "superseded", end_date: "2026-12-31" }), // Completed
            a({ id: uuid(105), customer_member_id: uuid(4), end_date: TODAY }), // ends today → still Active
            a({ id: uuid(106), customer_member_id: uuid(5), end_date: "2026-10-19" }), // ended yesterday
        ]), ctx(), opts);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const byId = new Map(r.rows.map((x) => [x.subject.id, x]));
        expect([...byId.keys()].sort()).toEqual([uuid(1), uuid(2), uuid(4)]);
        const one = byId.get(uuid(1))!;
        expect(one.source).toMatchObject({ id: uuid(101), count: 2 });
        expect(one.detail).toMatchObject({ siteLabel: "Riverside", roomLabel: "Toddler Room", assignmentTypeLabel: "Full day", startDate: "2026-09-01", isPrimary: true });
        expect(one.detail?.reason).toBe("Primary since Sep 1 · 2 assignments");
    });
});

describe("B · Ending Soon — 30 days including today, committed truth only", () => {
    it("boundaries: today and today+29 are in; today+30 and yesterday are out; superseded/proposed excluded", async () => {
        const r = await loadAssignmentsEndingSoon(db([
            a({ id: uuid(201), customer_member_id: uuid(1), end_date: TODAY }),
            a({ id: uuid(202), customer_member_id: uuid(2), end_date: addDaysYmd(TODAY, 29) }),
            a({ id: uuid(203), customer_member_id: uuid(3), end_date: addDaysYmd(TODAY, 30) }),
            a({ id: uuid(204), customer_member_id: uuid(4), end_date: "2026-10-19" }),
            a({ id: uuid(205), customer_member_id: uuid(5), end_date: "2026-10-25", status: "superseded" }),
            a({ id: uuid(206), customer_member_id: uuid(6), end_date: "2026-10-25", commitment_kind: "proposed", status: "planned" }),
            a({ id: uuid(207), customer_member_id: uuid(7), end_date: "2026-10-29", status: "canceled" }),
        ]), ctx(), opts);
        expect(r.ok && r.rows.map((x) => [x.subject.id, x.detail?.reason, x.detail?.daysUntil])).toEqual([
            [uuid(1), "Ends Oct 20 · today", 0],
            [uuid(2), "Ends Nov 18 · in 29 days", 29],
        ]);
    });

    it("a staff member's current primary ending while a future non-overlapping primary waits", async () => {
        const rows = [
            a({ id: uuid(211), subject_type: "staff", subject_person_id: uuid(90), customer_member_id: null, end_date: "2026-10-29" }),
            a({ id: uuid(212), subject_type: "staff", subject_person_id: uuid(90), customer_member_id: null, start_date: "2026-10-30", status: "planned" }),
        ];
        const ending = await loadAssignmentsEndingSoon(db(rows), ctx(), opts);
        expect(ending.ok && ending.rows.map((x) => [x.subject.type, x.source.id, x.detail?.reason])).toEqual([["person", uuid(211), "Ends Oct 29 · in 9 days"]]);
        const current = await loadCurrentAssignments(db(rows), ctx(), opts);
        expect(current.ok && current.rows.map((x) => x.source.id)).toEqual([uuid(211)]); // the future one is NOT current
        const upcoming = await loadAssignmentUpcomingChanges(db(rows), ctx(), opts);
        expect(upcoming.ok && upcoming.rows.map((x) => [x.source.id, x.detail?.reason])).toEqual([[uuid(212), "Primary change starts Oct 30"]]);
    });
});

describe("C · Upcoming Changes — classification from provenance, never current", () => {
    it("child primary change supersedes now: the successor is Upcoming, classified by the superseded row", async () => {
        const rows = [
            // the present row was superseded at once (child single-operational rule)
            a({ id: uuid(301), customer_member_id: uuid(1), status: "superseded", end_date: "2026-11-01" }),
            a({ id: uuid(302), customer_member_id: uuid(1), status: "planned", start_date: "2026-11-02", supersedes_assignment_id: uuid(301), room_location_id: ROOM_2 }),
            a({ id: uuid(303), customer_member_id: uuid(2), status: "superseded", end_date: "2026-11-04" }),
            a({ id: uuid(304), customer_member_id: uuid(2), status: "planned", start_date: "2026-11-05", supersedes_assignment_id: uuid(303) }),
            a({ id: uuid(305), customer_member_id: uuid(3), status: "planned", start_date: "2026-11-10", is_primary: false }),
            a({ id: uuid(306), customer_member_id: uuid(4), status: "planned", start_date: addDaysYmd(TODAY, 31) }), // outside window
            a({ id: uuid(307), customer_member_id: uuid(5), status: "planned", start_date: TODAY }), // today = current, not upcoming
        ];
        const r = await loadAssignmentUpcomingChanges(db(rows), ctx(), opts);
        expect(r.ok && r.rows.map((x) => [x.subject.id, x.detail?.reason])).toEqual([
            [uuid(1), "New room starts Nov 2"],
            [uuid(2), "Replacement starts Nov 5"],
            [uuid(3), "New assignment starts Nov 10"],
        ]);
        const current = await loadCurrentAssignments(db(rows), ctx(), opts);
        expect(current.ok && current.rows.map((x) => x.subject.id)).toEqual([uuid(5)]);
    });
});

describe("D · Schedule Gaps — operational agreements with no committed coverage", () => {
    const agreements = [
        { id: uuid(401), org_id: ORG, customer_member_id: uuid(1), site_location_id: SITE_A, status: "active", start_date: "2026-09-01", end_date: null },
        { id: uuid(402), org_id: ORG, customer_member_id: uuid(2), site_location_id: SITE_A, status: "active", start_date: "2026-09-01", end_date: null },
        { id: uuid(403), org_id: ORG, customer_member_id: uuid(3), site_location_id: SITE_B, status: "pending_start", start_date: "2026-11-15", end_date: null },
        { id: uuid(404), org_id: ORG, customer_member_id: uuid(4), site_location_id: SITE_A, status: "ended", start_date: "2026-01-01", end_date: "2026-06-30" },
        { id: uuid(405), org_id: ORG, customer_member_id: uuid(5), site_location_id: SITE_A, status: "active", start_date: "2026-09-01", end_date: null },
        { id: uuid(406), org_id: ORG, customer_member_id: uuid(6), site_location_id: SITE_A, status: "active", start_date: "2026-09-01", end_date: null },
    ];
    const assignments = [
        a({ id: uuid(411), customer_member_id: uuid(1), enrollment_agreement_id: uuid(401) }), // covered (Active)
        a({ id: uuid(412), customer_member_id: uuid(2), enrollment_agreement_id: uuid(402), status: "superseded", end_date: "2026-12-31" }), // NOT coverage
        a({ id: uuid(415), customer_member_id: uuid(5), enrollment_agreement_id: uuid(405), status: "superseded", end_date: "2026-10-31" }),
        a({ id: uuid(416), customer_member_id: uuid(5), enrollment_agreement_id: uuid(405), status: "planned", start_date: "2026-11-01" }), // planned successor IS coverage
        a({ id: uuid(417), customer_member_id: uuid(6), enrollment_agreement_id: uuid(406), commitment_kind: "proposed", status: "planned" }), // proposed is not committed
    ];

    it("superseded rows are not coverage; a planned successor is; ended agreements require nothing", async () => {
        const r = await loadScheduleGaps(db(assignments, { child_enrollment_agreements: agreements }), ctx(), opts);
        expect(r.ok && r.rows.map((x) => [x.subject.id, x.source.kind, x.source.id, x.detail?.reason]).sort()).toEqual([
            [uuid(2), "enrollment_agreement", uuid(402), "No committed schedule"],
            [uuid(3), "enrollment_agreement", uuid(403), "No committed schedule · agreement starts Nov 15"],
            [uuid(6), "enrollment_agreement", uuid(406), "No committed schedule"],
        ].sort());
    });

    it("site-scoped by the agreement's site", async () => {
        const r = await loadScheduleGaps(db(assignments, { child_enrollment_agreements: agreements }), ctx({ ...ALL, selectedSiteId: SITE_B }), opts);
        expect(r.ok && r.rows.map((x) => x.subject.id)).toEqual([uuid(3)]);
    });
});

describe("E · Proposed / Incomplete — stored facts only", () => {
    it("proposed awaiting disposition; committed missing its type; nothing else", async () => {
        const r = await loadAssignmentsProposedIncomplete(db([
            a({ id: uuid(501), customer_member_id: uuid(1), commitment_kind: "proposed", status: "planned" }),
            a({ id: uuid(502), customer_member_id: uuid(2), operational_assignment_type_id: null }),
            a({ id: uuid(503), customer_member_id: uuid(3) }), // complete
            a({ id: uuid(504), customer_member_id: uuid(4), operational_assignment_type_id: null, end_date: "2026-10-01" }), // ended
            a({ id: uuid(505), customer_member_id: uuid(5), operational_assignment_type_id: null, status: "canceled" }),
            a({ id: uuid(506), customer_member_id: uuid(6), commitment_kind: "proposed", status: "planned", operational_assignment_type_id: null }),
            a({ id: uuid(507), customer_member_id: uuid(6), operational_assignment_type_id: null, is_primary: false }),
        ]), ctx(), opts);
        const byId = new Map((r.ok ? r.rows : []).map((x) => [x.subject.id, x.detail?.reason]));
        expect([...byId.keys()].sort()).toEqual([uuid(1), uuid(2), uuid(6)]);
        expect(byId.get(uuid(1))).toBe("Proposed assignment awaiting disposition");
        expect(byId.get(uuid(2))).toBe("Missing assignment type");
        // The proposed row is not ALSO "missing type": that category is committed truth only.
        expect(byId.get(uuid(6))).toBe("Proposed assignment awaiting disposition · Missing assignment type");
    });
});

describe("workspace-selected location — narrows, never widens", () => {
    it("the effective sites are actor ∩ selection", () => {
        expect(effectiveProjectionSiteIds(ALL)).toBeNull();
        expect(effectiveProjectionSiteIds({ ...ALL, selectedSiteId: SITE_B })).toEqual([SITE_B]);
        expect(effectiveProjectionSiteIds({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A] })).toEqual([SITE_A]);
        expect(effectiveProjectionSiteIds({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A], selectedSiteId: SITE_A })).toEqual([SITE_A]);
        expect(effectiveProjectionSiteIds({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A], selectedSiteId: SITE_B })).toEqual([]);
        expect(domainProjectionScopeFromAccess({ departmentScope: "all", allowedDepartmentIds: [], siteScope: "restricted", allowedSiteLocationIds: [SITE_A] } as never, SITE_B)).toMatchObject({ selectedSiteId: SITE_B });
    });

    it("changing the location changes rows AND totals together (one cohort)", async () => {
        const rows = [
            a({ id: uuid(601), customer_member_id: uuid(1), site_location_id: SITE_A }),
            a({ id: uuid(602), customer_member_id: uuid(2), site_location_id: SITE_B }),
            a({ id: uuid(603), customer_member_id: uuid(3), site_location_id: SITE_B, is_primary: false }),
        ];
        const read = (scope: DomainProjectionScope) => loadDomainProjectionCohort(db(rows), { domain: "assignments", projectionKey: "current_assignments", orgId: ORG, userId: "u1", scope });
        const all = await read(ALL);
        const b = await read({ ...ALL, selectedSiteId: SITE_B });
        const outside = await read({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A], selectedSiteId: SITE_B });
        expect(all.status === "ok" && [all.total, all.rows.length, all.factTotal]).toEqual([3, 3, 3]);
        expect(b.status === "ok" && [b.total, b.rows.length, b.rows.map((x) => x.subject.id)]).toEqual([2, 2, [uuid(2), uuid(3)]]);
        expect(outside.status === "ok" && [outside.total, outside.rows.length]).toEqual([0, 0]);
    });

    it("Billing passes the selection to the Financials reader, and nothing outside the actor's sites", async () => {
        const readQueue = vi.fn(async () => ({ rows: [], counts: {}, scope: { siteLocationId: null, siteScope: "all" } }) as never);
        await loadChargesNeedingReview(projectionTableStub({}), ctx({ ...ALL, selectedSiteId: SITE_B }), { assertRead: async () => ({ ok: true }), readQueue });
        expect(readQueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ activeSiteLocationId: SITE_B }));
        readQueue.mockClear();
        const outside = await loadChargesNeedingReview(projectionTableStub({}), ctx({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A], selectedSiteId: SITE_B }), { assertRead: async () => ({ ok: true }), readQueue });
        expect(outside).toEqual({ ok: true, rows: [], truncated: false });
        expect(readQueue).not.toHaveBeenCalled();
    });
});

describe("scale, order and bounds", () => {
    it("3,000 subjects across many pages; Ending Soon orders by end date, stably", async () => {
        const rows = Array.from({ length: 3000 }, (_, i) => a({ id: uuid(10_000 + i), customer_member_id: uuid(50_000 + i), end_date: addDaysYmd(TODAY, i % 30) }));
        const r = await loadDomainProjectionCohort(db(rows), { domain: "assignments", projectionKey: "assignments_ending_soon", orgId: ORG, userId: null, scope: ALL }, undefined);
        expect(r.status === "ok" && [r.total, r.truncated]).toEqual([3000, false]);
        if (r.status !== "ok") return;
        const ends = r.rows.map((x) => x.detail?.endDate ?? "");
        expect([...ends].sort()).toEqual(ends);
        const again = await loadDomainProjectionCohort(db(rows), { domain: "assignments", projectionKey: "assignments_ending_soon", orgId: ORG, userId: null, scope: ALL });
        expect(again.status === "ok" && again.rows.map((x) => x.subject.id)).toEqual(r.rows.map((x) => x.subject.id));
    });

    it("beyond the certified read bound the result is explicitly incomplete — no exact-looking total", async () => {
        const rows = Array.from({ length: 41 }, (_, i) => a({ id: uuid(20_000 + i), customer_member_id: uuid(60_000 + i) }));
        const r = await loadCurrentAssignments(db(rows), ctx(), { ...opts, pageSize: 7, readCap: 40 });
        expect(r.ok && r.truncated).toBe(true);
    });

    it("bounded batch reads: no per-row query, whatever the cohort size", async () => {
        const rows = Array.from({ length: 900 }, (_, i) => a({ id: uuid(30_000 + i), customer_member_id: uuid(70_000 + i) }));
        const stub = db(rows);
        await loadCurrentAssignments(stub, ctx(), opts);
        // 2 pages of assignments + ceil(900/100)=9 name reads + 1 location read + 1 type read.
        expect(stub.reads.length).toBeLessThanOrEqual(13);
        expect(stub.writes).toEqual([]);
    });
});

describe("registry, publication and the row a director reads", () => {
    it("five registered Assignments projections, catalog == registry; publication accepts them", () => {
        expect(DOMAIN_PROJECTIONS.assignments.map((p) => p.key)).toEqual(DOMAIN_PROJECTION_CATALOG.assignments.map((p) => p.key));
        expect(DOMAIN_PROJECTIONS.assignments.map((p) => p.key)).toEqual([
            "current_assignments", "assignments_ending_soon", "assignments_upcoming_changes", "schedule_gaps", "assignments_proposed_incomplete",
        ]);
        const views = DOMAIN_PROJECTIONS.assignments.map((p, i) => ({ id: p.key, label: p.label, projection_key: p.key, display_order: 5 - i }));
        const payload = { version: 1, active_process_id: "p", processes: [{ id: "p", key: "assignments", name: "Assignments", process_model_v1: { kind: "domain_projection", domain: "assignments" }, is_active: true, stages: [], work_views_v1: views }] };
        expect(validateBusinessProcessForPublish(payload).errors).toEqual([]);
    });

    it("the queue row states why, where and when — without persisting anything", () => {
        const c = domainProjectionQueueRowContext(
            { subject: { type: "child", id: uuid(1) }, label: "Child 1", source: { kind: "schedule_assignment", id: uuid(9), count: 1, statusLabel: "Ends Oct 29 · in 9 days" }, siteLocationId: SITE_A,
              detail: { reason: "Ends Oct 29 · in 9 days", endDate: "2026-10-29", siteLocationId: SITE_A, siteLabel: "Riverside", roomLocationId: ROOM_1, roomLabel: "Toddler Room", assignmentTypeLabel: "Full day", daysUntil: 9 } },
            { processKey: "assignments", domain: "assignments", projectionKey: "assignments_ending_soon", projectionLabel: "Ending Soon" },
        );
        expect(c.row_status_label).toBe("Ends Oct 29 · in 9 days");
        expect(c.placement_context).toMatchObject({ location_label: "Riverside", room_label: "Toddler Room", program_label: "Full day" });
        expect(c.domain_projection?.detail).toMatchObject({ end_date: "2026-10-29", days_until: 9 });
        expect((c as { operational_state?: unknown }).operational_state).toBeUndefined();
    });
});
