/**
 * V7 Package 1 — 1A, against a live database: expected attendance across a FUTURE-DATED primary
 * change (audit E2).
 *
 * The change is made by the canonical path the Assignment Card uses (`changeEnrolledPrimarySchedule`
 * → `apply_participation_operational_change`), which marks the prior primary and placement
 * `superseded` at once and closes them the day before the successor. The expectations are read by
 * the real loader and core every roster, staffing and compliance read model shares.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
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

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

describe.skipIf(!env)("expected attendance across a future-dated primary change (live)", () => {
    let db: SupabaseClient;
    let a: { orgId: string; customerId: string; siteId: string; roomA: string; roomB: string; programId: string | null; patternMF: string; patternAlt: string; altDays: number[] };
    let mod: {
        load: typeof import("@/lib/childcareOperational/expectations/loadOperationalExpectationInputs")["loadOperationalExpectationInputs"];
        expand: typeof import("@/lib/childcareOperational/expectations/scheduleExpectationCore")["expandExpectedAttendance"];
        change: typeof import("@/lib/childcareOperational/changeEnrolledPrimarySchedule")["changeEnrolledPrimarySchedule"];
    };
    const agreements: string[] = [];
    const members: string[] = [];

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const [load, core, change] = await Promise.all([
            import("@/lib/childcareOperational/expectations/loadOperationalExpectationInputs"),
            import("@/lib/childcareOperational/expectations/scheduleExpectationCore"),
            import("@/lib/childcareOperational/changeEnrolledPrimarySchedule"),
        ]);
        mod = { load: load.loadOperationalExpectationInputs, expand: core.expandExpectedAttendance, change: change.changeEnrolledPrimarySchedule };
        const { data: plc } = await db.from("child_placements").select("org_id, site_location_id, program_category_id, room_location_id").not("room_location_id", "is", null).limit(50);
        for (const p of (plc ?? []) as Array<{ org_id: string; site_location_id: string; program_category_id: string | null; room_location_id: string }>) {
            const { data: rooms } = await db.from("locations").select("id").eq("org_id", p.org_id).eq("location_type", "unit").eq("parent_location_id", p.site_location_id).limit(5);
            const { data: pats } = await db.from("schedule_patterns").select("id, weekdays").eq("org_id", p.org_id).eq("site_location_id", p.site_location_id);
            const { data: cust } = await db.from("customers").select("id").eq("org_id", p.org_id).limit(1);
            const patterns = (pats ?? []) as Array<{ id: string; weekdays: number[] }>;
            const mf = patterns.find((x) => [...(x.weekdays ?? [])].sort().join(",") === "1,2,3,4,5");
            const alt = patterns.find((x) => x.id !== mf?.id && (x.weekdays ?? []).length > 0);
            const roomB = ((rooms ?? []) as Array<{ id: string }>).map((r) => r.id).find((r) => r !== p.room_location_id);
            if (mf && alt && roomB && cust?.[0]) {
                a = { orgId: p.org_id, customerId: (cust[0] as { id: string }).id, siteId: p.site_location_id, roomA: p.room_location_id, roomB, programId: p.program_category_id, patternMF: mf.id, patternAlt: alt.id, altDays: alt.weekdays };
                break;
            }
        }
        expect(a, "no site with two rooms, a Mon–Fri pattern and a second pattern").toBeTruthy();
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

    async function enrolled() {
        const start = plus(-30);
        const { data: mem } = await db.from("customer_members").insert({ org_id: a.orgId, customer_id: a.customerId, display_name: `ZZQA P1 ${crypto.randomUUID().slice(0, 8)}` }).select("id").single();
        const memberId = (mem as { id: string }).id; members.push(memberId);
        const { data: agr } = await db.from("child_enrollment_agreements").insert({ org_id: a.orgId, customer_member_id: memberId, site_location_id: a.siteId, status: "active", start_date: start }).select("id").single();
        const agreementId = (agr as { id: string }).id; agreements.push(agreementId);
        await db.from("child_placements").insert({ org_id: a.orgId, enrollment_agreement_id: agreementId, customer_member_id: memberId, site_location_id: a.siteId, room_location_id: a.roomA, program_category_id: a.programId, start_date: start, status: "active", reason_key: "fixture" });
        const { data: asg, error } = await db.from("schedule_assignments").insert({ org_id: a.orgId, enrollment_agreement_id: agreementId, schedule_pattern_id: a.patternMF, customer_member_id: memberId, subject_type: "child", is_primary: true, start_date: start, status: "active", site_location_id: a.siteId, room_location_id: a.roomA }).select("id").single();
        expect(error, error?.message).toBeNull();
        return { memberId, agreementId, primaryId: (asg as { id: string }).id };
    }

    async function expectations(memberId: string, from: string, to: string) {
        const loaded = await mod.load(db, { orgId: a.orgId, siteLocationId: a.siteId });
        return mod.expand({ dateStart: from, dateEnd: to, ...loaded }).filter((e) => e.customerMemberId === memberId);
    }

    it("the child stays expected on today's schedule until the change, then on the successor — no gap, no double", async () => {
        const f = await enrolled();
        const edit = await mod.change(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternAlt, startDate: plus(7),
            roomLocationId: a.roomB, programCategoryId: a.programId, days: [],
        });
        expect(edit.kind).toBe("superseded");
        const { data: prior } = await db.from("schedule_assignments").select("status, end_date").eq("id", f.primaryId).single();
        expect(prior).toMatchObject({ status: "superseded", end_date: plus(6) });

        const entries = await expectations(f.memberId, plus(0), plus(20));
        const byDate = new Map<string, typeof entries>();
        for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
        // Never twice on one date.
        expect([...byDate.values()].every((list) => list.length === 1)).toBe(true);
        for (let i = 0; i <= 20; i++) {
            const d = plus(i);
            const got = byDate.get(d)?.[0] ?? null;
            if (i <= 6) {
                // Today's schedule (Mon–Fri, room A) through the day before the change.
                const due = [1, 2, 3, 4, 5].includes(weekday(d));
                expect(got ? [got.assignmentId, got.roomLocationId] : null, d).toEqual(due ? [f.primaryId, a.roomA] : null);
            } else {
                const due = a.altDays.includes(weekday(d));
                expect(got ? [got.assignmentId, got.roomLocationId] : null, d).toEqual(due ? [edit.assignmentId, a.roomB] : null);
            }
        }
    });

    it("history: dates before the change resolve to the schedule that applied then", async () => {
        const f = await enrolled();
        await mod.change(db, {
            orgId: a.orgId, enrollmentAgreementId: f.agreementId, todayYmd: plus(0), actorUserId: null,
            expectedAssignmentId: f.primaryId, schedulePatternId: a.patternAlt, startDate: plus(-5),
            roomLocationId: a.roomA, programCategoryId: a.programId, days: [],
        });
        const past = await expectations(f.memberId, plus(-20), plus(-6));
        expect(past.length).toBeGreaterThan(0);
        expect(new Set(past.map((e) => e.assignmentId))).toEqual(new Set([f.primaryId]));
    });

    it("an assignment's own week decides its expected days (custom days saved on a Mon–Fri pattern)", async () => {
        const f = await enrolled();
        // Fixture: the assignment's own week, written to the table the canonical read uses (the shared
        // stack lacks the set_assignment_weekday_intervals RPC — see the S3 record — so the row is
        // written directly; the READ under test is unchanged).
        await db.from("assignment_weekday_intervals").delete().eq("assignment_id", f.primaryId);
        const { error } = await db.from("assignment_weekday_intervals").insert(
            [1, 3, 5].map((w) => ({ org_id: a.orgId, assignment_id: f.primaryId, weekday: w, start_time: "08:00", end_time: "15:00", source_key: "operator" })),
        );
        expect(error, error?.message).toBeNull();
        const entries = await expectations(f.memberId, plus(0), plus(13));
        expect(new Set(entries.map((e) => e.weekday))).toEqual(new Set([1, 3, 5]));
    });
});
