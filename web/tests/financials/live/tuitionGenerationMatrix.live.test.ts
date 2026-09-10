/**
 * TUITION GENERATION — THE CERTIFICATION MATRIX, against the real database.
 *
 * The vertical slice (tuitionGeneration.live.test.ts) proves the happy path and the two lineage
 * invariants. This file proves the edges, and most of them are edges where the honest answer is
 * "no" — a future term that must not bill early, an ended one that must not bill late, a part month
 * nobody has decided the price of, two terms the configuration cannot choose between, an assignment
 * that has been priced but has not enrolled.
 *
 * Concurrency is asserted on PERSISTED COUNTS, not on what the two calls returned: two runs can both
 * answer "generated" truthfully while converging on one row, and the row is what matters.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { tuitionOccurrenceKey } from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";

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

import { runHex, runPeriodKey } from "./certificationPeriod";

/** This run's own billing month and fixture ids — see `certificationPeriod`. */
const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const P = "78000000-0000-4000-8000-";
const AGREEMENT = `${P}00000000a001`;
const TERM = `${P}00000000b001`;
const TERM_B = `${P}00000000b002`;
const CALENDAR = `${P}00000000c001`;

describeLive("tuition generation — the certification matrix, live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let ocmId = "";
    let unenrolledOcmId = "";
    let customerMemberId = "";
    let unenrolledMemberId = "";
    let locationId: string | null = null;
    let rateId = "";

    async function clearTerms() {
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG);
    }

    async function clearLineage() {
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
        await supabase
            .from("charges")
            .delete()
            .eq("org_id", ORG)
            .eq("charge_category", "tuition")
            .eq("status", "draft");
    }

    async function acceptTerm(id: string, amountCents: number, over: Record<string, unknown> = {}) {
        const { error } = await supabase.from("enrollment_pricing_terms").insert({
            id,
            org_id: ORG,
            opportunity_customer_member_id: ocmId,
            customer_member_id: customerMemberId,
            enrollment_agreement_id: AGREEMENT,
            term_kind: "tuition",
            source_entity: "commercial_tuition_rates",
            source_id: rateId,
            recommended_source_id: rateId,
            location_id: locationId,
            cadence_key: "monthly",
            payer_type: "private_pay",
            amount_cents: amountCents,
            currency_code: "USD",
            state: "accepted",
            resolution_key: `matrix-${id}`,
            effective_start: "2026-01-01",
            accepted_by: ACTOR,
            ...over,
        });
        expect(error, error?.message).toBeNull();
    }

    async function run(periodKey: string, scope: string[] = [ocmId]) {
        return generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: scope,
            today: `${periodKey}-01`,
        });
    }

    async function chargesOn(serviceDate: string) {
        const { data } = await supabase
            .from("charges")
            .select("id, status, amount_cents, service_date")
            .eq("org_id", ORG)
            .eq("charge_category", "tuition")
            .eq("service_date", serviceDate);
        return (data ?? []) as Array<Record<string, unknown>>;
    }

    beforeAll(async () => {
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select("id, customer_member_id, location_id")
            .eq("org_id", ORG)
            .eq("schedule_type", "full_time")
            .limit(2);
        const rows = (ocmRows ?? []) as Array<Record<string, string>>;
        expect(rows.length, "two representative assignments are needed").toBeGreaterThanOrEqual(2);
        ocmId = rows[0]!.id;
        customerMemberId = rows[0]!.customer_member_id;
        locationId = rows[0]!.location_id ?? null;
        unenrolledOcmId = rows[1]!.id;
        unenrolledMemberId = rows[1]!.customer_member_id;

        const { data: rate } = await supabase
            .from("commercial_tuition_rates").select("id").eq("org_id", ORG).limit(1).maybeSingle();
        rateId = (rate as { id: string }).id;

        await clearTerms();
        await clearLineage();
        await supabase.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);

        const { data: member } = await supabase
            .from("customer_members").select("customer_id").eq("id", customerMemberId).maybeSingle();
        const { data: site } = await supabase.from("locations").select("id").eq("org_id", ORG).limit(1);
        const { error } = await supabase.from("child_enrollment_agreements").insert({
            id: AGREEMENT,
            org_id: ORG,
            customer_member_id: customerMemberId,
            customer_id: (member as { customer_id: string }).customer_id,
            site_location_id: ((site ?? [])[0] as { id: string }).id,
            opportunity_customer_member_id: ocmId,
            status: "active",
            start_date: "2026-01-01",
        });
        expect(error, error?.message).toBeNull();
    }, 60_000);

    afterAll(async () => {
        if (process.env.CERT_KEEP === "1") return;
        await clearTerms();
        await clearLineage();
        // The accounting calendar is LEFT STANDING: a posted journal entry references its period by
        // a RESTRICT foreign key, and removing it would mean asking the database to break the rule
        // this thread depends on. The harness clears posted money on the way in instead.
        await supabase.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);
        await supabase.from("financial_policies").delete().eq("org_id", ORG).eq("policy_type", "proration");
    });

    // ── EFFECTIVE DATING ─────────────────────────────────────────────────────────────────────

    it("an effective-dated successor bills its own periods, and the predecessor bills its own", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000, { effective_start: "2026-01-01", effective_end: "2027-01-31" });
        await acceptTerm(TERM_B, 150_000, { effective_start: "2027-02-01" });

        const january = await run("2027-01");
        const february = await run("2027-02");
        expect(january.counts.generated, JSON.stringify(january.outcomes)).toBe(1);
        expect(february.counts.generated, JSON.stringify(february.outcomes)).toBe(1);
        expect(january.outcomes[0]!.kind === "generated" && january.outcomes[0]!.amountCents).toBe(121_000);
        expect(february.outcomes[0]!.kind === "generated" && february.outcomes[0]!.amountCents).toBe(150_000);
        // Two distinct occurrences, two distinct charges.
        expect(await chargesOn("2027-01-01")).toHaveLength(1);
        expect(await chargesOn("2027-02-01")).toHaveLength(1);
    }, 120_000);

    it("a FUTURE term does not bill early", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000, { effective_start: "2027-06-01" });
        const early = await run("2027-05");
        expect(early.counts.generated).toBe(0);
        expect(early.outcomes[0]).toMatchObject({ kind: "not_due", reason: "term_not_yet_effective" });
        expect(await chargesOn("2027-05-01")).toHaveLength(0);
    }, 120_000);

    it("an ENDED term does not bill late", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000, { effective_start: "2026-01-01", effective_end: "2027-03-31" });
        const late = await run("2027-04");
        expect(late.counts.generated).toBe(0);
        expect(late.outcomes[0]).toMatchObject({ kind: "not_due", reason: "term_already_ended" });
        expect(await chargesOn("2027-04-01")).toHaveLength(0);
    }, 120_000);

    /*
     * A PRICED BUT UNENROLLED ASSIGNMENT is told apart from an unpriced one. Recurring tuition bills
     * against the enrolment agreement; a pre-enrolment fee is Add Charge's job.
     */
    it("a priced but pre-enrolment assignment is not billed, and says why", async () => {
        await clearTerms();
        await clearLineage();
        const { error } = await supabase.from("enrollment_pricing_terms").insert({
            id: `${P}00000000b009`,
            org_id: ORG,
            opportunity_customer_member_id: unenrolledOcmId,
            customer_member_id: unenrolledMemberId,
            enrollment_agreement_id: null,
            term_kind: "tuition",
            source_entity: "commercial_tuition_rates",
            source_id: rateId,
            cadence_key: "monthly",
            amount_cents: 168_000,
            currency_code: "USD",
            state: "accepted",
            resolution_key: "matrix-unenrolled",
            effective_start: "2026-01-01",
            accepted_by: ACTOR,
        });
        expect(error, error?.message).toBeNull();

        const result = await run("2027-05", [unenrolledOcmId]);
        expect(result.counts.generated).toBe(0);
        expect(result.outcomes[0]).toMatchObject({ kind: "not_due", reason: "assignment_not_enrolled" });
    }, 120_000);

    // ── PRORATION: A CONFIGURED METHOD, AND THE REFUSAL WITHOUT ONE ─────────────────────────

    it("refuses a partial period when no proration policy is configured", async () => {
        await clearTerms();
        await clearLineage();
        await supabase.from("financial_policies").delete().eq("org_id", ORG).eq("policy_type", "proration");
        await acceptTerm(TERM, 121_000, { effective_start: "2027-07-15" });

        const result = await run("2027-07");
        expect(result.counts.refused).toBe(1);
        expect(result.outcomes[0]).toMatchObject({ kind: "refused", reason: "proration_policy_required" });
        expect(result.outcomes[0]!.kind === "refused" && result.outcomes[0]!.detail).toContain("17 of 31 days");
        // The charge would have been dated to the PERIOD start — the month being billed — not to the
        // day the term happened to begin. Nothing is billed at all while the policy is undecided.
        expect(await chargesOn("2027-07-01"), "nothing is billed while the policy is undecided").toHaveLength(0);
    }, 120_000);

    it("bills a partial period once a proration policy IS configured", async () => {
        await clearTerms();
        await clearLineage();
        const { error } = await supabase.from("financial_policies").insert({
            org_id: ORG,
            scope_type: "org",
            policy_type: "proration",
            value: { method: "daily" },
            is_active: true,
            effective_start: "2026-01-01",
        });
        expect(error, error?.message).toBeNull();
        await acceptTerm(TERM, 121_000, { effective_start: "2027-07-15" });

        const result = await run("2027-07");
        expect(result.counts.refused, JSON.stringify(result.outcomes)).toBe(0);
        expect(result.counts.generated).toBe(1);
        // The charge covers the PERIOD, so it is dated to the period start; the occurrence records
        // the day the term began. Two different dates for two different facts.
        expect(await chargesOn("2027-07-01")).toHaveLength(1);
        const { data: events } = await supabase
            .from("consumption_events").select("occurs_on")
            .eq("org_id", ORG).eq("idempotency_key", tuitionOccurrenceKey(ocmId, "2027-07"));
        // Everything about a recurring tuition occurrence is anchored to the PERIOD it bills — the
        // event, the obligation and the charge all agree on the period start, so nothing downstream
        // has to reconcile two dates for one month. The coverage that made it partial is carried as
        // the proration inputs, not as a second date.
        expect((events ?? [])[0]!.occurs_on, "the occurrence is anchored to the period").toBe("2027-07-01");

        await supabase.from("financial_policies").delete().eq("org_id", ORG).eq("policy_type", "proration");
    }, 120_000);

    // ── AMBIGUITY ────────────────────────────────────────────────────────────────────────────

    it("refuses rather than double-billing when two terms cover one period", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000, { effective_start: "2026-01-01" });
        await acceptTerm(TERM_B, 150_000, { effective_start: "2027-08-10" });

        const result = await run("2027-08");
        expect(result.counts.refused).toBe(1);
        expect(result.outcomes[0]).toMatchObject({ kind: "refused", reason: "overlapping_terms" });
        expect(await chargesOn("2027-08-01"), "an ambiguous month bills nothing").toHaveLength(0);
    }, 120_000);

    // ── CONVERGENCE: RETRY, OVERLAPPING WINDOWS, CONCURRENCY ────────────────────────────────

    it("overlapping generation windows converge on one charge", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000);

        // Three runs over the same period, as three overlapping windows would produce.
        const a = await run("2027-09");
        const b = await run("2027-09");
        const c = await run("2027-09");
        for (const r of [a, b, c]) expect(r.counts.generated).toBe(1);
        const ids = new Set([a, b, c].map((r) => (r.outcomes[0]!.kind === "generated" ? r.outcomes[0]!.chargeId : null)));
        expect(ids.size, "every window found the same charge").toBe(1);
        expect(await chargesOn("2027-09-01")).toHaveLength(1);
    }, 120_000);

    /*
     * CONCURRENCY IS ASSERTED ON THE PERSISTED ROWS. Both callers may truthfully answer "generated";
     * what must be true is that ONE event, ONE obligation and ONE charge exist afterwards, and that
     * is the database's unique index doing it, not an application pre-check.
     */
    it("concurrent identical runs leave exactly one event, one obligation and one charge", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000);
        const PERIOD = "2027-10";

        await Promise.all([run(PERIOD), run(PERIOD), run(PERIOD), run(PERIOD)]);

        const { data: events } = await supabase
            .from("consumption_events").select("id")
            .eq("org_id", ORG).eq("idempotency_key", tuitionOccurrenceKey(ocmId, PERIOD));
        expect(events ?? [], "one occurrence").toHaveLength(1);
        const { data: obls } = await supabase
            .from("resolved_obligations").select("id")
            .eq("org_id", ORG).eq("consumption_event_id", (events ?? [])[0]!.id as string);
        expect(obls ?? [], "one obligation").toHaveLength(1);
        expect(await chargesOn("2027-10-01"), "one charge").toHaveLength(1);
    }, 180_000);

    /*
     * AND THE GUARANTEE ITSELF, DETERMINISTICALLY.
     *
     * The case above is a race, so a green run is weak evidence — it can pass with the protection
     * removed. What the protection actually IS can be stated exactly: the database refuses a second
     * charge carrying a resolution key another charge in the same billable source already holds.
     * Asserting that directly is what makes the concurrency case above mean something.
     */
    it("the database refuses a second charge with the same resolution key in the same source", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000);
        await run("2027-11");
        const [existing] = await chargesOn("2027-11-01");
        expect(existing, "the run must have written the charge being duplicated").toBeTruthy();

        const { data: row } = await supabase
            .from("charges")
            .select("billable_source_type, billable_source_id, metadata, currency_code, charge_template_id")
            .eq("org_id", ORG).eq("id", (existing as { id: string }).id).single();
        const source = row as {
            billable_source_type: string;
            billable_source_id: string;
            metadata: Record<string, unknown>;
            currency_code: string;
            charge_template_id: string | null;
        };

        // The same key, the same source — a different amount and date, so nothing but the key can
        // be what the database objects to.
        const { error } = await supabase.from("charges").insert({
            org_id: ORG,
            billable_source_type: source.billable_source_type,
            billable_source_id: source.billable_source_id,
            charge_type: "fee",
            charge_category: "tuition",
            status: "draft",
            currency_code: source.currency_code,
            amount_cents: 999,
            service_date: "2027-11-15",
            occurs_on: "2027-11-15",
            billable_on: "2027-11-15",
            charge_template_id: source.charge_template_id,
            description: "duplicate resolution key",
            metadata: { resolution_key: source.metadata.resolution_key },
        });
        expect(error, "a duplicate resolution key must be refused").toBeTruthy();
        expect(error!.code, "and refused as a uniqueness violation").toBe("23505");
        expect(await chargesOn("2027-11-01"), "the original stands alone").toHaveLength(1);
    }, 120_000);

    // ── SCOPE AND IDENTITY ───────────────────────────────────────────────────────────────────

    it("generates nothing for another organisation's terms", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000);
        // The same period, asked for a DIFFERENT org: this org's terms are invisible to it.
        const other = await generateTuitionCharges(supabase, {
            orgId: OTHER_ORG,
            periodKey: "2027-11",
            actorUserId: ACTOR,
            today: "2027-11-01",
        });
        expect(other.counts.generated, "another org sees none of these terms").toBe(0);
        expect(other.outcomes).toHaveLength(0);
        expect(await chargesOn("2027-11-01")).toHaveLength(0);
    }, 120_000);

    it("generates nothing for an assignment outside the requested scope", async () => {
        await clearTerms();
        await clearLineage();
        await acceptTerm(TERM, 121_000);
        const mismatched = await run("2027-12", [unenrolledOcmId]);
        expect(mismatched.counts.generated).toBe(0);
        expect(mismatched.outcomes, "a scope naming another assignment matches nothing").toHaveLength(0);
        expect(await chargesOn("2027-12-01")).toHaveLength(0);
    }, 120_000);

    it("refuses a period that is not a period", async () => {
        await expect(
            generateTuitionCharges(supabase, { orgId: ORG, periodKey: "not-a-period", actorUserId: ACTOR }),
        ).rejects.toThrow("period_key must be YYYY-MM");
    });

    // ── 4/4/5 ACCOUNTING ATTRIBUTION ─────────────────────────────────────────────────────────

    /*
     * MONTHLY BILLING AND 4/4/5 ACCOUNTING ARE DIFFERENT CALENDARS, and the charge belongs to both.
     * Its BILLING period is the customer's month; its ACCOUNTING period is whichever 4/4/5 period
     * contains the billable date. Thread 5 owns the attribution; this proves generation feeds it.
     */
    it("a generated charge attributes to the 4/4/5 accounting period, not to its billing month", async () => {
        await clearTerms();
        await clearLineage();
        /*
         * Upserted rather than recreated. A journal entry references its accounting period by a
         * RESTRICT foreign key, so once a run has posted through this calendar the period cannot be
         * deleted — which is the guarantee Thread 5 relies on, working. The fixture adapts to it.
         */
        /*
         * ONE ACTIVE CALENDAR PER ORG IS A REAL CONSTRAINT, so this authors its period into whichever
         * calendar the org already has rather than insisting on its own.
         *
         * Deactivating the incumbent was tried and was worse than the collision it fixed: Thread 5
         * records a journal entry only where an ACTIVE calendar's period contains the date, so
         * standing the org's calendar down silently stopped every later suite's money from reporting
         * anywhere. What this test needs is a 4/4/5 period that does not align with the billing
         * month; which calendar holds it was never the point.
         */
        const { data: activeCalendar } = await supabase
            .from("financial_accounting_calendars").select("id")
            .eq("org_id", ORG).eq("is_active", true).limit(1).maybeSingle();
        let calendarId = (activeCalendar as { id: string } | null)?.id ?? "";
        if (!calendarId) {
            const { error: calError } = await supabase.from("financial_accounting_calendars").upsert({
                id: CALENDAR,
                org_id: ORG,
                calendar_key: "matrix_445",
                name: "4/4/5 matrix calendar",
                period_style: "four_four_five",
                is_active: true,
            });
            expect(calError, calError?.message).toBeNull();
            calendarId = CALENDAR;
        }
        // A 4/4/5 period that deliberately does NOT align with the calendar month: it opens before
        // the billing month starts, so the attribution cannot have come from the month key.
        /*
         * The billing month is this run's own, and the 4/4/5 window is built around it — opening six
         * days BEFORE the month starts and closing inside it, which is the whole point: the billable
         * date falls in a period whose key cannot have been read off the month.
         *
         * A fixed month could only be billed once. The second run found the charge already posted
         * and generated nothing, which read as a Thread 7 regression and was a spent fixture.
         */
        const bill = runPeriodKey(11);
        const [billYear, billMonth] = bill.split("-").map(Number);
        const monthStart = new Date(Date.UTC(billYear!, billMonth! - 1, 1));
        const opens = new Date(monthStart); opens.setUTCDate(opens.getUTCDate() - 6);
        const closes = new Date(monthStart); closes.setUTCDate(closes.getUTCDate() + 21);
        const accountingKey = `FY-MATRIX-${bill}`;
        const { error: perError } = await supabase.from("financial_accounting_periods").upsert({
            id: `${P}${runHex()}d001`,
            org_id: ORG,
            calendar_id: calendarId,
            period_key: accountingKey,
            label: "Matrix period",
            starts_on: opens.toISOString().slice(0, 10),
            ends_on: closes.toISOString().slice(0, 10),
            status: "open",
        });
        expect(perError, perError?.message).toBeNull();

        await acceptTerm(TERM, 121_000);
        const result = await run(bill);
        expect(result.counts.generated, JSON.stringify(result.outcomes)).toBe(1);
        const chargeId = result.outcomes[0]!.kind === "generated" ? result.outcomes[0]!.chargeId! : "";

        await postChildcareCharge(supabase, { orgId: ORG, chargeId, actorUserId: ACTOR });

        const { data: entries } = await supabase
            .from("financial_journal_entries")
            .select("billing_period_key, accounting_period_key, accounting_calendar_id, amount_cents")
            .eq("org_id", ORG)
            .eq("source_id", chargeId);
        expect(entries ?? [], "posting writes one journal entry").toHaveLength(1);
        const entry = (entries ?? [])[0] as Record<string, unknown>;
        expect(entry.billing_period_key, "the customer's billing month").toBe(bill);
        expect(entry.accounting_period_key, "the 4/4/5 period the billable date falls in").toBe(accountingKey);
        expect(entry.accounting_calendar_id, "the calendar that period lives in").toBe(calendarId);
        expect(entry.amount_cents).toBe(121_000);
    }, 180_000);
});
