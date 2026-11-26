/**
 * V7 C1 — WHICH SCHEDULE DOES TUITION READ? Two suspected defects, probed against a live database.
 *
 * `readAssignmentPricingFacts` supplies the days a week a child is priced at. It reads the
 * agreement's committed primary with `end_date IS NULL` (newest start first) and counts its
 * PATTERN's weekdays.
 *
 *   (a) A custom week (S3/A6) is carried by a pattern whose weekdays differ from the days chosen —
 *       the chosen days live on the Assignment Time (`assignment_weekday_intervals`). Is the child
 *       priced at the days they attend, or at the carrier pattern's count?
 *   (b) A future-dated primary change leaves today's primary `superseded` (closed the day before its
 *       successor) and the successor `planned` and open-ended. Is "the date being priced" (asOf)
 *       answered by the row in effect on it, or by the successor before it starts?
 *
 * The rows are written as the canonical writers leave them (the supersession shape is the one
 * `expectationsAcrossSupersession.live.test.ts` produces through the real change path); the reader is
 * the real one. This file asserts what the reader SHOULD answer — a red here is the reproduced defect.
 *
 * ISOLATION: every row hangs off ids under `P` or this file's own customer member; teardown deletes
 * exactly those. Skipped unless the certification stack is configured.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readAssignmentPricingFacts } from "@/lib/enrollment/pricing/assignmentPricingFacts";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
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
const P = "ee6c1000-0000-4000-8000-";
const CATEGORY = `${P}0000000000c1`;
const PATTERN_5 = `${P}0000000000d5`;
const PATTERN_3 = `${P}0000000000d3`;
const ATTENDANCE = "cert_v7c1_full_day";
const OCM_A = `${P}0000000000a1`;
const OCM_B = `${P}0000000000a2`;
const AGR_A = `${P}0000000000e1`;
const AGR_B = `${P}0000000000e2`;
const PLC_A = `${P}0000000000b1`;
const PLC_B1 = `${P}0000000000b2`;
const PLC_B2 = `${P}0000000000b3`;
const ASG_A = `${P}0000000000f1`;
const ASG_B1 = `${P}0000000000f2`;
const ASG_B2 = `${P}0000000000f3`;

const START = "2026-09-01";
const CHANGE = "2026-11-16"; // the successor's start
const BEFORE_CHANGE = "2026-11-15";
const TODAY = "2026-10-22";

describe.skipIf(!env)("V7 C1 — tuition reads the schedule in effect on the priced date, live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    const members: string[] = [];
    let siteId = "";

    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    async function cleanup() {
        await db.from("assignment_weekday_intervals").delete().eq("org_id", ORG).in("assignment_id", [ASG_A, ASG_B1, ASG_B2]);
        await db.from("schedule_assignments").delete().eq("org_id", ORG).in("id", [ASG_B2, ASG_B1, ASG_A]);
        await db.from("child_placements").delete().in("id", [PLC_B2, PLC_B1, PLC_A]);
        await db.from("child_enrollment_agreements").delete().in("id", [AGR_A, AGR_B]);
        await db.from("opportunity_customer_members").delete().in("id", [OCM_A, OCM_B]);
        if (members.length) await db.from("customer_members").delete().in("id", members);
        await db.from("schedule_patterns").delete().in("id", [PATTERN_5, PATTERN_3]);
        await db.from("location_program_categories").delete().eq("id", CATEGORY);
    }

    async function child(ocm: string, agreement: string): Promise<{ memberId: string; customerId: string }> {
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        const customerId = (customers![0] as { id: string }).id;
        const member = await db
            .from("customer_members")
            .insert({ org_id: ORG, customer_id: customerId, display_name: `v7 c1 probe ${crypto.randomUUID().slice(0, 8)}` })
            .select("id")
            .single();
        ok(member);
        const memberId = (member.data as { id: string }).id;
        members.push(memberId);
        ok(await db.from("opportunity_customer_members").insert({ id: ocm, org_id: ORG, customer_member_id: memberId, program_category_id: CATEGORY, location_id: siteId }));
        ok(
            await db.from("child_enrollment_agreements").insert({
                id: agreement, org_id: ORG, customer_member_id: memberId, customer_id: customerId, site_location_id: siteId,
                opportunity_customer_member_id: ocm, status: "active", start_date: START,
            }),
        );
        return { memberId, customerId };
    }

    const primary = (id: string, memberId: string, agreement: string, pattern: string, start: string, end: string | null, status: string) => ({
        id, org_id: ORG, subject_type: "child", enrollment_agreement_id: agreement, customer_member_id: memberId,
        site_location_id: siteId, schedule_pattern_id: pattern, is_primary: true, commitment_kind: "committed",
        start_date: start, end_date: end, status, assignment_kind: "base", source_key: "cert_fixture",
    });

    beforeAll(async () => {
        await cleanup();
        const { data: sites } = await db.from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(1);
        siteId = (sites![0] as { id: string }).id;
        ok(await db.from("location_program_categories").insert({ id: CATEGORY, org_id: ORG, location_id: siteId, key: "cert_v7c1_program", label: "V7 C1 probe program", is_active: true }));
        ok(
            await db.from("schedule_patterns").insert([
                { id: PATTERN_5, org_id: ORG, site_location_id: siteId, key: "cert_v7c1_five_day", label: "C1 five days", schedule_type_key: ATTENDANCE, weekdays: [1, 2, 3, 4, 5] },
                { id: PATTERN_3, org_id: ORG, site_location_id: siteId, key: "cert_v7c1_three_day", label: "C1 three days", schedule_type_key: ATTENDANCE, weekdays: [1, 3, 5] },
            ]),
        );

        // (a) Custom week: a Tue/Thu child whose week is carried by the five-day pattern.
        const a = await child(OCM_A, AGR_A);
        ok(await db.from("child_placements").insert({ id: PLC_A, org_id: ORG, customer_member_id: a.memberId, enrollment_agreement_id: AGR_A, site_location_id: siteId, program_category_id: CATEGORY, start_date: START, status: "active" }));
        ok(await db.from("schedule_assignments").insert(primary(ASG_A, a.memberId, AGR_A, PATTERN_5, START, null, "active")));
        // The insert seeds the pattern's week (hours unknown); saving a custom week replaces it, as
        // `set_assignment_weekday_intervals` does.
        ok(await db.from("assignment_weekday_intervals").delete().eq("org_id", ORG).eq("assignment_id", ASG_A));
        ok(
            await db.from("assignment_weekday_intervals").insert(
                [2, 4].map((weekday) => ({ org_id: ORG, assignment_id: ASG_A, weekday, start_time: "08:00", end_time: "15:00", source_key: "operator" })),
            ),
        );

        // (b) Future-dated change: five days through BEFORE_CHANGE (superseded, closed), three days from CHANGE (planned).
        const b = await child(OCM_B, AGR_B);
        ok(await db.from("child_placements").insert({ id: PLC_B1, org_id: ORG, customer_member_id: b.memberId, enrollment_agreement_id: AGR_B, site_location_id: siteId, program_category_id: CATEGORY, start_date: START, end_date: BEFORE_CHANGE, status: "superseded" }));
        ok(await db.from("child_placements").insert({ id: PLC_B2, org_id: ORG, customer_member_id: b.memberId, enrollment_agreement_id: AGR_B, site_location_id: siteId, program_category_id: CATEGORY, start_date: CHANGE, status: "planned", supersedes_placement_id: PLC_B1 }));
        ok(await db.from("schedule_assignments").insert(primary(ASG_B1, b.memberId, AGR_B, PATTERN_5, START, BEFORE_CHANGE, "superseded")));
        ok(await db.from("schedule_assignments").insert({ ...primary(ASG_B2, b.memberId, AGR_B, PATTERN_3, CHANGE, null, "planned"), supersedes_assignment_id: ASG_B1 }));
    }, 60_000);

    afterAll(async () => {
        await cleanup();
    });

    const daysAt = async (ocm: string, asOf: string) => {
        const r = await readAssignmentPricingFacts(db, { orgId: ORG, opportunityCustomerMemberId: ocm, asOf });
        expect(r.ok, JSON.stringify(r)).toBe(true);
        return r.ok ? { days: r.facts.daysPerWeek, source: r.sources.daysPerWeek } : null;
    };

    it("(a) a custom Tue/Thu week is priced at two days, not at its carrier pattern's five", async () => {
        expect(await daysAt(OCM_A, TODAY)).toEqual({ days: 2, source: "committed_schedule" });
    });

    it("(b) before a future-dated change, today is priced at today's five days", async () => {
        expect(await daysAt(OCM_B, TODAY)).toEqual({ days: 5, source: "committed_schedule" });
        expect(await daysAt(OCM_B, BEFORE_CHANGE)).toEqual({ days: 5, source: "committed_schedule" });
    });

    it("(b) from the change's start, the successor's three days answer", async () => {
        expect(await daysAt(OCM_B, CHANGE)).toEqual({ days: 3, source: "committed_schedule" });
    });
});
