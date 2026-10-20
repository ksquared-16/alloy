/**
 * BP V2 Slice 2 — the shared domain-backed Work View substrate, proven at the unit level.
 *
 * The adapters run against an in-memory table that applies the SAME filters PostgREST would
 * (eq / lte / or / not-in / in / order / range), so paging, scope and caps are exercised for real —
 * including cohorts larger than the 1000-row PostgREST page and the 100-row answer page.
 */

import { describe, expect, it, vi } from "vitest";

import { loadCurrentAssignments } from "@/lib/businessProcesses/projections/currentAssignmentsProjection";
import { loadChargesNeedingReview } from "@/lib/businessProcesses/projections/chargesNeedingReviewProjection";
import {
    DOMAIN_PROJECTIONS,
    compareDomainProjectionRows,
    domainProjectionScopeFromAccess,
    loadDomainProjectionCohort,
} from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import { DOMAIN_PROJECTION_CATALOG } from "@/lib/businessProcesses/projections/domainProjectionCatalog";
import { domainProjectionRowId, parseDomainProjectionRowId } from "@/lib/businessProcesses/projections/domainProjectionIdentity";
import { domainProjectionQueueRowContext } from "@/lib/businessProcesses/projections/domainProjectionQueueRow";
import {
    DOMAIN_PROJECTION_BASE_QUEUE_KEY,
    domainProjectionHostWorkUnitKey,
    isDomainProjectionHostWorkUnit,
} from "@/lib/businessProcesses/projections/domainProjectionHost";
import type { DomainProjectionDefinition, DomainProjectionRow } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import {
    PUBLISH_PROJECTION_WORK_VIEW_INVALID,
    validateBusinessProcessForPublish,
} from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { parseWorkViewRow } from "@/lib/lifecycle/workViewsConfigV1";
import { pickDeptWorkViewHostWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { resolveWorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

const ORG = "11111111-1111-4111-8111-000000000001";
const TODAY = "2026-10-20";
const SITE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Row = Record<string, unknown>;

/** An in-memory PostgREST subset. Records every write attempt — none is allowed. */
function tableStub(tables: Record<string, Row[]>) {
    const writes: string[] = [];
    const reads: string[] = [];
    const client = {
        writes,
        reads,
        from(table: string) {
            reads.push(table);
            const preds: Array<(r: Row) => boolean> = [];
            let orderCol: string | null = null;
            const exec = (from?: number, to?: number) => {
                let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
                if (orderCol) rows = [...rows].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
                if (from != null && to != null) rows = rows.slice(from, to + 1);
                return Promise.resolve({ data: rows, error: null });
            };
            const b: Record<string, unknown> = {
                select: () => b,
                eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
                lte: (c: string, v: string) => (preds.push((r) => String(r[c] ?? "") <= v), b),
                in: (c: string, vs: unknown[]) => (preds.push((r) => vs.includes(r[c])), b),
                not: (c: string, _op: string, list: string) => {
                    const vals = list.replace(/[()]/g, "").split(",");
                    preds.push((r) => !vals.includes(String(r[c])));
                    return b;
                },
                or: (expr: string) => {
                    const m = /end_date\.is\.null,end_date\.gte\.(\d{4}-\d{2}-\d{2})/.exec(expr);
                    if (m) preds.push((r) => r.end_date == null || String(r.end_date) >= m[1]!);
                    return b;
                },
                order: (c: string) => ((orderCol = c), b),
                range: (from: number, to: number) => exec(from, to),
                then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej),
                insert: () => (writes.push(`insert:${table}`), b),
                update: () => (writes.push(`update:${table}`), b),
                upsert: () => (writes.push(`upsert:${table}`), b),
                delete: () => (writes.push(`delete:${table}`), b),
            };
            return b;
        },
    };
    return client as unknown as import("@supabase/supabase-js").SupabaseClient & { writes: string[]; reads: string[] };
}

function assignment(over: Row): Row {
    return {
        org_id: ORG,
        subject_type: "child",
        customer_member_id: null,
        subject_person_id: null,
        site_location_id: SITE_A,
        is_primary: true,
        status: "active",
        commitment_kind: "committed",
        start_date: "2026-09-01",
        end_date: null,
        ...over,
    };
}

const ALL: import("@/lib/businessProcesses/projections/domainProjectionTypes").DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };
const ctx = (scope = ALL) => ({ orgId: ORG, userId: "u1", scope });

describe("Assignments · current_assignments — canonical lifecycle, per-subject rows", () => {
    it("admits only what the canonical resolver calls Active, and one row per subject", async () => {
        const child = uuid(1);
        const staff = uuid(2);
        const db = tableStub({
            schedule_assignments: [
                assignment({ id: uuid(101), customer_member_id: child }), // active primary
                assignment({ id: uuid(102), customer_member_id: child, is_primary: false }), // active secondary → same subject
                assignment({ id: uuid(103), customer_member_id: uuid(3), status: "superseded", end_date: "2026-12-31" }), // canonical: Completed
                assignment({ id: uuid(104), customer_member_id: uuid(4), commitment_kind: "proposed", status: "planned" }), // Proposed
                assignment({ id: uuid(105), customer_member_id: uuid(5), start_date: "2026-11-01", status: "planned" }), // Upcoming
                assignment({ id: uuid(106), customer_member_id: uuid(6), end_date: "2026-10-19" }), // ended yesterday
                assignment({ id: uuid(107), subject_type: "staff", subject_person_id: staff }), // staff primary
                assignment({ id: uuid(108), subject_type: "staff", subject_person_id: staff, start_date: "2027-01-01", status: "planned" }), // staff future primary coexists, not current
                assignment({ id: uuid(109), customer_member_id: null }), // unnameable subject
            ],
            customer_members: [{ id: child, org_id: ORG, display_name: "Ava Child" }],
            persons: [{ id: staff, org_id: ORG, first_name: "Sam", last_name: "Staff" }],
        });
        const r = await loadCurrentAssignments(db, ctx(), { todayYmd: TODAY });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const rows = [...r.rows].sort(compareDomainProjectionRows);
        expect(rows.map((x) => [x.subject.type, x.subject.id, x.source.id, x.source.count, x.label])).toEqual([
            ["child", child, uuid(101), 2, "Ava Child"],
            ["person", staff, uuid(107), 1, "Sam Staff"],
        ]);
        expect(db.writes).toEqual([]);
    });

    it("enforces a restricted site scope before reading, and an empty scope reads nothing", async () => {
        const db = tableStub({
            schedule_assignments: [
                assignment({ id: uuid(201), customer_member_id: uuid(11), site_location_id: SITE_A }),
                assignment({ id: uuid(202), customer_member_id: uuid(12), site_location_id: SITE_B }),
                assignment({ id: uuid(203), customer_member_id: uuid(13), site_location_id: null }),
            ],
        });
        const r = await loadCurrentAssignments(db, ctx({ siteScope: "restricted", allowedSiteLocationIds: [SITE_B] }), { todayYmd: TODAY });
        expect(r.ok && r.rows.map((x) => x.subject.id)).toEqual([uuid(12)]);
        const none = tableStub({ schedule_assignments: [assignment({ id: uuid(204), customer_member_id: uuid(14) })] });
        const empty = await loadCurrentAssignments(none, ctx({ siteScope: "restricted", allowedSiteLocationIds: [] }), { todayYmd: TODAY });
        expect(empty).toEqual({ ok: true, rows: [], truncated: false });
        expect(none.reads).toEqual([]);
    });

    it("pages past the 1000-row PostgREST cap: 2,345 subjects, every one counted", async () => {
        const rows = Array.from({ length: 2345 }, (_, i) => assignment({ id: uuid(10_000 + i), customer_member_id: uuid(50_000 + i) }));
        const r = await loadCurrentAssignments(tableStub({ schedule_assignments: rows }), ctx(), { todayYmd: TODAY });
        expect(r.ok && r.rows.length).toBe(2345);
        expect(r.ok && r.truncated).toBe(false);
    });

    it("a cohort of exactly the cap is complete; one row more is truncated (never a guessed total)", async () => {
        const make = (n: number) => Array.from({ length: n }, (_, i) => assignment({ id: uuid(20_000 + i), customer_member_id: uuid(60_000 + i) }));
        const exact = await loadCurrentAssignments(tableStub({ schedule_assignments: make(40) }), ctx(), { todayYmd: TODAY, pageSize: 7, readCap: 40 });
        expect(exact.ok && [exact.rows.length, exact.truncated]).toEqual([40, false]);
        const over = await loadCurrentAssignments(tableStub({ schedule_assignments: make(41) }), ctx(), { todayYmd: TODAY, pageSize: 7, readCap: 40 });
        expect(over.ok && over.truncated).toBe(true);
    });
});

describe("Billing · charges_needing_review — fin.read, attention-only, per-household", () => {
    const work = (over: Record<string, unknown>) => ({
        chargeId: uuid(1),
        customerId: uuid(900),
        householdName: "Rivera household",
        status: "draft",
        serviceDate: "2026-10-01",
        siteLocationId: SITE_A,
        awaiting: { key: "review_required", label: "Needs review", explanation: "", operatorActionable: true, postsOn: null },
        ...over,
    });
    const queue = (rows: unknown[], readLimitReached = false) =>
        vi.fn(async () => ({ rows, counts: {}, scope: { siteLocationId: null, siteScope: "all" }, readLimitReached }) as never);

    it("refuses without fin.read and reads nothing", async () => {
        const readQueue = queue([]);
        const r = await loadChargesNeedingReview(tableStub({}), ctx(), {
            assertRead: async () => ({ ok: false, message: "no", requiredPermission: "fin.read" }),
            readQueue,
        });
        expect(r).toMatchObject({ ok: false, code: "projection_forbidden" });
        expect(readQueue).not.toHaveBeenCalled();
    });

    it("keeps only the charge index's own 'attention' drafts, one row per household, charge id as source", async () => {
        const readQueue = queue([
            work({ chargeId: uuid(2), serviceDate: "2026-10-05" }),
            work({ chargeId: uuid(1), serviceDate: "2026-10-01" }), // same household, older → representative
            work({ chargeId: uuid(3), customerId: uuid(901), householdName: "Lee household", awaiting: { key: "post_failed", label: "Post failed", explanation: "", operatorActionable: true, postsOn: null } }),
            work({ chargeId: uuid(4), customerId: uuid(902), awaiting: { key: "period_not_started", label: "Scheduled", explanation: "", operatorActionable: false, postsOn: "2026-11-01" } }),
            work({ chargeId: uuid(5), customerId: null }),
        ]);
        const r = await loadChargesNeedingReview(tableStub({}), ctx({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A] }), {
            assertRead: async () => ({ ok: true }),
            readQueue,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rows.map((x) => [x.subject.type, x.subject.id, x.source.kind, x.source.id, x.source.count])).toEqual([
            ["household", uuid(900), "charge", uuid(1), 2],
            ["household", uuid(901), "charge", uuid(3), 1],
        ]);
        // The Financials reader received the caller's scope verbatim — its own visibility rule applies.
        expect(readQueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A] }));
    });

    it("a bounded Financials read marks the cohort truncated", async () => {
        const r = await loadChargesNeedingReview(tableStub({}), ctx(), { assertRead: async () => ({ ok: true }), readQueue: queue([work({})], true) });
        expect(r.ok && r.truncated).toBe(true);
    });
});

describe("the cohort — one membership for counts and rows", () => {
    const def = (rows: DomainProjectionRow[], truncated = false, subjectTypes: DomainProjectionDefinition["subjectTypes"] = ["child", "person"]): typeof import("@/lib/businessProcesses/projections/domainProjectionRegistry").resolveDomainProjection =>
        () => ({ key: "k", domain: "assignments", label: "K", subjectTypes, load: async () => ({ ok: true, rows, truncated }) });
    const row = (type: "child" | "person" | "household", id: string, label: string): DomainProjectionRow => ({
        subject: { type, id }, label, source: { kind: "schedule_assignment", id: uuid(1), count: 1, statusLabel: "Active" }, siteLocationId: null,
    });
    const args = { domain: "assignments" as const, projectionKey: "k", orgId: ORG, userId: null, scope: ALL };

    it("dedupes by (grain, id), orders canonically, and total === rows.length", async () => {
        const c = await loadDomainProjectionCohort(tableStub({}), args, def([row("person", uuid(2), "b"), row("child", uuid(1), "a"), row("person", uuid(2), "b")]));
        expect(c.status === "ok" && c.rows.map((r) => r.subject.id)).toEqual([uuid(1), uuid(2)]);
        expect(c.status === "ok" && c.total).toBe(2);
    });

    it("a truncated read has NO total (never the page length, never a guess)", async () => {
        const c = await loadDomainProjectionCohort(tableStub({}), args, def([row("child", uuid(1), "a")], true));
        expect(c.status === "ok" && [c.total, c.truncated]).toEqual([null, true]);
    });

    it("refuses an unregistered key and a row of an undeclared grain — never an empty list", async () => {
        const unsupported = await loadDomainProjectionCohort(tableStub({}), { ...args, projectionKey: "nope" });
        expect(unsupported).toMatchObject({ status: "refused", code: "projection_unsupported" });
        const foreign = await loadDomainProjectionCohort(tableStub({}), args, def([row("household", uuid(1), "x")]));
        expect(foreign).toMatchObject({ status: "refused", code: "projection_unavailable" });
    });

    it("the client-safe catalog and the server registry name the same projections", () => {
        for (const domain of ["assignments", "billing"] as const) {
            expect(DOMAIN_PROJECTIONS[domain].map((p) => [p.key, p.label, [...p.subjectTypes]])).toEqual(
                DOMAIN_PROJECTION_CATALOG[domain].map((p) => [p.key, p.label, [...p.subjectTypes]]),
            );
        }
    });

    it("scope comes from the access dimensions only", () => {
        expect(domainProjectionScopeFromAccess({ departmentScope: "all", allowedDepartmentIds: [], siteScope: "restricted", allowedSiteLocationIds: [SITE_A] } as never)).toEqual({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A] });
        expect(domainProjectionScopeFromAccess({ departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [SITE_A] } as never)).toEqual(ALL);
    });
});

describe("row identity and queue row context", () => {
    it("the row id carries the grain; the source id is context, never what opens", () => {
        const r: DomainProjectionRow = { subject: { type: "household", id: uuid(7) }, label: "Lee", source: { kind: "charge", id: uuid(8), count: 3, statusLabel: "Needs review" }, siteLocationId: SITE_A };
        expect(domainProjectionRowId(r)).toBe(`household:${uuid(7)}`);
        expect(parseDomainProjectionRowId(`household:${uuid(7)}`)).toEqual({ type: "household", id: uuid(7) });
        expect(parseDomainProjectionRowId(uuid(7))).toBeNull();
        expect(parseDomainProjectionRowId(`opportunity:${uuid(7)}`)).toBeNull();
        const c = domainProjectionQueueRowContext(r, { processKey: "billing", domain: "billing", projectionKey: "charges_needing_review", projectionLabel: "Needs review" });
        expect(c.drawer_open).toEqual({ entity_type: "customers", entity_id: uuid(7) });
        expect(c.domain_projection).toMatchObject({ subject: { type: "household", id: uuid(7) }, source: { kind: "charge", id: uuid(8), count: 3 } });
        expect(c.case_context.case_id).toBe(uuid(8));
        expect(c.attention_summary).toBeNull();
        expect(c.current_work_summary).toBeNull();
        // No operational_state → no occurrence key → opening the row writes no acknowledgement.
        expect((c as { operational_state?: unknown }).operational_state).toBeUndefined();
    });
});

describe("configuration and publication", () => {
    const projection = (views: unknown[]) => ({
        version: 1,
        active_process_id: "p",
        processes: [{ id: "p", key: "assignments", name: "Assignments", process_model_v1: { kind: "domain_projection", domain: "assignments" }, is_active: true, stages: [], work_views_v1: views }],
    });

    it("projection_key round-trips; a malformed value is kept verbatim for publication to name", () => {
        expect(parseWorkViewRow({ id: "a", label: "A", projection_key: "current_assignments" })?.projection_key).toBe("current_assignments");
        const raw = projection([{ id: "a", label: "A", projection_key: 42 }]);
        const wire = serializeLifecycleBuilderV1(parseLifecycleBuilderV1(raw)!) as { processes: Array<{ work_views_v1: Row[] }> };
        expect(wire.processes[0]!.work_views_v1[0]!.projection_key).toBe(42);
    });

    it("publishes a projection view naming a registered projection", () => {
        expect(validateBusinessProcessForPublish(projection([{ id: "a", label: "All", projection_key: "current_assignments" }])).errors).toEqual([]);
    });

    it("refuses an unknown key, another domain's key, and lifecycle predicates on a projection view", () => {
        const r = validateBusinessProcessForPublish(projection([
            { id: "a", label: "A", projection_key: "charges_needing_review" },
            { id: "b", label: "B" },
            { id: "c", label: "C", projection_key: "current_assignments", filters_v1: [{ field_key: "site", operator: "equals", value: "x" }], compat_queue_key: "new_leads", row_grain_v1: "child", sort_v1: { field: "updated_at", direction: "desc" } },
        ]));
        const paths = r.errors.filter((e) => e.code === PUBLISH_PROJECTION_WORK_VIEW_INVALID).map((e) => (e.path ?? "").split(".").slice(-2).join("."));
        expect(paths.sort()).toEqual(["work_views_v1[a].projection_key", "work_views_v1[b].projection_key", "work_views_v1[c].compat_queue_key", "work_views_v1[c].filters_v1", "work_views_v1[c].row_grain_v1", "work_views_v1[c].sort_v1"].sort());
    });

    it("refuses projection_key on a staged lifecycle; Enrollment without it is unaffected", () => {
        const staged = (extra: Row) => ({ version: 1, active_process_id: "e", processes: [{ id: "e", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", is_active: true, stages: [{ id: "s", key: "lead", label: "Lead", sort_order: 0, is_active: true }], work_views_v1: [{ id: "n", label: "New", ...extra }] }] });
        expect(validateBusinessProcessForPublish(staged({ projection_key: "current_assignments" })).errors.map((e) => e.code)).toContain(PUBLISH_PROJECTION_WORK_VIEW_INVALID);
        expect(validateBusinessProcessForPublish(staged({})).errors.map((e) => e.code)).not.toContain(PUBLISH_PROJECTION_WORK_VIEW_INVALID);
    });
});

describe("the projection host — the canonical location of projection views", () => {
    const DEPT = "dddddddd-0000-4000-8000-00000000000d";
    const host = { id: "wu-host", key: domainProjectionHostWorkUnitKey(DEPT), department_id: DEPT, is_active: true, queue_definition: {} };

    it("is unique per department (the answer resolves work units by key across the org)", () => {
        expect(domainProjectionHostWorkUnitKey(DEPT)).not.toBe(domainProjectionHostWorkUnitKey("eeeeeeee-0000-4000-8000-00000000000e"));
        expect(isDomainProjectionHostWorkUnit(host)).toBe(true);
        expect(isDomainProjectionHostWorkUnit({ key: "enrollment_pipeline" })).toBe(false);
    });

    it("hosts its department's views on the one projection lane", () => {
        expect(pickDeptWorkViewHostWorkUnit([host], DEPT)?.id).toBe("wu-host");
        expect(resolveWorkViewCanonicalLocation({ id: "a", label: "All Assignments" }, [host], DEPT)).toEqual({
            workUnitId: "wu-host",
            baseQueueKey: DOMAIN_PROJECTION_BASE_QUEUE_KEY,
            routeKey: "all_assignments",
        });
        // Another department never borrows it.
        expect(pickDeptWorkViewHostWorkUnit([host], "other-dept")).toBeNull();
    });
});
