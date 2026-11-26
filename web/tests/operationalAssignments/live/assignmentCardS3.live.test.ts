/**
 * V7 S3 — ASSIGNMENT CARD CORRECTNESS, against a live database.
 *
 * Every write here goes through the code the card's Save reaches — the registered actions
 * (`assignment.create`, `assignment.set_time`, `assignment.archive`, `assignment.set_primary`), the
 * enrolled-primary change path the scheduling route now takes, and the scheduling projection the card
 * reopens from. Fixtures are created and removed per test on the certification stack.
 *
 *   1 new primary · 2 new secondary (end date, per-day hours) · 3 secondary edit + reopen ·
 *   4 secondary end date on the same start · 5 daily and per-day hours · 6 custom weekdays ·
 *   7 enrolled-primary update · 8 stale edit · 9 one live primary · 10 Make Primary refused for a child ·
 *   12 tuition terms untouched · 13 homeroom follows the edited primary · 14 save latency.
 *
 * (11, bulk partial-failure reporting, is `tests/adminV2/scheduling/rosterBulkRoomChangeRefusals.test.ts`.)
 *
 * ── WHERE ASSIGNMENT TIME CANNOT BE MEASURED ──
 * Cases that write a week need `set_assignment_weekday_intervals` (migration 20261014120000). A stack
 * without it cannot measure them, and they are reported as UNMEASURED — never as a pass. The shared
 * local `alloy-cert` stack lagged it on 2026-10-23; the S3 mounted QA on the candidate's isolated
 * preview database covers those cases through the app's own endpoints.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}
const env = certEnv();
if (env) {
    process.env.SUPABASE_URL = env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;
}

const LIVE = ["planned", "active", "ending"];

/** Whether this stack can write Assignment Time at all (see the header). */
async function weekWritable(): Promise<boolean> {
    if (!env) return false;
    const res = await fetch(`${env.url}/rest/v1/rpc/set_assignment_weekday_intervals`, {
        method: "POST",
        headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json" },
        body: JSON.stringify({ p_assignment_id: "00000000-0000-0000-0000-000000000000", p_days: [], p_actor: null }),
    }).catch(() => null);
    if (!res) return false;
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    return body?.code !== "PGRST202";
}
const WEEK = await weekWritable();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
};
const OUT = resolve(__dirname, "../../../.vac-validation/s3-live");
const measurements: Record<string, unknown> = { assignmentTimeMeasurable: WEEK };

type Anchors = {
    orgId: string;
    customerId: string;
    siteId: string;
    roomA: string;
    roomB: string;
    programId: string | null;
    patternMF: string;
    patternAlt: string;
    secondaryTypeId: string;
    actorUserId: string | null;
};

/** Every object in the projection that carries this assignment id. */
function findAssignment(node: unknown, id: string): Record<string, unknown> | null {
    if (!node || typeof node !== "object") return null;
    const n = node as Record<string, unknown>;
    if (n.id === id && Array.isArray(n.weekdays)) return n;
    for (const v of Object.values(n)) {
        const hit = findAssignment(v, id);
        if (hit) return hit;
    }
    return null;
}

describe.skipIf(!env)("V7 S3 — the Assignment Card's writes persist and reopen", () => {
    let db: SupabaseClient;
    let a: Anchors;
    let mod: {
        getRegisteredAction: typeof import("@/lib/adminV2/actions/actionRegistry")["getRegisteredAction"];
        changeEnrolledPrimarySchedule: typeof import("@/lib/childcareOperational/changeEnrolledPrimarySchedule")["changeEnrolledPrimarySchedule"];
        hasOperationalPrimary: typeof import("@/lib/childcareOperational/changeEnrolledPrimarySchedule")["hasOperationalPrimary"];
        createOperationalAssignment: typeof import("@/lib/operationalAssignments/operationalAssignmentService")["createOperationalAssignment"];
        loadProjection: typeof import("@/lib/scheduling/projection/buildSchedulingProjection")["loadSchedulingProjectionForChild"];
        deriveHomerooms: typeof import("@/lib/location/homerooms")["deriveHomerooms"];
        homeroomAssignmentFromRow: typeof import("@/lib/location/loadHomeroomContext")["homeroomAssignmentFromRow"];
    };
    const agreements: string[] = [];
    const members: string[] = [];

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const [registry, change, svc, proj, homerooms, homeroomCtx] = await Promise.all([
            import("@/lib/adminV2/actions/actionRegistry"),
            import("@/lib/childcareOperational/changeEnrolledPrimarySchedule"),
            import("@/lib/operationalAssignments/operationalAssignmentService"),
            import("@/lib/scheduling/projection/buildSchedulingProjection"),
            import("@/lib/location/homerooms"),
            import("@/lib/location/loadHomeroomContext"),
        ]);
        mod = {
            getRegisteredAction: registry.getRegisteredAction,
            changeEnrolledPrimarySchedule: change.changeEnrolledPrimarySchedule,
            hasOperationalPrimary: change.hasOperationalPrimary,
            createOperationalAssignment: svc.createOperationalAssignment,
            loadProjection: proj.loadSchedulingProjectionForChild,
            deriveHomerooms: homerooms.deriveHomerooms,
            homeroomAssignmentFromRow: homeroomCtx.homeroomAssignmentFromRow,
        };

        // A site with two operational rooms, a Mon–Fri pattern and a second pattern, and a secondary
        // category — copied from what the database already holds, never assembled.
        const { data: plc } = await db
            .from("child_placements")
            .select("org_id, site_location_id, program_category_id, room_location_id")
            .not("room_location_id", "is", null)
            .limit(50);
        let picked: Anchors | null = null;
        for (const p of (plc ?? []) as Array<{ org_id: string; site_location_id: string; program_category_id: string | null; room_location_id: string }>) {
            const { data: rooms } = await db.from("locations").select("id")
                .eq("org_id", p.org_id).eq("location_type", "unit").eq("parent_location_id", p.site_location_id).limit(5);
            const { data: pats } = await db.from("schedule_patterns").select("id, weekdays")
                .eq("org_id", p.org_id).eq("site_location_id", p.site_location_id);
            const { data: types } = await db.from("operational_assignment_types").select("id, subject_types, is_active")
                .eq("org_id", p.org_id);
            const { data: cust } = await db.from("customers").select("id").eq("org_id", p.org_id).limit(1);
            const roomIds = ((rooms ?? []) as Array<{ id: string }>).map((r) => r.id);
            const patterns = (pats ?? []) as Array<{ id: string; weekdays: number[] }>;
            const mf = patterns.find((x) => [...(x.weekdays ?? [])].sort().join(",") === "1,2,3,4,5");
            const alt = patterns.find((x) => x.id !== mf?.id);
            const secondary = ((types ?? []) as Array<{ id: string; subject_types?: string[] | null; is_active?: boolean | null }>)
                .find((t) => t.is_active !== false && (!t.subject_types || t.subject_types.includes("child")));
            const roomB = roomIds.find((r) => r !== p.room_location_id);
            if (mf && alt && secondary && roomB && cust?.[0]) {
                picked = {
                    orgId: p.org_id, customerId: (cust[0] as { id: string }).id, siteId: p.site_location_id,
                    roomA: p.room_location_id, roomB, programId: p.program_category_id,
                    patternMF: mf.id, patternAlt: alt.id, secondaryTypeId: secondary.id, actorUserId: null,
                };
                break;
            }
        }
        expect(picked, "no site on the certification stack has two rooms, a Mon–Fri pattern, a second pattern and a child category").not.toBeNull();
        a = picked!;
        mkdirSync(OUT, { recursive: true });
    });

    afterEach(async () => {
        while (agreements.length) {
            const id = agreements.pop()!;
            await db.from("workflow_events").delete().eq("org_id", a.orgId).contains("payload", { enrollment_agreement_id: id });
            await db.from("child_enrollment_agreements").delete().eq("id", id);
        }
        while (members.length) {
            const id = members.pop()!;
            await db.from("schedule_assignments").delete().eq("customer_member_id", id);
            await db.from("customer_members").delete().eq("id", id);
        }
    });

    afterAll(() => {
        if (a) writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    });

    /** An enrolled child; with `primary`, already on a Mon–Fri primary in room A since 30 days ago. */
    async function enrolledChild(primary = true) {
        const start = plus(-30);
        const { data: mem, error: memErr } = await db.from("customer_members")
            .insert({ org_id: a.orgId, customer_id: a.customerId, display_name: `ZZQA S3 ${crypto.randomUUID().slice(0, 8)}` })
            .select("id").single();
        expect(memErr).toBeNull();
        const memberId = (mem as { id: string }).id;
        members.push(memberId);
        const { data: agr, error: agrErr } = await db.from("child_enrollment_agreements")
            .insert({ org_id: a.orgId, customer_member_id: memberId, site_location_id: a.siteId, status: "active", start_date: start })
            .select("id").single();
        expect(agrErr).toBeNull();
        const agreementId = (agr as { id: string }).id;
        agreements.push(agreementId);
        const { data: plc, error: plcErr } = await db.from("child_placements")
            .insert({
                org_id: a.orgId, enrollment_agreement_id: agreementId, customer_member_id: memberId,
                site_location_id: a.siteId, room_location_id: a.roomA, program_category_id: a.programId,
                start_date: start, status: "active", reason_key: "fixture",
            })
            .select("id").single();
        expect(plcErr).toBeNull();
        let primaryId: string | null = null;
        if (primary) {
            const { data: asg, error: asgErr } = await db.from("schedule_assignments")
                .insert({
                    org_id: a.orgId, enrollment_agreement_id: agreementId, schedule_pattern_id: a.patternMF,
                    customer_member_id: memberId, subject_type: "child", is_primary: true, start_date: start,
                    status: "active", site_location_id: a.siteId, room_location_id: a.roomA,
                })
                .select("id").single();
            expect(asgErr, asgErr?.message).toBeNull();
            primaryId = (asg as { id: string }).id;
        }
        return { memberId, agreementId, placementId: (plc as { id: string }).id, primaryId, start };
    }

    const ctx = () => ({
        orgId: a.orgId,
        userId: a.actorUserId,
        accessScope: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] },
    });
    async function act(actionKey: string, entityId: string, payload: Record<string, unknown>, entityType = "child") {
        const action = mod.getRegisteredAction(actionKey)!;
        const v = action.validatePayload ? action.validatePayload(payload) : { ok: true as const, value: payload };
        if (!v.ok) return { ok: false as const, status: 400, error: v.blockers?.[0]?.message ?? "invalid" };
        return (await action.execute({
            supabase: db,
            ctx: ctx(),
            invocation: { actionKey, entityType, entityId, payload },
            payload,
        } as never)) as { ok: boolean; status?: number; error?: string; result?: { affectedId?: string } };
    }
    const childPayload = (f: { memberId: string; agreementId: string }) => ({
        subject_type: "child",
        customer_member_id: f.memberId,
        enrollment_agreement_id: f.agreementId,
        site_location_id: a.siteId,
    });
    async function reopen(memberId: string, assignmentId: string) {
        const projection = await mod.loadProjection(db, a.orgId, {
            customerMemberId: memberId, subjectName: "ZZQA S3", siteLocationId: a.siteId, todayYmd: plus(0),
            computedAt: new Date().toISOString(), siteName: "site",
        } as never);
        return findAssignment(projection, assignmentId);
    }
    const livePrimaries = async (agreementId: string) =>
        ((await db.from("schedule_assignments").select("id")
            .eq("enrollment_agreement_id", agreementId).eq("is_primary", true).in("status", LIVE)).data ?? []).length;
    const pricingTerms = async (memberId: string) =>
        JSON.stringify((await db.from("enrollment_pricing_terms").select("*").eq("customer_member_id", memberId).order("id")).data ?? []);
    const week = (days: number[], perDay: Record<number, [string, string]> = {}, daily: [string, string] | null = null) =>
        days.map((weekday) => {
            const h = perDay[weekday] ?? daily;
            return { weekday, start_time: h?.[0] ?? null, end_time: h?.[1] ?? null };
        });

    it("1 — a new primary: the first schedule is created, once", async () => {
        const f = await enrolledChild(false);
        expect(await mod.hasOperationalPrimary(db, a.orgId, f.agreementId)).toBe(false);
        const row = await mod.createOperationalAssignment(db, {
            orgId: a.orgId,
            subject: { type: "child", enrollmentAgreementId: f.agreementId, customerMemberId: f.memberId, siteLocationId: a.siteId },
            schedulePatternId: a.patternMF, startDate: plus(-1), roomLocationId: a.roomA, isPrimary: true,
            commitmentKind: "committed", sourceKey: "operator", todayYmd: plus(0),
        } as never);
        expect(row.is_primary).toBe(true);
        expect(await mod.hasOperationalPrimary(db, a.orgId, f.agreementId)).toBe(true);
        expect(await livePrimaries(f.agreementId)).toBe(1);
    });

    it.skipIf(!WEEK)("2 — a new secondary keeps its end date and each day's own hours", async () => {
        const f = await enrolledChild();
        const end = plus(60);
        const r = await act("assignment.create", f.memberId, {
            ...childPayload(f), schedule_pattern_id: a.patternMF, start_date: plus(1), end_date: end,
            room_location_id: a.roomB, assignment_type_id: a.secondaryTypeId, is_primary: false,
            days: week([1, 3], { 1: ["07:00", "08:30"], 3: ["07:15", "08:45"] }),
        });
        expect(r.ok, r.error).toBe(true);
        const id = r.result!.affectedId!;
        const { data: row } = await db.from("schedule_assignments").select("end_date, is_primary").eq("id", id).single();
        expect(row).toMatchObject({ end_date: end, is_primary: false });
        const reopened = await reopen(f.memberId, id);
        expect(reopened?.weekdays).toEqual([1, 3]);
        expect(reopened?.effectiveTo).toBe(end);
        expect(reopened?.dailyHours).toEqual({ 1: { arrive: "07:00", depart: "08:30" }, 3: { arrive: "07:15", depart: "08:45" } });
    });

    it.skipIf(!WEEK)("3 — editing a secondary from a later date: the successor carries the end date and week; the prior closes", async () => {
        const f = await enrolledChild();
        const first = await act("assignment.create", f.memberId, {
            ...childPayload(f), schedule_pattern_id: a.patternMF, start_date: plus(1), room_location_id: a.roomB,
            assignment_type_id: a.secondaryTypeId, is_primary: false, days: week([1, 2, 3, 4, 5], {}, ["15:00", "18:00"]),
        });
        expect(first.ok, first.error).toBe(true);
        const priorId = first.result!.affectedId!;
        const end = plus(90);
        const edit = await act("assignment.create", f.memberId, {
            ...childPayload(f), schedule_pattern_id: a.patternMF, start_date: plus(10), end_date: end,
            room_location_id: a.roomB, assignment_type_id: a.secondaryTypeId, is_primary: false,
            supersedes_assignment_id: priorId, days: week([2, 4], {}, ["15:30", "17:30"]),
        });
        expect(edit.ok, edit.error).toBe(true);
        const successorId = edit.result!.affectedId!;
        const { data: prior } = await db.from("schedule_assignments").select("status, end_date").eq("id", priorId).single();
        expect(prior).toMatchObject({ status: "superseded", end_date: plus(9) });
        const reopened = await reopen(f.memberId, successorId);
        expect(reopened).toMatchObject({ weekdays: [2, 4], arriveTime: "15:30", departTime: "17:30", effectiveTo: end });
    });

    it("4 — a secondary's end date on the same start persists, and a future end keeps it live until then", async () => {
        const f = await enrolledChild();
        const c = await act("assignment.create", f.memberId, {
            ...childPayload(f), schedule_pattern_id: a.patternMF, start_date: plus(-3), room_location_id: a.roomB,
            assignment_type_id: a.secondaryTypeId, is_primary: false,
        });
        expect(c.ok, c.error).toBe(true);
        const id = c.result!.affectedId!;
        const end = plus(45);
        const r = await act("assignment.archive", f.memberId, { assignment_id: id, end_date: end });
        expect(r.ok, r.error).toBe(true);
        const { data: row } = await db.from("schedule_assignments").select("status, end_date").eq("id", id).single();
        expect(row).toMatchObject({ end_date: end });
        expect(LIVE).toContain((row as { status: string }).status);
        const reopened = await reopen(f.memberId, id);
        expect(reopened?.effectiveTo).toBe(end);
        expect(reopened?.openEnded).toBe(false);
        // A superseded row cannot be ended — that would rewrite history under a stale card.
        await db.from("schedule_assignments").update({ status: "superseded" }).eq("id", id);
        const stale = await act("assignment.archive", f.memberId, { assignment_id: id, end_date: plus(50) });
        expect(stale.ok).toBe(false);
        expect(stale.status).toBe(409);
    });

    it.skipIf(!WEEK)("5 — daily hours and per-day hours both reopen as saved", async () => {
        const f = await enrolledChild();
        const uniform = await act("assignment.set_time", f.memberId, { assignment_id: f.primaryId, days: week([1, 2, 3, 4, 5], {}, ["08:00", "17:00"]) });
        expect(uniform.ok, uniform.error).toBe(true);
        expect(await reopen(f.memberId, f.primaryId!)).toMatchObject({ arriveTime: "08:00", departTime: "17:00" });
        const varied = await act("assignment.set_time", f.memberId, {
            assignment_id: f.primaryId,
            days: week([1, 2, 3, 4, 5], { 5: ["08:00", "12:00"] }, ["08:00", "17:00"]),
        });
        expect(varied.ok, varied.error).toBe(true);
        const reopened = await reopen(f.memberId, f.primaryId!);
        expect(reopened?.arriveTime).toBeNull();
        expect((reopened?.dailyHours as Record<number, unknown>)[5]).toEqual({ arrive: "08:00", depart: "12:00" });
        expect((reopened?.dailyHours as Record<number, unknown>)[1]).toEqual({ arrive: "08:00", depart: "17:00" });
    });

    it.skipIf(!WEEK)("6 — custom weekdays on a Mon–Fri pattern reopen as the operator's days, not the pattern's", async () => {
        const f = await enrolledChild();
        const r = await act("assignment.set_time", f.memberId, { assignment_id: f.primaryId, days: week([1, 3, 5], {}, ["09:00", "15:00"]) });
        expect(r.ok, r.error).toBe(true);
        const reopened = await reopen(f.memberId, f.primaryId!);
        expect(reopened?.weekdays).toEqual([1, 3, 5]);
        expect(reopened?.patternId).toBe(a.patternMF);
    });

    it("7 + 9 + 12 + 13 + 14 — an enrolled primary edit supersedes once, moves room with its placement, leaves tuition, and is quick", async () => {
        const f = await enrolledChild();
        const termsBefore = await pricingTerms(f.memberId);
        const startedAt = performance.now();
        const edit = await mod.changeEnrolledPrimarySchedule(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternAlt, startDate: plus(7),
            roomLocationId: a.roomB, programCategoryId: a.programId,
            days: WEEK ? [{ weekday: 2, startTime: "08:00", endTime: "16:00" }, { weekday: 4, startTime: "08:00", endTime: "12:00" }] : [],
        });
        const ms = Math.round(performance.now() - startedAt);
        measurements.enrolledPrimaryEditMs = ms;
        expect(edit.kind).toBe("superseded");
        expect(edit.priorAssignmentId).toBe(f.primaryId);
        expect(edit.placementSuperseded).toBe(true);

        const { data: rows } = await db.from("schedule_assignments")
            .select("id, status, start_date, end_date, schedule_pattern_id, room_location_id, supersedes_assignment_id, is_primary, operational_assignment_type_id, commitment_kind, subject_type, enrollment_agreement_id")
            .eq("enrollment_agreement_id", f.agreementId);
        const successor = (rows ?? []).find((r) => r.id === edit.assignmentId)!;
        expect(successor).toMatchObject({ schedule_pattern_id: a.patternAlt, room_location_id: a.roomB, start_date: plus(7), supersedes_assignment_id: f.primaryId, is_primary: true });
        expect((rows ?? []).find((r) => r.id === f.primaryId)).toMatchObject({ status: "superseded", end_date: plus(6) });
        // 9 — never two live primaries.
        expect(await livePrimaries(f.agreementId)).toBe(1);
        // The placement moved in the same transaction, to the same room.
        const { data: plcs } = await db.from("child_placements").select("id, status, room_location_id, start_date, supersedes_placement_id").eq("enrollment_agreement_id", f.agreementId);
        expect((plcs ?? []).find((p) => p.supersedes_placement_id === f.placementId)).toMatchObject({ room_location_id: a.roomB, start_date: plus(7) });
        // Its week, as written (UNMEASURED where Assignment Time cannot be written — see the header).
        if (WEEK) expect((await reopen(f.memberId, edit.assignmentId))?.weekdays).toEqual([2, 4]);
        // 12 — no pricing term was written or changed.
        expect(await pricingTerms(f.memberId)).toBe(termsBefore);
        // 13 — the homeroom source for the enrollment's own assignment is its room: room A until the
        // change, room B from it. Both rooms are given Homeroom uses here so only the dating decides.
        const spaces = new Map([a.roomA, a.roomB].map((id) => [id, { id, label: id, unitRole: "operational_group", spaceUses: ["hr"], spaceUsesMalformed: false }])) as never;
        const asRows = (rows ?? []).map((r) => mod.homeroomAssignmentFromRow({ ...r, operational_assignment_type_id: null } as never));
        const on = (d: string) => mod.deriveHomerooms({ onDate: d, assignments: asRows, spacesById: spaces, homeroomCategoryIds: new Set(["hr"]) }).map((h) => h.spaceId);
        expect(on(plus(1))).toEqual([a.roomA]);
        expect(on(plus(8))).toEqual([a.roomB]);
        // 14 — one transaction and one week write; generous bound, measured value recorded.
        expect(ms).toBeLessThan(5000);
    });

    it.skipIf(!WEEK)("7b — an hours-only edit on the same start corrects the current primary in place (no successor)", async () => {
        const f = await enrolledChild();
        const edit = await mod.changeEnrolledPrimarySchedule(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternMF, startDate: f.start,
            roomLocationId: a.roomA, programCategoryId: a.programId,
            days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "07:30", endTime: "16:30" })),
        });
        expect(edit).toMatchObject({ kind: "corrected", assignmentId: f.primaryId });
        const { data: rows } = await db.from("schedule_assignments").select("id").eq("enrollment_agreement_id", f.agreementId);
        expect(rows).toHaveLength(1);
        expect(await reopen(f.memberId, f.primaryId!)).toMatchObject({ arriveTime: "07:30", departTime: "16:30" });
        // A changed pattern on the same start needs the date it takes effect.
        await expect(mod.changeEnrolledPrimarySchedule(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternAlt, startDate: f.start,
            roomLocationId: a.roomA, programCategoryId: a.programId, days: [],
        })).rejects.toThrow(/date this change takes effect/);
    });

    it("8 — a stale edit is refused, and writes nothing", async () => {
        const f = await enrolledChild();
        const first = await mod.changeEnrolledPrimarySchedule(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternAlt, startDate: plus(5),
            roomLocationId: a.roomA, programCategoryId: a.programId, days: [],
        });
        const before = JSON.stringify((await db.from("schedule_assignments").select("*").eq("enrollment_agreement_id", f.agreementId).order("id")).data);
        // A second operator, still looking at the ORIGINAL primary, saves a different change.
        await expect(mod.changeEnrolledPrimarySchedule(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternMF, startDate: plus(9),
            roomLocationId: a.roomB, programCategoryId: a.programId, days: [],
        })).rejects.toMatchObject({ code: "conflict" });
        const after = JSON.stringify((await db.from("schedule_assignments").select("*").eq("enrollment_agreement_id", f.agreementId).order("id")).data);
        expect(after).toBe(before);
        // The same operator's double-submit converges on what it already wrote.
        const again = await mod.changeEnrolledPrimarySchedule(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternAlt, startDate: plus(5),
            roomLocationId: a.roomA, programCategoryId: a.programId, days: [],
        });
        expect(again.assignmentId).toBe(first.assignmentId);
        expect(await livePrimaries(f.agreementId)).toBe(1);
    });

    it("10 — Make Primary is refused for a child, and nothing is written", async () => {
        const f = await enrolledChild();
        const sec = await act("assignment.create", f.memberId, {
            ...childPayload(f), schedule_pattern_id: a.patternMF, start_date: plus(1), room_location_id: a.roomB,
            assignment_type_id: a.secondaryTypeId, is_primary: false,
        });
        expect(sec.ok, sec.error).toBe(true);
        const before = JSON.stringify((await db.from("schedule_assignments").select("*").eq("customer_member_id", f.memberId).order("id")).data);
        const r = await act("assignment.set_primary", f.memberId, {
            ...childPayload(f), effective_date: plus(2), promote_assignment_id: sec.result!.affectedId,
        });
        expect(r.ok).toBe(false);
        expect(r.status).toBe(409);
        expect(r.error).toMatch(/editing it/);
        const after = JSON.stringify((await db.from("schedule_assignments").select("*").eq("customer_member_id", f.memberId).order("id")).data);
        expect(after).toBe(before);
    });
});
