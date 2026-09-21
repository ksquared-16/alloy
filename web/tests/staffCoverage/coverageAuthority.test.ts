/**
 * COVERAGE, AGAINST A REAL DATABASE.
 *
 * Almost everything Coverage promises is promised by the database: exclusion,
 * ancestor-aware room topology, employment effectivity, atomic supersession. A
 * mock would only restate this file's own assumptions, so every test here drives
 * real rows on the certification stack.
 *
 * ── WHY THIS IS ONE FILE ──
 *
 * The stack holds ONE employment, and Coverage's central invariant is that one
 * employment cannot hold two overlapping effective allocations. Split across
 * files, vitest would run these suites in parallel against that single
 * employment and they would refuse each other's fixtures — a red that says
 * nothing about the code. Each test instead owns a distinct service date, so the
 * exclusion constraint never sees two tests at once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ActionRuntimeContext } from "@/lib/adminV2/actions/actionTypes";
import {
    staffCoverageCancelAction,
    staffCoverageChangeAction,
    staffCoverageCorrectAction,
    staffCoveragePlanAction,
} from "@/lib/adminV2/actions/definitions/staffCoverageActions";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { buildStaffSupply } from "@/lib/scheduling/supply/buildStaffSupply";
import { projectCoverageAudit, readCoverageLineageFor } from "@/lib/staffCoverage/staffCoverageAudit";
import { readCoverageByPlace } from "@/lib/staffCoverage/staffCoverageReadModel";
import {
    CoverageConflictError,
    CoverageRejectedError,
    cancelCoverage,
    effectiveCoverageForEmployment,
    effectiveCoverageForSite,
    planCoverage,
    supersedeCoverage,
} from "@/lib/staffCoverage/staffCoverageService";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;
const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "66660000-0000-4000-8000-000000006601";
const SITE_A = "00000000-0000-4000-8000-000000000010";
const SITE_B = "00000000-0000-4000-8000-000000000011";
const ROOM_A1 = "00000000-0000-4000-8000-000000000012";
const ROOM_A2 = "00000000-0000-4000-8000-000000000013";
const ROOM_B1 = "00000000-0000-4000-8000-000000000015";

let employmentId = "";
let personId = "";

/**
 * The baseline authorities Coverage must never touch.
 *
 * Snapshotted ONCE, before this file has written a single Coverage row. An
 * earlier draft took the snapshot inside the non-regression test and a planted
 * baseline mutation slipped straight through it: by then every other test had
 * already run the planted writer, so "before" and "after" agreed on the damage.
 * The only honest reference point is the state the suite started from.
 */
const BASELINE_TABLES = [
    "schedule_assignments",
    "assignment_weekday_intervals",
    "operational_assignment_types",
    "staff_availability_windows",
    "staff_availability_exceptions",
    "staff_presence_events",
    "staff_qualifications",
] as const;

async function snapshotBaseline(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const table of BASELINE_TABLES) {
        const { count, error } = await db
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG);
        // A misnamed table would answer every comparison with itself and make this
        // proof hollow, so an unreadable table is recorded as -1 and the test
        // refuses it outright rather than quietly counting it as agreement.
        out[table] = error ? -1 : (count ?? 0);
    }

    // Counts cannot see a participation flag flipped in place, and that flag is
    // exactly what Slice 2 established and Slice 3 must not touch.
    const { data } = await db
        .from("operational_assignment_types")
        .select("id, staffing_participation")
        .eq("org_id", ORG)
        .order("id", { ascending: true });
    out.__participation = JSON.stringify(data ?? []);
    return out;
}

let baselineAtStart: Record<string, unknown> = {};

/** Each test owns a date. The dates are far enough out to be nobody's real plan. */
const D = {
    create: "2027-03-01",
    adjacency: "2027-03-02",
    overlap: "2027-03-03",
    crossSite: "2027-03-04",
    siteAsRoom: "2027-03-05",
    revise: "2027-03-06",
    correct: "2027-03-07",
    cancel: "2027-03-08",
    parity: "2027-03-09",
    siteLevel: "2027-03-10",
    lineage: "2027-03-11",
    scope: "2027-03-12",
    audit: "2027-03-13",
    atomicity: "2027-03-14",
    commands: "2027-03-15",
    crossOrg: "2027-03-16",
    tenancy: "2027-03-17",
} as const;

const ALL_DATES = Object.values(D);

/** Before employment started (2026-08-01), so employment effectivity must refuse it. */
const BEFORE_EMPLOYMENT = "2026-07-01";

function ctx(overrides: Partial<ActionRuntimeContext> = {}): ActionRuntimeContext {
    return { orgId: ORG, userId: null, accessScope: null, ...overrides };
}

function invocation(actionKey: string, payload: Record<string, unknown>) {
    return { actionKey, entityType: "person", entityId: personId, payload };
}

async function run(
    action: typeof staffCoveragePlanAction,
    payload: Record<string, unknown>,
    runtime: ActionRuntimeContext = ctx()
) {
    const validated = action.validatePayload(payload);
    if (!validated.ok) {
        return {
            ok: false as const,
            correlationId: "validation",
            status: 400,
            error: validated.blockers.map((b) => b.message).join("; "),
            blockers: validated.blockers,
        };
    }
    return action.execute({
        supabase: db,
        ctx: runtime,
        invocation: invocation(action.actionKey, payload),
        payload: validated.value,
    });
}

async function wipe() {
    await db.from("staff_coverage_allocations").delete().eq("org_id", ORG).in("service_date", [
        ...ALL_DATES,
        BEFORE_EMPLOYMENT,
    ]);
}

beforeAll(async () => {
    if (!LIVE) return;
    const { data } = await db
        .from("employments")
        .select("id, person_id")
        .eq("org_id", ORG)
        .neq("employment_status", "canceled")
        .limit(1)
        .single();
    const row = data as { id: string; person_id: string };
    employmentId = row.id;
    personId = row.person_id;
    await wipe();
    baselineAtStart = await snapshotBaseline();
});

afterAll(async () => {
    if (!LIVE) return;
    // These dates are fixtures, not history. Leaving them would let the next
    // session's exclusion constraint refuse a legitimate plan.
    await wipe();
});

function plan(date: string, start: string, end: string, room: string | null = ROOM_A1, site = SITE_A) {
    return planCoverage(db, {
        orgId: ORG,
        employmentId,
        serviceDate: date,
        startTime: start,
        endTime: end,
        siteLocationId: site,
        roomLocationId: room,
        sourceKey: "test",
    });
}

describe.runIf(LIVE)("coverage authority — durable fact", () => {
    it("B1 plans a room-level allocation that resolves as effective", async () => {
        const id = await plan(D.create, "08:00", "10:00");
        const rows = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.create,
            dateTo: D.create,
        });
        expect(rows.map((r) => r.id)).toEqual([id]);
        expect(rows[0].roomLocationId).toBe(ROOM_A1);
        expect(rows[0].lifecycleState).toBe("active");
        expect(rows[0].lineageRootId).toBe(id);
    });

    it("B2 plans site-level coverage with a null room, not a stand-in room", async () => {
        const id = await plan(D.siteLevel, "08:00", "10:00", null);
        const rows = await effectiveCoverageForSite(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            dateFrom: D.siteLevel,
            dateTo: D.siteLevel,
        });
        const row = rows.find((r) => r.id === id);
        expect(row?.roomLocationId).toBeNull();
    });

    it("B3 treats intervals as half-open, so 08:00–10:00 and 10:00–12:00 both stand", async () => {
        const first = await plan(D.adjacency, "08:00", "10:00", ROOM_A1);
        const second = await plan(D.adjacency, "10:00", "12:00", ROOM_A2);
        const rows = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.adjacency,
            dateTo: D.adjacency,
        });
        expect(rows.map((r) => r.id).sort()).toEqual([first, second].sort());
    });

    it("B4 refuses a second effective allocation overlapping the first", async () => {
        await plan(D.overlap, "08:00", "10:00");
        await expect(plan(D.overlap, "09:30", "11:00", ROOM_A2)).rejects.toBeInstanceOf(CoverageConflictError);
    });

    it("B5 explains an overlap in words an operator can act on", async () => {
        await plan(D.commands, "08:00", "10:00");
        const result = await run(staffCoveragePlanAction, {
            person_id: personId,
            service_date: D.commands,
            start_time: "09:00",
            end_time: "11:00",
            site_location_id: SITE_A,
            room_location_id: ROOM_A2,
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(409);
        expect(result.error).toMatch(/already planned somewhere else/i);
        expect(result.error).not.toMatch(/int4range|exclusion|constraint/i);
    });

    it("B6 refuses a room that belongs to a different site", async () => {
        await expect(plan(D.crossSite, "08:00", "10:00", ROOM_B1, SITE_A)).rejects.toBeInstanceOf(
            CoverageRejectedError
        );
    });

    it("B7 refuses the site's own id used as a room", async () => {
        await expect(plan(D.siteAsRoom, "08:00", "10:00", SITE_A, SITE_A)).rejects.toBeInstanceOf(
            CoverageRejectedError
        );
    });

    it("B8 refuses coverage on a date the employment does not cover", async () => {
        await expect(plan(BEFORE_EMPLOYMENT, "08:00", "10:00")).rejects.toBeInstanceOf(CoverageRejectedError);
    });

    it("B9 refuses an interval that does not end after it starts", async () => {
        await expect(plan(D.create, "10:00", "10:00")).rejects.toBeInstanceOf(CoverageRejectedError);
    });

    it("B10 refuses overnight coverage in V1", async () => {
        await expect(plan(D.create, "22:00", "02:00")).rejects.toBeInstanceOf(CoverageRejectedError);
    });

    it("B11 refuses an allocation whose org does not own the employment", async () => {
        const { error } = await db.from("staff_coverage_allocations").insert({
            org_id: OTHER_ORG,
            employment_id: employmentId,
            service_date: D.crossOrg,
            start_time: "08:00",
            end_time: "10:00",
            site_location_id: SITE_A,
        });
        expect(error).not.toBeNull();
    });

    it("B12 refuses a site the org does not own", async () => {
        const { error } = await db.from("staff_coverage_allocations").insert({
            org_id: OTHER_ORG,
            employment_id: employmentId,
            service_date: D.tenancy,
            start_time: "08:00",
            end_time: "10:00",
            site_location_id: SITE_B,
        });
        expect(error).not.toBeNull();
    });
});

describe.runIf(LIVE)("coverage lifecycle", () => {
    it("B13 lets a revision replace an allocation it overlaps", async () => {
        const first = await plan(D.revise, "08:00", "10:00");
        const replacement = await supersedeCoverage(db, {
            coverageId: first,
            transition: "revision",
            startTime: "09:00",
            endTime: "11:00",
        });
        expect(replacement).not.toBe(first);
        const rows = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.revise,
            dateTo: D.revise,
        });
        expect(rows.map((r) => r.id)).toEqual([replacement]);
        expect(rows[0].endTime).toBe("11:00");
    });

    it("B14 keeps the predecessor as history rather than deleting it", async () => {
        const { data } = await db
            .from("staff_coverage_allocations")
            .select("id, lifecycle_state, transition_type, supersedes_coverage_id")
            .eq("org_id", ORG)
            .eq("service_date", D.revise);
        const all = (data ?? []) as {
            id: string;
            lifecycle_state: string;
            transition_type: string | null;
            supersedes_coverage_id: string | null;
        }[];
        expect(all.length).toBe(2);
        expect(all.filter((r) => r.lifecycle_state === "superseded").length).toBe(1);
        expect(all.find((r) => r.supersedes_coverage_id)?.transition_type).toBe("revision");
    });

    it("B15 records a correction as a correction, distinguishable from a change of plan", async () => {
        const first = await plan(D.correct, "08:00", "10:00");
        const fixed = await supersedeCoverage(db, {
            coverageId: first,
            transition: "correction",
            roomLocationId: null,
        });
        const { data } = await db
            .from("staff_coverage_allocations")
            .select("transition_type, room_location_id")
            .eq("id", fixed)
            .single();
        const row = data as { transition_type: string; room_location_id: string | null };
        expect(row.transition_type).toBe("correction");
        // A correction to site-level must be able to move the room to nothing.
        expect(row.room_location_id).toBeNull();
    });

    it("B16 refuses a transition that is neither a revision nor a correction", async () => {
        const first = await plan(D.lineage, "08:00", "10:00");
        await expect(
            supersedeCoverage(db, { coverageId: first, transition: "deletion" as never })
        ).rejects.toBeTruthy();
    });

    it("B17 keeps one lineage root across a whole chain", async () => {
        const first = await plan(D.atomicity, "08:00", "10:00");
        const second = await supersedeCoverage(db, { coverageId: first, transition: "revision", endTime: "11:00" });
        const third = await supersedeCoverage(db, { coverageId: second, transition: "correction", endTime: "10:30" });
        const lineage = await readCoverageLineageFor(db, { orgId: ORG, coverageId: third });
        expect(lineage.length).toBe(3);
        expect(new Set(lineage.map((r) => r.lineageRootId))).toEqual(new Set([first]));
    });

    it("B18 leaves nothing effective after a cancellation, and keeps the history", async () => {
        const id = await plan(D.cancel, "08:00", "10:00");
        await cancelCoverage(db, id, "test_cleanup", null);
        const effective = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.cancel,
            dateTo: D.cancel,
        });
        expect(effective).toEqual([]);
        const lineage = await readCoverageLineageFor(db, { orgId: ORG, coverageId: id });
        expect(lineage.length).toBe(1);
        expect(lineage[0].lifecycleState).toBe("cancelled");
        expect(lineage[0].cancelledAt).not.toBeNull();
    });

    it("B19 lets the cancelled interval be planned again", async () => {
        const again = await plan(D.cancel, "08:00", "10:00", ROOM_A2);
        const effective = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.cancel,
            dateTo: D.cancel,
        });
        expect(effective.map((r) => r.id)).toEqual([again]);
    });
});

describe.runIf(LIVE)("effective read parity", () => {
    it("B20 employment-first and place-first agree on the effective id set", async () => {
        await plan(D.parity, "08:00", "10:00", ROOM_A1);
        await plan(D.parity, "10:00", "12:00", null);

        const byEmployment = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.parity,
            dateTo: D.parity,
        });
        const byPlace = await readCoverageByPlace(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            dateFrom: D.parity,
            dateTo: D.parity,
        });

        const a = new Set(byEmployment.map((r) => r.id));
        const b = new Set(byPlace.allocations.map((r) => r.id));
        const mismatch = [...a].filter((id) => !b.has(id)).concat([...b].filter((id) => !a.has(id)));
        expect(mismatch).toEqual([]);
    });

    it("B21 still agrees after a revision", async () => {
        const rows = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.parity,
            dateTo: D.parity,
        });
        const target = rows[0];
        const replacement = await supersedeCoverage(db, {
            coverageId: target.id,
            transition: "revision",
            roomLocationId: ROOM_A2,
        });
        const byPlace = await readCoverageByPlace(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            dateFrom: D.parity,
            dateTo: D.parity,
        });
        expect(byPlace.allocations.map((r) => r.id)).toContain(replacement);
        expect(byPlace.allocations.map((r) => r.id)).not.toContain(target.id);
    });

    it("B22 groups the place-first read by day, site and room", async () => {
        const read = await readCoverageByPlace(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            dateFrom: D.parity,
            dateTo: D.parity,
        });
        expect(read.groups.length).toBeGreaterThan(0);
        for (const g of read.groups) {
            expect(g.serviceDate).toBe(D.parity);
            expect(g.siteLocationId).toBe(SITE_A);
            for (const slot of g.slots) {
                expect(slot.allocation.roomLocationId).toBe(g.roomLocationId);
                expect(slot.person.employmentId).toBe(employmentId);
            }
        }
    });

    it("B23 narrows a room filter without inventing a different effectiveness rule", async () => {
        const read = await readCoverageByPlace(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            roomLocationId: ROOM_A2,
            dateFrom: D.parity,
            dateTo: D.parity,
        });
        for (const a of read.allocations) {
            expect(a.roomLocationId).toBe(ROOM_A2);
            expect(a.lifecycleState).toBe("active");
        }
    });
});

describe.runIf(LIVE)("registered commands", () => {
    it("B24 registers all four Coverage commands in the canonical runtime", () => {
        for (const key of [
            "staff_coverage.plan",
            "staff_coverage.change",
            "staff_coverage.correct",
            "staff_coverage.cancel",
        ]) {
            const action = getRegisteredAction(key);
            expect(action, key).not.toBeNull();
            expect(typeof action?.execute, key).toBe("function");
        }
    });

    it("B25 plans coverage through the command and returns the allocation it created", async () => {
        const result = await run(staffCoveragePlanAction, {
            person_id: personId,
            service_date: D.scope,
            start_time: "08:00",
            end_time: "10:00",
            site_location_id: SITE_A,
            room_location_id: ROOM_A1,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.result.detail.lifecycle_operation).toBe("CREATED");
        const effective = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.scope,
            dateTo: D.scope,
        });
        expect(effective.map((r) => r.id)).toEqual([result.result.affectedId]);
    });

    it("B26 changes coverage through the command, retiring the prior allocation", async () => {
        const before = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.scope,
            dateTo: D.scope,
        });
        const result = await run(staffCoverageChangeAction, {
            coverage_id: before[0].id,
            end_time: "11:00",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.result.detail.transition_type).toBe("revision");
        const after = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.scope,
            dateTo: D.scope,
        });
        expect(after.map((r) => r.id)).toEqual([result.result.affectedId]);
        expect(after[0].endTime).toBe("11:00");
    });

    it("B27 corrects coverage through the command with the correction transition", async () => {
        const before = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.scope,
            dateTo: D.scope,
        });
        const result = await run(staffCoverageCorrectAction, {
            coverage_id: before[0].id,
            room_location_id: ROOM_A2,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.result.detail.transition_type).toBe("correction");
    });

    it("B28 cancels coverage through the command and leaves nothing effective", async () => {
        const before = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.scope,
            dateTo: D.scope,
        });
        const result = await run(staffCoverageCancelAction, { coverage_id: before[0].id });
        expect(result.ok).toBe(true);
        const after = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.scope,
            dateTo: D.scope,
        });
        expect(after).toEqual([]);
    });

    it("B29 never leaves a revision half-applied when the replacement is refused", async () => {
        const keep = await plan(D.audit, "08:00", "10:00", ROOM_A1);
        const blocker = await plan(D.audit, "12:00", "14:00", ROOM_A2);

        // Move the 12:00 block onto a room under a different site: the replacement
        // must be refused, and the original must still be the effective plan.
        const result = await run(staffCoverageChangeAction, {
            coverage_id: blocker,
            room_location_id: ROOM_B1,
        });
        expect(result.ok).toBe(false);

        const effective = await effectiveCoverageForEmployment(db, {
            orgId: ORG,
            employmentId,
            dateFrom: D.audit,
            dateTo: D.audit,
        });
        expect(effective.map((r) => r.id).sort()).toEqual([keep, blocker].sort());
        expect(effective.find((r) => r.id === blocker)?.lifecycleState).toBe("active");
    });
});

describe.runIf(LIVE)("authorization", () => {
    const restricted = ctx({
        accessScope: {
            departmentScope: "all",
            allowedDepartmentIds: [],
            siteScope: "restricted",
            allowedSiteLocationIds: [SITE_B],
        } as never,
    });

    it("B30 refuses a plan at a site the operator does not hold", async () => {
        const result = await run(
            staffCoveragePlanAction,
            {
                person_id: personId,
                service_date: D.crossSite,
                start_time: "08:00",
                end_time: "10:00",
                site_location_id: SITE_A,
            },
            restricted
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(403);
        expect(result.blockers?.[0]?.code).toBe("site_out_of_scope");
    });

    it("B31 refuses a change to an allocation at a site the operator does not hold", async () => {
        const id = await plan(D.siteAsRoom, "08:00", "10:00");
        const result = await run(staffCoverageChangeAction, { coverage_id: id, end_time: "11:00" }, restricted);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(403);
    });

    it("B32 returns nothing — not everything — when a read asks for an unheld site", async () => {
        const read = await readCoverageByPlace(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            dateFrom: D.parity,
            dateTo: D.parity,
            accessScope: restricted.accessScope,
        });
        expect(read.scopeExcluded).toBe(true);
        expect(read.allocations).toEqual([]);
    });
});

describe.runIf(LIVE)("audit", () => {
    it("B33 distinguishes all five lifecycle operations with actor, time and lineage", async () => {
        const first = await plan(D.crossOrg, "08:00", "10:00");
        const revised = await supersedeCoverage(db, {
            coverageId: first,
            transition: "revision",
            endTime: "11:00",
        });
        const corrected = await supersedeCoverage(db, {
            coverageId: revised,
            transition: "correction",
            roomLocationId: ROOM_A2,
        });
        await cancelCoverage(db, corrected, "test_cleanup", null);

        const lineage = await readCoverageLineageFor(db, { orgId: ORG, coverageId: corrected });
        const events = projectCoverageAudit(lineage);
        const ops = events.map((e) => e.operation);

        expect(new Set(ops)).toEqual(
            new Set(["CREATED", "REVISED", "SUPERSEDED", "CORRECTED", "CANCELLED"])
        );
        // Two supersessions happened, so SUPERSEDED must appear twice, not once.
        expect(ops.filter((o) => o === "SUPERSEDED").length).toBe(2);

        for (const e of events) {
            expect(e.lineageRootId).toBe(first);
            expect(e.occurredAt).toBeTruthy();
            expect(e.employmentId).toBe(employmentId);
        }
        const superseded = events.filter((e) => e.operation === "SUPERSEDED");
        expect(superseded.map((e) => e.coverageId).sort()).toEqual([first, revised].sort());
        expect(superseded.every((e) => e.counterpartCoverageId != null)).toBe(true);
    });
});

describe.runIf(LIVE)("non-regression", () => {
    /**
     * Coverage is a new fact about a day. Slice 3 deliberately does NOT let it
     * reach staffing sufficiency yet — that is the next slice's job — so the
     * evidence that matters most here is the evidence of nothing happening.
     */
    it("B34 leaves every baseline staffing authority untouched through a whole lifecycle", async () => {
        for (const table of BASELINE_TABLES) {
            expect(baselineAtStart[table], `${table} must be readable for this proof to mean anything`).not.toBe(-1);
        }

        const id = await plan(D.tenancy, "08:00", "10:00", ROOM_A1);
        const revised = await supersedeCoverage(db, { coverageId: id, transition: "revision", endTime: "11:00" });
        await supersedeCoverage(db, { coverageId: revised, transition: "correction", roomLocationId: null });

        // Compared against the state this file started in, not against a reading
        // taken after the rest of the suite has already exercised every writer.
        expect(await snapshotBaseline()).toEqual(baselineAtStart);
    });

    it("B35 does not change baseline Staff supply arithmetic", async () => {
        const window = { dateStart: D.tenancy, dateEnd: D.tenancy };

        // Coverage rows from B34 are effective for this date and site right now.
        const coverage = await effectiveCoverageForSite(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            dateFrom: D.tenancy,
            dateTo: D.tenancy,
        });
        expect(coverage.length).toBeGreaterThan(0);

        const withCoverage = await buildStaffSupply(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            ...window,
        });

        await db.from("staff_coverage_allocations").delete().eq("org_id", ORG).eq("service_date", D.tenancy);

        const withoutCoverage = await buildStaffSupply(db, {
            orgId: ORG,
            siteLocationId: SITE_A,
            ...window,
        });

        // Same people, same cells, same counts: room-level Coverage must not be
        // read as a second body standing beside a site-level assignment.
        expect(withCoverage.members.map((m) => m.personId ?? m.assignmentId).sort()).toEqual(
            withoutCoverage.members.map((m) => m.personId ?? m.assignmentId).sort()
        );
        expect(withCoverage.cells.length).toBe(withoutCoverage.cells.length);
        expect(JSON.stringify(withCoverage.cells)).toBe(JSON.stringify(withoutCoverage.cells));
    });
});
