/**
 * THE DRAFT-CHARGE SCHEDULE IS THE ENROLLMENT'S PRIMARY ASSIGNMENT — proven against a live database.
 *
 * `previewDraftChargeForAgreementPeriod` (and the write path built on it) chose "the active schedule
 * assignment" as the FIRST operational row the database returned for the agreement — no primary
 * filter, no order. A committed secondary (Before Care …) carries the agreement too, so whenever its
 * row came back first — e.g. the primary was replaced after Before Care already existed — a five-day
 * child was billed on the secondary's three-day basis.
 *
 * Everything here is READ-ONLY on the billing side: only the no-write preview is called, and the
 * last case asserts that no charge row exists for these agreements.
 *
 * ISOLATION. Every row carries an id under `P` or hangs off this file's own customer members; teardown
 * deletes exactly those. Skipped unless the cert stack is configured.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { previewDraftChargeForAgreementPeriod } from "@/lib/financials/chargeResolution/draftChargeResolutionService";
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
const P = "ee6b0000-0000-4000-8000-";
const CATEGORY = `${P}0000000000c1`;
const PLAN = `${P}0000000000a1`;
const RULE_5 = `${P}0000000000f5`;
const RULE_3 = `${P}0000000000f3`;
const PATTERN_5 = `${P}0000000000d5`;
const PATTERN_3 = `${P}0000000000d3`;
const AGREEMENT_A = `${P}0000000000e1`;
const AGREEMENT_B = `${P}0000000000e2`;
const PLACEMENT_A = `${P}0000000000b1`;
const PLACEMENT_B = `${P}0000000000b2`;
const OLD_PRIMARY = `${P}0000000000a0`;

const TODAY = "2026-10-22";
const PERIOD = { key: "2026-11", start: "2026-11-01", end: "2026-11-30" };

describe.skipIf(!env)("draft-charge schedule basis comes from the enrollment's primary, live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    const members: string[] = [];
    let siteId = "";
    let customerId = "";
    let secondaryTypeId: string | null = null;

    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    async function cleanup() {
        for (const m of members) await db.from("schedule_assignments").delete().eq("org_id", ORG).eq("customer_member_id", m);
        await db.from("schedule_assignments").delete().eq("id", OLD_PRIMARY);
        await db.from("child_placements").delete().in("id", [PLACEMENT_A, PLACEMENT_B]);
        await db.from("child_enrollment_agreements").delete().in("id", [AGREEMENT_A, AGREEMENT_B]);
        for (const m of members) await db.from("customer_members").delete().eq("id", m);
        await db.from("schedule_patterns").delete().in("id", [PATTERN_5, PATTERN_3]);
        await db.from("childcare_rate_rules").delete().in("id", [RULE_5, RULE_3]);
        await db.from("childcare_rate_plans").delete().eq("id", PLAN);
        await db.from("location_program_categories").delete().eq("id", CATEGORY);
    }

    async function enrolledChild(agreementId: string, placementId: string): Promise<string> {
        const member = await db
            .from("customer_members")
            .insert({ org_id: ORG, customer_id: customerId, display_name: `v6b draft charge fixture ${crypto.randomUUID().slice(0, 8)}` })
            .select("id")
            .single();
        ok(member);
        const memberId = (member.data as { id: string }).id;
        members.push(memberId);
        ok(await db.from("child_enrollment_agreements").insert({
            id: agreementId, org_id: ORG, customer_member_id: memberId, customer_id: customerId, site_location_id: siteId,
            status: "active", start_date: "2026-09-01",
        }));
        ok(await db.from("child_placements").insert({
            id: placementId, org_id: ORG, customer_member_id: memberId, enrollment_agreement_id: agreementId, site_location_id: siteId,
            program_category_id: CATEGORY, start_date: "2026-09-01", status: "active",
        }));
        return memberId;
    }

    const create = (agreementId: string, patternId: string, startDate: string, isPrimary: boolean) =>
        createOperationalAssignment(db, {
            orgId: ORG,
            subject: { type: "child", enrollmentAgreementId: agreementId },
            schedulePatternId: patternId,
            startDate,
            assignmentTypeId: isPrimary ? null : secondaryTypeId,
            isPrimary,
            actorUserId: ACTOR,
            todayYmd: TODAY,
        });

    const preview = (agreementId: string) =>
        previewDraftChargeForAgreementPeriod(db, { orgId: ORG, enrollmentAgreementId: agreementId, period: PERIOD, asOfDate: "2026-11-02" });

    beforeAll(async () => {
        await cleanup();
        const { data: sites } = await db.from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(1);
        siteId = (sites![0] as { id: string }).id;
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        customerId = (customers![0] as { id: string }).id;
        const { data: types } = await db.from("operational_assignment_types").select("id, subject_types").eq("org_id", ORG);
        secondaryTypeId =
            ((types ?? []) as Array<{ id: string; subject_types: string[] | null }>).find((t) => (t.subject_types ?? []).includes("child"))?.id ?? null;

        // A program of this file's own, rated by this file's own program-scoped plan: five days and three
        // days carry different amounts, so the resolved rule says which assignment supplied the basis.
        ok(await db.from("location_program_categories").insert({ id: CATEGORY, org_id: ORG, location_id: siteId, key: "cert_v6b_program", label: "V6-B draft charge program", is_active: true }));
        ok(await db.from("childcare_rate_plans").insert({
            id: PLAN, org_id: ORG, scope_type: "program", program_category_id: CATEGORY,
            plan_key: "cert_v6b_plan", label: "V6-B plan", billing_basis: "monthly", calculation_strategy: "scheduled", effective_start: "2026-01-01",
        }));
        ok(await db.from("childcare_rate_rules").insert([
            { id: RULE_5, org_id: ORG, rate_plan_id: PLAN, schedule_basis: "five_day", rate_basis: "monthly", amount_cents: 120_000, effective_start: "2026-01-01" },
            { id: RULE_3, org_id: ORG, rate_plan_id: PLAN, schedule_basis: "three_day", rate_basis: "monthly", amount_cents: 78_000, effective_start: "2026-01-01" },
        ]));
        ok(await db.from("schedule_patterns").insert([
            { id: PATTERN_5, org_id: ORG, site_location_id: siteId, key: "cert_v6b_five_day", label: "V6-B five days", schedule_type_key: "cert_v6b_attendance", weekdays: [1, 2, 3, 4, 5] },
            { id: PATTERN_3, org_id: ORG, site_location_id: siteId, key: "cert_v6b_three_day", label: "V6-B three days", schedule_type_key: "cert_v6b_attendance", weekdays: [1, 3, 5] },
        ]));
    }, 60_000);

    afterAll(async () => {
        await cleanup();
    });

    it("a secondary whose row is OLDER than the primary's does not supply the billing basis", async () => {
        const memberId = await enrolledChild(AGREEMENT_A, PLACEMENT_A);
        // History first: a superseded former primary, closed before the period — never a candidate.
        ok(await db.from("schedule_assignments").insert({
            id: OLD_PRIMARY, org_id: ORG, subject_type: "child", enrollment_agreement_id: AGREEMENT_A, customer_member_id: memberId,
            site_location_id: siteId, is_primary: true, commitment_kind: "committed", schedule_pattern_id: PATTERN_3,
            start_date: "2026-09-01", end_date: "2026-09-30", status: "superseded", assignment_kind: "base", source_key: "operator",
        }));
        // Before Care was committed before the current primary row was written (the shape a primary
        // change after Before Care produces), and it also starts later than the primary.
        const secondary = await create(AGREEMENT_A, PATTERN_3, "2026-10-15", false);
        const primary = await create(AGREEMENT_A, PATTERN_5, "2026-10-01", true);
        const { data: order } = await db.from("schedule_assignments").select("id").eq("enrollment_agreement_id", AGREEMENT_A);
        const ids = ((order ?? []) as Array<{ id: string }>).map((r) => r.id);
        // The scenario under test: unordered, the secondary is returned before the primary.
        expect(ids.indexOf(secondary.id)).toBeLessThan(ids.indexOf(primary.id));

        const v = await preview(AGREEMENT_A);
        expect(v.status, v.status === "unresolved" ? v.reason : "").toBe("resolved");
        if (v.status !== "resolved") return;
        expect(v.scheduleBasis, "the secondary's three days must not bill the primary").toBe("five_day");
        expect(v.rate.resolved && v.rate.rule.id).toBe(RULE_5);
    });

    it("a child with no primary is explicitly unresolved, never priced from a secondary", async () => {
        await enrolledChild(AGREEMENT_B, PLACEMENT_B);
        await create(AGREEMENT_B, PATTERN_3, "2026-10-15", false);
        const v = await preview(AGREEMENT_B);
        expect(v).toEqual({ status: "unresolved", reason: "no_schedule_assignment" });
    });

    it("previewing wrote no charge", async () => {
        const { data } = await db.from("charges").select("id").in("billable_source_id", [AGREEMENT_A, AGREEMENT_B]);
        expect(data ?? []).toEqual([]);
    });
});
