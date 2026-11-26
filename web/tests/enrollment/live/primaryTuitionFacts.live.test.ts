/**
 * AN ENROLLED CHILD'S TUITION IS PRICED FROM THE PRIMARY ASSIGNMENT — proven against a live database.
 *
 * `readAssignmentPricingFacts` read "the committed schedule" as the latest-starting open
 * `schedule_assignments` row under the agreement. A committed SECONDARY (Before Care, Enrichment …)
 * carries the agreement too, so one that began after the primary supplied the days a week: a
 * five-day child with a later three-day secondary was priced, and re-priced, as three days. An
 * accepted five-day term then read as stale — not because the child's schedule changed, but because
 * a secondary was added.
 *
 * These cases build the scenario through the real writer (`createOperationalAssignment`) on the
 * shared certification stack and drive the real preview (`buildAssignmentTuitionView`) and accept
 * (`acceptEnrollmentPricingTerm`) paths.
 *
 * ISOLATION. Every row this file writes carries an id under `P` or hangs off its own customer
 * member, and teardown deletes exactly those. The representative tenant's own rows are only read.
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic.
 *
 * RUN IT ALONE, or apart from `enrollmentPricingTerms.live.test.ts`. A resolution key binds the
 * org-wide commercial configuration, and that suite re-authors rates in the same org; run in
 * parallel, an acceptance here meets a configuration that moved since its preview and is refused
 * as `stale_resolution` — correctly.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildAssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import { acceptEnrollmentPricingTerm, readAcceptedPricingTerms } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";

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
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const P = "ee6a0000-0000-4000-8000-";
const CATEGORY = `${P}0000000000c1`;
const PROGRAM_KEY = "cert_v6a_primary_program";
const ATTENDANCE = "cert_v6a_full_day";
const OFFERING = `${P}000000000001`;
const VAR_5 = `${P}00000000000a`;
const VAR_3 = `${P}00000000000b`;
const RATE_5 = `${P}0000000000f1`;
const RATE_3 = `${P}0000000000f2`;
const PATTERN_5 = `${P}0000000000d5`;
const PATTERN_3 = `${P}0000000000d3`;
const OCM = `${P}0000000000a1`;
const AGREEMENT = `${P}0000000000e1`;
const PLACEMENT = `${P}0000000000b1`;

const PRIMARY_START = "2026-09-01";
const SECONDARY_START = "2026-11-02";
const TODAY = "2026-10-22";

describe.skipIf(!env)("an enrolled child's tuition is priced from the primary assignment, live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    let memberId = "";
    let siteId = "";
    let secondaryTypeId: string | null = null;

    async function cleanup() {
        await db.from("enrollment_pricing_terms").delete().eq("org_id", ORG).eq("opportunity_customer_member_id", OCM);
        if (memberId) await db.from("schedule_assignments").delete().eq("org_id", ORG).eq("customer_member_id", memberId);
        await db.from("child_placements").delete().eq("id", PLACEMENT);
        await db.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);
        await db.from("opportunity_customer_members").delete().eq("id", OCM);
        if (memberId) await db.from("customer_members").delete().eq("id", memberId);
        await db.from("schedule_patterns").delete().in("id", [PATTERN_5, PATTERN_3]);
        await db.from("commercial_tuition_rates").delete().in("id", [RATE_5, RATE_3]);
        await db.from("program_offering_variants").delete().in("id", [VAR_5, VAR_3]);
        await db.from("program_offerings").delete().eq("id", OFFERING);
        await db.from("location_program_categories").delete().eq("id", CATEGORY);
    }

    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    beforeAll(async () => {
        await cleanup();
        const { data: sites } = await db.from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(1);
        siteId = (sites![0] as { id: string }).id;
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        const customerId = (customers![0] as { id: string }).id;
        const { data: types } = await db.from("operational_assignment_types").select("id, subject_types").eq("org_id", ORG);
        secondaryTypeId =
            ((types ?? []) as Array<{ id: string; subject_types: string[] | null }>).find((t) => (t.subject_types ?? []).includes("child"))?.id ?? null;

        const member = await db
            .from("customer_members")
            .insert({ org_id: ORG, customer_id: customerId, display_name: `v6a primary tuition fixture ${crypto.randomUUID().slice(0, 8)}` })
            .select("id")
            .single();
        ok(member);
        memberId = (member.data as { id: string }).id;

        // A program of this file's own, priced at five and at three days — so the price says which
        // assignment supplied the days.
        ok(await db.from("location_program_categories").insert({ id: CATEGORY, org_id: ORG, location_id: siteId, key: PROGRAM_KEY, label: "V6-A primary tuition program", is_active: true }));
        ok(await db.from("program_offerings").insert({ id: OFFERING, org_id: ORG, program_key: PROGRAM_KEY, label: "Full day", attendance_type: ATTENDANCE }));
        ok(
            await db.from("program_offering_variants").insert([
                { id: VAR_5, org_id: ORG, offering_id: OFFERING, label: "5 days/week", quantity_type: "days", quantity_value: 5 },
                { id: VAR_3, org_id: ORG, offering_id: OFFERING, label: "3 days/week", quantity_type: "days", quantity_value: 3 },
            ]),
        );
        ok(
            await db.from("commercial_tuition_rates").insert([
                { id: RATE_5, org_id: ORG, variant_id: VAR_5, cadence_key: "monthly", rate_cents: 120_000, payer_type: "private_pay", is_active: true, not_offered: false, location_id: null },
                { id: RATE_3, org_id: ORG, variant_id: VAR_3, cadence_key: "monthly", rate_cents: 78_000, payer_type: "private_pay", is_active: true, not_offered: false, location_id: null },
            ]),
        );
        ok(
            await db.from("schedule_patterns").insert([
                { id: PATTERN_5, org_id: ORG, site_location_id: siteId, key: "cert_v6a_five_day", label: "V6-A five days", schedule_type_key: ATTENDANCE, weekdays: [1, 2, 3, 4, 5] },
                { id: PATTERN_3, org_id: ORG, site_location_id: siteId, key: "cert_v6a_three_day", label: "V6-A three days", schedule_type_key: ATTENDANCE, weekdays: [1, 3, 5] },
            ]),
        );

        // The enrolment: assignment → agreement → placement, as enrollment materialises it.
        ok(await db.from("opportunity_customer_members").insert({ id: OCM, org_id: ORG, customer_member_id: memberId, program_category_id: CATEGORY, location_id: siteId }));
        ok(
            await db.from("child_enrollment_agreements").insert({
                id: AGREEMENT, org_id: ORG, customer_member_id: memberId, customer_id: customerId, site_location_id: siteId,
                opportunity_customer_member_id: OCM, status: "active", start_date: PRIMARY_START,
            }),
        );
        ok(
            await db.from("child_placements").insert({
                id: PLACEMENT, org_id: ORG, customer_member_id: memberId, enrollment_agreement_id: AGREEMENT, site_location_id: siteId,
                program_category_id: CATEGORY, start_date: PRIMARY_START, status: "active",
            }),
        );

        // The committed five-day PRIMARY, through the real writer.
        await createOperationalAssignment(db, {
            orgId: ORG,
            subject: { type: "child", enrollmentAgreementId: AGREEMENT },
            schedulePatternId: PATTERN_5,
            startDate: PRIMARY_START,
            isPrimary: true,
            actorUserId: ACTOR,
            todayYmd: TODAY,
        });
    }, 60_000);

    afterAll(async () => {
        await cleanup();
    });

    const view = () =>
        buildAssignmentTuitionView(db, { orgId: ORG, opportunityCustomerMemberId: OCM, cadenceKey: "monthly", asOf: TODAY });

    async function addSecondary() {
        // A committed three-day SECONDARY that begins AFTER the primary — Before Care in shape, but
        // nothing here names a category: the rule is primary-vs-secondary, not a service type.
        const row = await createOperationalAssignment(db, {
            orgId: ORG,
            subject: { type: "child", enrollmentAgreementId: AGREEMENT },
            schedulePatternId: PATTERN_3,
            startDate: SECONDARY_START,
            assignmentTypeId: secondaryTypeId,
            isPrimary: false,
            actorUserId: ACTOR,
            todayYmd: TODAY,
        });
        expect(row).toMatchObject({ is_primary: false, commitment_kind: "committed", enrollment_agreement_id: AGREEMENT });
        return row;
    }

    it("the primary alone prices at its own five days", async () => {
        const v = await view();
        expect(v).not.toBeNull();
        expect(v!.facts.daysPerWeek).toBe(5);
        expect(v!.factSources.daysPerWeek).toBe("committed_schedule");
        expect(v!.recommended?.amountCents).toBe(120_000);
    });

    it("an accepted primary term is not made stale, and not rewritten, by a later secondary", async () => {
        const before = await view();
        const accepted = await acceptEnrollmentPricingTerm(db, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: [],
            opportunityCustomerMemberId: OCM,
            resolutionKey: before!.resolutionKey,
            selectedSourceId: before!.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: TODAY,
        });
        expect(accepted.ok, accepted.ok ? "" : accepted.message).toBe(true);

        const secondary = await addSecondary();
        const { data: open } = await db
            .from("schedule_assignments")
            .select("id, is_primary, start_date")
            .eq("enrollment_agreement_id", AGREEMENT)
            .is("end_date", null)
            .order("start_date", { ascending: false });
        // The scenario under test: the latest-starting open row under the agreement is the secondary.
        expect((open ?? [])[0]).toMatchObject({ id: secondary.id, is_primary: false });

        const after = await view();
        expect(after!.facts.daysPerWeek, "the secondary's three days must not price the primary").toBe(5);
        expect(after!.factSources.daysPerWeek).toBe("committed_schedule");
        expect(after!.recommended?.amountCents).toBe(120_000);
        expect(after!.resolutionKey).toBe(before!.resolutionKey);
        expect(after!.acceptedIsStale).toBe(false);

        const terms = await readAcceptedPricingTerms(db, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(terms).toHaveLength(1);
        expect(terms[0]).toMatchObject({ amountCents: 120_000, source: { id: RATE_5 } });
    });

    it("a new acceptance after the secondary exists still records the primary's five days", async () => {
        await db.from("enrollment_pricing_terms").delete().eq("org_id", ORG).eq("opportunity_customer_member_id", OCM);
        const v = await view();
        const accepted = await acceptEnrollmentPricingTerm(db, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: [],
            opportunityCustomerMemberId: OCM,
            resolutionKey: v!.resolutionKey,
            selectedSourceId: v!.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: TODAY,
        });
        expect(accepted.ok, accepted.ok ? "" : accepted.message).toBe(true);
        if (!accepted.ok) return;
        expect(accepted.term).toMatchObject({ amount_cents: 120_000, source_id: RATE_5 });
        expect(accepted.term.resolved_facts).toMatchObject({ facts: { daysPerWeek: 5 }, fact_sources: { daysPerWeek: "committed_schedule" } });
    });
});
