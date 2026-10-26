/**
 * EXPECTED ATTENDANCE COMES FROM THE ENROLLMENT'S PRIMARY ASSIGNMENT — proven against a live database.
 *
 * The documented contract (`expandExpectedAttendance`): "operational schedule assignment x pattern
 * weekdays x committed placement (for room/program)" — ONE schedule per agreement, room and program
 * from the placement. `loadOperationalExpectationInputs` loaded EVERY committed live row under the
 * agreement and `indexOperationalByAgreement` kept whichever came last, so a child whose Before Care
 * was added after enrolment was expected only on the Before Care days. Every consumer reads through
 * that loader: expected attendance, compliance, occupancy, capacity options, staffing projection,
 * both rosters and the attendance card.
 *
 * V7 S6 (Director, 2026-10-25) adds the secondaries whose category expects attendance
 * (`attendance_participation = 'expected'`) as their own sessions. This file pins both categories with
 * its own fixture types, so the result never depends on which category a tenant happens to have:
 * a non-expecting secondary changes nothing, an expecting one adds its own session, and a child with
 * no primary is never expected from a secondary alone.
 *
 * ISOLATION. Rows carry ids under `P` or hang off this file's own customer members; teardown deletes
 * exactly those. Skipped unless the cert stack is configured.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { expandExpectedAttendance } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";

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

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const P = "ee6c0000-0000-4000-8000-";
const PATTERN_5 = `${P}0000000000d5`;
const PATTERN_3 = `${P}0000000000d3`;
const AGREEMENTS = [`${P}0000000000e1`, `${P}0000000000e2`, `${P}0000000000e3`, `${P}0000000000e4`];
const PLACEMENTS = [`${P}0000000000b1`, `${P}0000000000b2`, `${P}0000000000b3`, `${P}0000000000b4`];
const CAT_NONE = `${P}0000000000c0`; // attendance_participation = none
const CAT_EXPECTED = `${P}0000000000c1`; // attendance_participation = expected
const TODAY = "2026-10-22";
const WEEK = { start: "2026-11-09", end: "2026-11-15" }; // Mon … Sun

describe.skipIf(!env)("expected attendance: the enrollment's primary plus expecting secondaries (S6), live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    const members: string[] = [];
    let siteId = "";
    let customerId = "";
    let roomId: string | null = null;
    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    async function cleanup() {
        for (const m of members) await db.from("schedule_assignments").delete().eq("org_id", ORG).eq("customer_member_id", m);
        await db.from("child_placements").delete().in("id", PLACEMENTS);
        await db.from("child_enrollment_agreements").delete().in("id", AGREEMENTS);
        for (const m of members) await db.from("customer_members").delete().eq("id", m);
        await db.from("schedule_patterns").delete().in("id", [PATTERN_5, PATTERN_3]);
        await db.from("operational_assignment_types").delete().in("id", [CAT_NONE, CAT_EXPECTED]);
    }

    async function enrolled(i: number): Promise<string> {
        const member = await db
            .from("customer_members")
            .insert({ org_id: ORG, customer_id: customerId, display_name: `v6b expectation fixture ${crypto.randomUUID().slice(0, 8)}` })
            .select("id")
            .single();
        ok(member);
        const memberId = (member.data as { id: string }).id;
        members.push(memberId);
        ok(await db.from("child_enrollment_agreements").insert({
            id: AGREEMENTS[i], org_id: ORG, customer_member_id: memberId, customer_id: customerId, site_location_id: siteId,
            status: "active", start_date: "2026-09-01",
        }));
        ok(await db.from("child_placements").insert({
            id: PLACEMENTS[i], org_id: ORG, customer_member_id: memberId, enrollment_agreement_id: AGREEMENTS[i], site_location_id: siteId,
            room_location_id: roomId, start_date: "2026-09-01", status: "active",
        }));
        return memberId;
    }

    const create = (agreementId: string, patternId: string, startDate: string, isPrimary: boolean, category: string = CAT_NONE) =>
        createOperationalAssignment(db, {
            orgId: ORG,
            subject: { type: "child", enrollmentAgreementId: agreementId },
            schedulePatternId: patternId,
            startDate,
            assignmentTypeId: isPrimary ? null : category,
            roomLocationId: isPrimary ? null : roomId,
            isPrimary,
            actorUserId: ACTOR,
            todayYmd: TODAY,
        });

    async function expectedFor(agreementId: string) {
        const loaded = await loadOperationalExpectationInputs(db, { orgId: ORG, siteLocationId: siteId });
        return expandExpectedAttendance({
            dateStart: WEEK.start,
            dateEnd: WEEK.end,
            agreements: loaded.agreements,
            placements: loaded.placements,
            assignments: loaded.assignments,
            patternsById: loaded.patternsById,
        }).filter((e) => e.agreementId === agreementId);
    }

    beforeAll(async () => {
        await cleanup();
        const { data: sites } = await db.from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(1);
        siteId = (sites![0] as { id: string }).id;
        const { data: rooms } = await db.from("locations").select("id").eq("org_id", ORG).eq("parent_location_id", siteId).eq("location_type", "unit").limit(1);
        roomId = ((rooms ?? [])[0] as { id: string } | undefined)?.id ?? null;
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        customerId = (customers![0] as { id: string }).id;
        ok(await db.from("operational_assignment_types").insert([
            { id: CAT_NONE, org_id: ORG, key: "cert_s6_exp_none", label: "S6 live — no attendance", subject_types: ["child"], attendance_participation: "none" },
            { id: CAT_EXPECTED, org_id: ORG, key: "cert_s6_exp_expected", label: "S6 live — expects attendance", subject_types: ["child"], attendance_participation: "expected" },
        ]));
        ok(await db.from("schedule_patterns").insert([
            { id: PATTERN_5, org_id: ORG, site_location_id: siteId, key: "cert_v6b_exp_five", label: "V6-B five days", schedule_type_key: "cert_v6b_exp", weekdays: [1, 2, 3, 4, 5] },
            { id: PATTERN_3, org_id: ORG, site_location_id: siteId, key: "cert_v6b_exp_three", label: "V6-B three days", schedule_type_key: "cert_v6b_exp", weekdays: [1, 3, 5] },
        ]));
    }, 60_000);

    afterAll(async () => {
        await cleanup();
    });

    it("a non-expecting secondary added after enrolment: the child is expected on the primary's five days only", async () => {
        await enrolled(0);
        const primary = await create(AGREEMENTS[0]!, PATTERN_5, "2026-09-01", true);
        await create(AGREEMENTS[0]!, PATTERN_3, "2026-10-15", false); // the common order: secondary written last
        const entries = await expectedFor(AGREEMENTS[0]!);
        expect(entries.map((e) => e.date), "expected on Mon–Fri, not only the secondary's Mon/Wed/Fri").toEqual([
            "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
        ]);
        expect(new Set(entries.map((e) => e.assignmentId))).toEqual(new Set([primary.id]));
        // Room and program come from the placement — the documented current contract.
        expect(new Set(entries.map((e) => e.roomLocationId))).toEqual(new Set([roomId]));
    });

    it("independent of row order: a non-expecting secondary written before the primary changes nothing", async () => {
        await enrolled(1);
        await create(AGREEMENTS[1]!, PATTERN_3, "2026-10-15", false);
        const primary = await create(AGREEMENTS[1]!, PATTERN_5, "2026-09-01", true);
        const entries = await expectedFor(AGREEMENTS[1]!);
        expect(entries).toHaveLength(5);
        expect(new Set(entries.map((e) => e.assignmentId))).toEqual(new Set([primary.id]));
    });

    it("an enrolled child with no primary is not expected from a secondary, even one whose category expects attendance", async () => {
        await enrolled(2);
        await create(AGREEMENTS[2]!, PATTERN_3, "2026-10-15", false, CAT_EXPECTED);
        expect(await expectedFor(AGREEMENTS[2]!)).toEqual([]);
    });

    it("S6: a secondary whose category expects attendance adds its own session on its own days", async () => {
        await enrolled(3);
        const primary = await create(AGREEMENTS[3]!, PATTERN_5, "2026-09-01", true);
        const session = await create(AGREEMENTS[3]!, PATTERN_3, "2026-10-15", false, CAT_EXPECTED);
        const entries = await expectedFor(AGREEMENTS[3]!);
        const primaryDates = entries.filter((e) => e.assignmentId === primary.id).map((e) => e.date);
        const sessionDates = entries.filter((e) => e.assignmentId === session.id).map((e) => e.date);
        expect(primaryDates).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
        expect(sessionDates, "the secondary's own Mon/Wed/Fri").toEqual(["2026-11-09", "2026-11-11", "2026-11-13"]);
        expect(entries.filter((e) => e.assignmentId === session.id).every((e) => e.isPrimary === false)).toBe(true);
        expect(entries.filter((e) => e.assignmentId === session.id).every((e) => e.roomLocationId === roomId)).toBe(true);
        expect(entries).toHaveLength(8);
    });
});
