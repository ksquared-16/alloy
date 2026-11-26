/**
 * A CASE WITH NO SITE STILL HOLDS CHILDREN WHO ARE ASSIGNED SOMEWHERE.
 *
 * Observed on deployed staging (Surfaces c5): the Certhouse family case has `location_id = null`, and
 * its child Certb holds a live, committed, primary assignment at a site. The case-hosted Assignments
 * card said "No assignments yet" — the first-paint bag took its site ONLY from the case and returned
 * nothing without one. Synthetic fixtures only; the projection builder is replaced so the test can see
 * which site the real loader asks it for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { built } = vi.hoisted(() => ({ built: [] as Array<{ siteLocationId: string; members: string[] }> }));

vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", () => ({
    resolveOperationalEnrollmentTodayYmd: async () => "2026-10-30",
}));
vi.mock("@/lib/scheduling/projection/buildSchedulingProjection", () => ({
    loadSchedulingProjectionsForChildren: async (_s: unknown, _o: string, p: { siteLocationId: string; children: Array<{ customerMemberId: string }> }) => {
        built.push({ siteLocationId: p.siteLocationId, members: p.children.map((c) => c.customerMemberId) });
        return new Map(p.children.map((c) => [c.customerMemberId, { children: [{ child: { siteId: p.siteLocationId }, currentSchedule: { assignments: [{ id: "a" }] } }] }]));
    },
}));
vi.mock("@/lib/scheduling/editorPatterns", () => ({ loadEditorPatternsForSite: async () => [] }));
vi.mock("@/lib/operationalAssignments/loadOrgAssignmentTypes", () => ({ loadOrgAssignmentTypes: async () => [] }));
vi.mock("@/lib/operationalAssignments/loadSiteOperationalRooms", () => ({ loadSiteOperationalRooms: async () => [] }));

import {
    childSitesFromLiveAssignments,
    loadSchedulingProjectionsForFirstPaint,
    sharedSiteForSitelessCase,
    type ChildSiteAssignmentRow,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";
import { projectionTableStub } from "../businessProcesses/projectionTableStub";

const ORG = "11111111-1111-4111-8111-000000000001";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const SITE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CHILD_A = "00000000-0000-4000-8000-0000000000c1";
const CHILD_B = "00000000-0000-4000-8000-0000000000c2";
const TODAY = "2026-10-30";

const live = (member: string, site: string, over: Partial<ChildSiteAssignmentRow> = {}) => ({
    org_id: ORG, subject_type: "child", customer_member_id: member, site_location_id: site,
    status: "active", commitment_kind: "committed", end_date: null, ...over,
});
const SITES = [{ id: SITE_A, org_id: ORG, label: "Site A", metadata: {} }, { id: SITE_B, org_id: ORG, label: "Site B", metadata: {} }];
/** The in-memory PostgREST subset for the assignment read; the site row (`maybeSingle`) answered beside it. */
const db = (rows: Record<string, unknown>[]) => {
    const stub = projectionTableStub({ schedule_assignments: rows }) as { from: (t: string) => unknown };
    return {
        from: (table: string) => {
            if (table !== "locations") return stub.from(table);
            const filters: Record<string, unknown> = {};
            const q = {
                select: () => q,
                eq: (k: string, v: unknown) => { filters[k] = v; return q; },
                maybeSingle: async () => ({ data: SITES.find((r) => r.id === filters.id && r.org_id === filters.org_id) ?? null, error: null }),
            };
            return q;
        },
    } as never;
};
const caseRecord = (location_id: string | null, ...members: string[]) => ({
    location_id,
    _inquiry_children: members.map((id) => ({ customer_member_id: id, display_name: `QA ${id.slice(-2)}` })),
});

beforeEach(() => { built.length = 0; });

describe("the rule: a child's site from its OWN live committed assignments", () => {
    it("one live site ⇒ that site; nothing live ⇒ none", () => {
        const m = childSitesFromLiveAssignments([live(CHILD_A, SITE_A)], [CHILD_A, CHILD_B], TODAY);
        expect(m.get(CHILD_A)).toEqual({ kind: "site", siteId: SITE_A });
        expect(m.get(CHILD_B)).toEqual({ kind: "none" });
    });

    it("live at TWO sites ⇒ ambiguous, never the first row", () => {
        const m = childSitesFromLiveAssignments([live(CHILD_A, SITE_A), live(CHILD_A, SITE_B)], [CHILD_A], TODAY);
        expect(m.get(CHILD_A)).toEqual({ kind: "ambiguous" });
    });

    it("proposals, terminal rows and rows ended before today are not live", () => {
        const m = childSitesFromLiveAssignments(
            [
                live(CHILD_A, SITE_B, { commitment_kind: "proposed" }),
                live(CHILD_A, SITE_B, { status: "ended" }),
                live(CHILD_A, SITE_B, { status: "superseded" }),
                live(CHILD_A, SITE_B, { end_date: "2026-10-29" }),
                live(CHILD_A, SITE_A, { end_date: TODAY }),
            ],
            [CHILD_A],
            TODAY,
        );
        expect(m.get(CHILD_A)).toEqual({ kind: "site", siteId: SITE_A });
    });

    it("the case resolves only when every child agrees — ambiguity or a split family leaves it unresolved", () => {
        const one = new Map([[CHILD_A, { kind: "site" as const, siteId: SITE_A }], [CHILD_B, { kind: "none" as const }]]);
        expect(sharedSiteForSitelessCase(one)).toBe(SITE_A);
        const split = new Map([[CHILD_A, { kind: "site" as const, siteId: SITE_A }], [CHILD_B, { kind: "site" as const, siteId: SITE_B }]]);
        expect(sharedSiteForSitelessCase(split)).toBe("");
        const ambiguous = new Map([[CHILD_A, { kind: "site" as const, siteId: SITE_A }], [CHILD_B, { kind: "ambiguous" as const }]]);
        expect(sharedSiteForSitelessCase(ambiguous)).toBe("");
    });
});

describe("the first-paint loader — the case-hosted Assignments card's only source", () => {
    it("REGRESSION: a siteless case composes its child at the child's live site (was: empty bag)", async () => {
        const bag = await loadSchedulingProjectionsForFirstPaint(db([live(CHILD_A, SITE_A)]), ORG, caseRecord(null, CHILD_A));
        expect(built).toEqual([{ siteLocationId: SITE_A, members: [CHILD_A] }]);
        expect(Object.keys(bag.byMemberId)).toEqual([CHILD_A]);
    });

    it("a case WITH a site is unchanged — the case's site wins over any assignment", async () => {
        await loadSchedulingProjectionsForFirstPaint(db([live(CHILD_A, SITE_B)]), ORG, caseRecord(SITE_A, CHILD_A));
        expect(built).toEqual([{ siteLocationId: SITE_A, members: [CHILD_A] }]);
    });

    it("an ambiguous child keeps the honest empty — no site is chosen for the case", async () => {
        const bag = await loadSchedulingProjectionsForFirstPaint(
            db([live(CHILD_A, SITE_A), live(CHILD_A, SITE_B)]), ORG, caseRecord(null, CHILD_A));
        expect(built).toEqual([]);
        expect(bag.byMemberId).toEqual({});
    });

    it("siblings live at different sites leave the case unresolved rather than half-answered", async () => {
        const bag = await loadSchedulingProjectionsForFirstPaint(
            db([live(CHILD_A, SITE_A), live(CHILD_B, SITE_B)]), ORG, caseRecord(null, CHILD_A, CHILD_B));
        expect(built).toEqual([]);
        expect(bag.byMemberId).toEqual({});
    });

    it("CROSS-ORG — another organization's assignment for the same member id is never read", async () => {
        const bag = await loadSchedulingProjectionsForFirstPaint(
            db([live(CHILD_A, SITE_A, { org_id: OTHER_ORG } as never)]), ORG, caseRecord(null, CHILD_A));
        expect(built).toEqual([]);
        expect(bag.byMemberId).toEqual({});
    });

    it("a sibling with no live assignment does not block, and is composed at the family's site", async () => {
        await loadSchedulingProjectionsForFirstPaint(db([live(CHILD_A, SITE_A)]), ORG, caseRecord(null, CHILD_A, CHILD_B));
        expect(built).toEqual([{ siteLocationId: SITE_A, members: [CHILD_A, CHILD_B] }]);
    });

    it("STALE — a child whose only assignment ended keeps the honest empty", async () => {
        const bag = await loadSchedulingProjectionsForFirstPaint(
            db([live(CHILD_A, SITE_A, { end_date: "2026-10-01" })]), ORG, caseRecord(null, CHILD_A));
        expect(built).toEqual([]);
        expect(bag.byMemberId).toEqual({});
    });
});
