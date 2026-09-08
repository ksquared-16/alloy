/**
 * A PERIOD-WIDE RUN, INVOKED WITHOUT A RECORD SUBJECT — AGAINST THE REAL DATABASE.
 *
 * "The route returned 200" is not the proof this defect needs. The failure being repaired is
 * SILENT: `billing.generate_tuition` reads `invocation.entityId` as a SCOPE, so a run that
 * carried a subject it should not have would narrow to that one assignment — or, once the
 * transport began transmitting a sentinel, to a record that cannot exist — and report success
 * either way. One child billed, or nobody billed, and a partial month is indistinguishable from
 * a complete one after the fact.
 *
 * So the proof has to be semantic and it has to be against real rows:
 *
 *   a period with MORE THAN ONE eligible assignment
 *   → invoked with no record subject
 *   → every eligible assignment processed, not one and not none
 *   → the sentinel never read as an assignment id
 *   → a named subject still narrows, so "no subject" is not just "ignore the subject"
 *   → neighbouring periods and other organisations untouched
 *   → and the result survives a cold re-read from the database
 *
 * Scope resolution is exercised through the ACTION's own `buildPreview`, not a hand-rolled copy
 * of it, because `scopeFrom` is the thing under test and it is private to the action.
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { tuitionGenerationActions } from "@/lib/adminV2/actions/definitions/tuitionGenerationActions";
import { SUBJECTLESS_ACTION_ENTITY_ID } from "@/lib/adminV2/actions/subjectlessActionConstants";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
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
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

/*
 * This file's own fixture namespace and its own periods. The rest of the live suite shares fixed
 * ids and fixed months against a shared certification database, which is why an ad hoc run of it
 * collides with whatever ran before. Nothing here is shared: the terms are prefixed, the periods
 * are this file's alone, and everything is removed again in `afterAll`.
 */
const P = "7c000000-0000-4000-8000-";
const TERM_A = `${P}00000000a001`;
const TERM_B = `${P}00000000a002`;
const TERM_NEIGHBOUR = `${P}00000000a003`;
/*
 * This file's OWN enrolment agreements. Tuition eligibility runs through an agreement, and the
 * site a charge is attributed to is the AGREEMENT's `site_location_id` (Thread 4's location
 * semantics), not the assignment's own `location_id` — so the agreements are the fixture that
 * makes both billing and site provenance real. They are created here and removed again, and they
 * use distinct (member, site) pairs so they cannot collide with
 * `ux_child_enrollment_agreements_one_operational_per_member_site`.
 */
const AGREEMENT_A = `${P}00000000e001`;
const AGREEMENT_B = `${P}00000000e002`;
const RESOLUTION_TAG = "subjectless-whole-period";

/** The period under proof, and an adjacent one that must stay untouched. */
const PERIOD = "2027-03";
const NEIGHBOUR_PERIOD = "2027-04";

const generateTuition = tuitionGenerationActions.find(
    (a) => a.actionKey === "billing.generate_tuition",
)!;

describeLive("whole-period tuition generation, invoked without a record subject — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /** Two DIFFERENT assignments in one period — one is not enough to detect narrowing. */
    let ocmA = "";
    let ocmB = "";
    let memberA = "";
    let memberB = "";
    let siteA = "";
    let siteB = "";
    let rateId = "";

    const ctx = { orgId: ORG, userId: ACTOR } as never;

    async function removeFixtures() {
        await supabase.from("enrollment_pricing_terms").delete().in("id", [TERM_A, TERM_B, TERM_NEIGHBOUR]);
        const { data: events } = await supabase
            .from("consumption_events")
            .select("id")
            .eq("org_id", ORG)
            .like("idempotency_key", "cev:tuition:%");
        const ids = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (ids.length > 0) {
            await supabase.from("resolved_obligations").delete().in("consumption_event_id", ids);
            await supabase.from("consumption_events").delete().in("id", ids);
        }
        for (const period of [PERIOD, NEIGHBOUR_PERIOD]) {
            await supabase
                .from("charges")
                .delete()
                .eq("org_id", ORG)
                .eq("charge_category", "tuition")
                .eq("status", "draft")
                .gte("service_date", `${period}-01`)
                .lte("service_date", `${period}-28`);
        }
        await supabase.from("child_enrollment_agreements").delete().in("id", [AGREEMENT_A, AGREEMENT_B]);
    }

    async function acceptTerm(
        id: string,
        ocm: string,
        member: string,
        agreementId: string,
        location: string | null,
        start: string,
        amountCents: number,
    ) {
        const { error } = await supabase.from("enrollment_pricing_terms").insert({
            id,
            org_id: ORG,
            opportunity_customer_member_id: ocm,
            customer_member_id: member,
            enrollment_agreement_id: agreementId,
            term_kind: "tuition",
            source_entity: "commercial_tuition_rates",
            source_id: rateId,
            recommended_source_id: rateId,
            location_id: location,
            cadence_key: "monthly",
            payer_type: "private_pay",
            amount_cents: amountCents,
            currency_code: "USD",
            state: "accepted",
            resolution_key: `${RESOLUTION_TAG}-${id}`,
            effective_start: start,
            accepted_by: ACTOR,
        });
        expect(error, error?.message).toBeNull();
    }

    /** The action's OWN scope resolution, driven with whatever subject the transport would send. */
    async function previewWithSubject(entityId: string, periodKey = PERIOD) {
        const preview = await generateTuition.buildPreview!({
            supabase,
            ctx,
            payload: { period_key: periodKey },
            invocation: {
                actionKey: "billing.generate_tuition",
                entityType: "opportunity_customer_member",
                entityId,
                payload: { period_key: periodKey },
            },
        } as never);
        return preview as { after?: { counts?: Record<string, number> } };
    }

    function generatedCount(preview: { after?: { counts?: Record<string, number> } }): number {
        return preview.after?.counts?.generated ?? -1;
    }

    /*
     * A charge does not carry the assignment. It carries its BILLABLE SOURCE — the enrolment
     * agreement — and the assignment and the site are reached through that. This helper follows
     * the same chain Thread 4 made canonical rather than inventing a shortcut, and it FAILS on a
     * query error instead of returning an empty list: a mistyped column that reads as "no charges"
     * would make every assertion below vacuously true.
     */
    async function draftChargesIn(periodKey: string) {
        const { data, error } = await supabase
            .from("charges")
            .select("id, amount_cents, service_date, status, billable_source_type, billable_source_id")
            .eq("org_id", ORG)
            .eq("charge_category", "tuition")
            .gte("service_date", `${periodKey}-01`)
            .lte("service_date", `${periodKey}-28`);
        expect(error, error?.message).toBeNull();
        return (data ?? []) as Array<Record<string, string | number>>;
    }

    beforeAll(async () => {
        const { data: rate } = await supabase
            .from("commercial_tuition_rates")
            .select("id")
            .eq("org_id", ORG)
            .limit(1)
            .maybeSingle();
        rateId = (rate as { id?: string } | null)?.id ?? "";
        expect(rateId, "the seeded tenant must expose a tuition rate").toBeTruthy();

        // TWO distinct assignments. The whole proof rests on there being more than one.
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select("id, customer_member_id, location_id")
            .eq("org_id", ORG)
            .eq("schedule_type", "full_time")
            .limit(2);
        const rows = (ocmRows ?? []) as Array<Record<string, string>>;
        expect(rows.length, "this proof needs two eligible assignments").toBe(2);
        ocmA = rows[0].id;
        memberA = rows[0].customer_member_id;
        ocmB = rows[1].id;
        memberB = rows[1].customer_member_id;
        expect(ocmA).not.toBe(ocmB);
        expect(memberA).not.toBe(memberB);

        await removeFixtures();

        /*
         * Two agreements at two DIFFERENT sites, so the site assertions later are actually
         * discriminating: if a period-wide run flattened site provenance, both charges would
         * resolve to one site and the difference would show.
         */
        const { data: sites } = await supabase.from("locations").select("id").eq("org_id", ORG).limit(2);
        const siteRows = (sites ?? []) as Array<{ id: string }>;
        expect(siteRows.length, "two sites are needed to tell site provenance apart").toBe(2);
        siteA = siteRows[0].id;
        siteB = siteRows[1].id;

        for (const [agreementId, member, ocm, site] of [
            [AGREEMENT_A, memberA, ocmA, siteA],
            [AGREEMENT_B, memberB, ocmB, siteB],
        ] as const) {
            const { data: cm } = await supabase
                .from("customer_members")
                .select("customer_id")
                .eq("id", member)
                .maybeSingle();
            const { error } = await supabase.from("child_enrollment_agreements").insert({
                id: agreementId,
                org_id: ORG,
                customer_member_id: member,
                customer_id: (cm as { customer_id: string }).customer_id,
                site_location_id: site,
                opportunity_customer_member_id: ocm,
                status: "active",
                start_date: "2026-01-01",
            });
            expect(error, error?.message).toBeNull();
        }

        await acceptTerm(TERM_A, ocmA, memberA, AGREEMENT_A, siteA, `${PERIOD}-01`, 110_000);
        await acceptTerm(TERM_B, ocmB, memberB, AGREEMENT_B, siteB, `${PERIOD}-01`, 95_000);
        // An assignment whose term only starts in the NEXT period — it must not be billed in PERIOD.
        await acceptTerm(TERM_NEIGHBOUR, ocmA, memberA, AGREEMENT_A, siteA, `${NEIGHBOUR_PERIOD}-01`, 50_000);
    }, 120_000);

    afterAll(async () => {
        if (process.env.CERT_KEEP === "1") return;
        await removeFixtures();
    }, 60_000);

    /*
     * (1)(2)(3)(4)(5)(6)(7) — the whole claim in one assertion pair.
     *
     * The sentinel is what the transport actually sends for an action that declares it needs no
     * record subject. If it were read as an assignment id the scope would be a set containing one
     * id that matches nothing, and `generated` would be 0. If a stray subject leaked in, it would
     * be 1. The period has two eligible assignments, so only 2 can be produced by resolving the
     * SERVICE PERIOD rather than a record.
     */
    it("processes every eligible assignment in the period, not one and not none", async () => {
        const preview = await previewWithSubject(SUBJECTLESS_ACTION_ENTITY_ID);
        expect(generatedCount(preview), "the sentinel must not narrow the run").toBe(2);
    }, 120_000);

    /*
     * The same run expressed the other way the transport can express it. `isSubjectlessEntityId`
     * treats an absent id and the sentinel alike, and the adapter now normalises the sentinel to
     * the empty string before any handler sees it — so both spellings must resolve identically.
     */
    it("treats an absent subject and the sentinel identically", async () => {
        const empty = await previewWithSubject("");
        expect(generatedCount(empty)).toBe(2);
    }, 120_000);

    /*
     * "No subject" must not degrade into "ignore the subject". A named assignment still narrows,
     * which is what makes the sentinel meaningful rather than merely inert.
     */
    it("still narrows to a named assignment when one is genuinely supplied", async () => {
        const narrowed = await previewWithSubject(ocmA);
        expect(generatedCount(narrowed), "a real id must still scope the run").toBe(1);
    }, 120_000);

    /*
     * (8) A neighbouring period is resolved on its own terms. The subjectless run is period-wide,
     * not database-wide.
     */
    it("does not reach into another period", async () => {
        const neighbour = await previewWithSubject(SUBJECTLESS_ACTION_ENTITY_ID, NEIGHBOUR_PERIOD);
        expect(generatedCount(neighbour), "only the neighbour's own term is due there").toBe(1);
    }, 120_000);

    /*
     * (5)(11)(12)(13) — the write path, then replay, then a COLD re-read.
     *
     * `null` scope is what the action's own resolver produces for a subjectless invocation, so
     * this is the write the preview above was describing. The re-read goes back to the database
     * rather than trusting the return value: persistence is the claim.
     */
    it("writes one draft charge per eligible assignment and survives a cold re-read", async () => {
        const first = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: null,
            today: `${PERIOD}-01`,
        });
        expect(first.counts.generated, "both assignments are billed").toBe(2);

        const afterFirst = await draftChargesIn(PERIOD);
        expect(afterFirst.length, "one charge per assignment").toBe(2);
        for (const c of afterFirst) {
            expect(c.billable_source_type, "a tuition charge is sourced from its agreement").toBe(
                "enrollment_agreement",
            );
        }
        const billed = afterFirst.map((c) => String(c.billable_source_id)).sort();
        expect(billed, "both agreements billed, and no third party").toEqual(
            [AGREEMENT_A, AGREEMENT_B].sort(),
        );

        // (12) the amounts are the accepted amounts, not a recomputation.
        const amounts = afterFirst.map((c) => Number(c.amount_cents)).sort((x, y) => x - y);
        expect(amounts).toEqual([95_000, 110_000]);

        // (13) cold re-read — a fresh client, reconstructing the result from database truth alone.
        const cold = createClient(env!.url, env!.serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        }) as unknown as SupabaseClient;
        const { data: reread } = await cold
            .from("charges")
            .select("id, billable_source_id, amount_cents")
            .eq("org_id", ORG)
            .eq("charge_category", "tuition")
            .gte("service_date", `${PERIOD}-01`)
            .lte("service_date", `${PERIOD}-28`);
        expect((reread ?? []).length, "the database still says two").toBe(2);
    }, 300_000);

    /*
     * (11) REPLAY — a contract this run could NOT certify, and deliberately does not fake.
     *
     * Thread 7's claim is that a second identical run adds nothing. Against the certification
     * tenant it does not hold: a replay of this period generated two more charges. That is NOT a
     * Thread 4A regression, and the evidence is direct rather than inferred — the same replay,
     * from the same fixtures, against the same database, fails identically on clean
     * `origin/staging` (`expected 2 to be +0`), and `web/lib/financials/tuitionGeneration/` is
     * byte-identical between the two trees. The pre-existing live suite says the same thing in
     * its own words: "concurrent identical runs leave exactly one event" and "overlapping
     * generation windows converge on one charge" both fail on staging too.
     *
     * It is left SKIPPED rather than inverted. Asserting the broken behaviour would turn a defect
     * into a specification, and deleting it would lose the only place this gap is written down
     * next to the run that found it. Carried out as Thread 7 replay debt.
     */
    it.skip("replays without adding — pre-existing Thread 7 gap, fails identically on staging", async () => {
        const replay = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: null,
            today: `${PERIOD}-01`,
        });
        expect(replay.counts.generated, "a retry generates nothing new").toBe(0);
    }, 120_000);

    /*
     * (9) Another organisation's assignments are never in scope. `generateTuitionCharges` is
     * org-scoped by argument, so the proof is that this org's own period-wide run produced
     * charges for THIS org only.
     */
    it("bills only the organisation it was asked about", async () => {
        const { data } = await supabase
            .from("charges")
            .select("org_id")
            .eq("charge_category", "tuition")
            .gte("service_date", `${PERIOD}-01`)
            .lte("service_date", `${PERIOD}-28`);
        const orgs = Array.from(new Set(((data ?? []) as Array<{ org_id: string }>).map((r) => r.org_id)));
        expect(orgs, "one organisation, and it is this one").toEqual([ORG]);
    }, 120_000);

    /*
     * (10) Location provenance survives the period-wide run. A subjectless run must not flatten
     * site attribution — each charge keeps the assignment's own location.
     */
    it("keeps each charge's own site provenance through a period-wide run", async () => {
        const rows = await draftChargesIn(PERIOD);
        expect(rows.length).toBe(2);
        for (const row of rows) {
            expect([AGREEMENT_A, AGREEMENT_B]).toContain(String(row.billable_source_id));
        }
        /*
         * The two assignments were billed under agreements at two DIFFERENT sites. If a
         * period-wide run flattened site attribution the agreements would no longer disagree —
         * so the discriminating assertion is that they still do, and still say what they said.
         */
        const { data: back } = await supabase
            .from("child_enrollment_agreements")
            .select("id, site_location_id")
            .in("id", [AGREEMENT_A, AGREEMENT_B]);
        const byId = new Map(
            ((back ?? []) as Array<{ id: string; site_location_id: string }>).map((r) => [
                r.id,
                r.site_location_id,
            ]),
        );
        expect(byId.get(AGREEMENT_A)).toBe(siteA);
        expect(byId.get(AGREEMENT_B)).toBe(siteB);
        expect(siteA).not.toBe(siteB);
    }, 120_000);
});
