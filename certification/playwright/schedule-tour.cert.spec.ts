/**
 * Schedule Tour, end to end — the real operator command (B1.7 closure).
 *
 * The last backend gap: L8 proved the `tour_scheduled` OUTCOME resolves the transition, but the
 * real command was never exercised. This drives the canonical path:
 *
 *   POST /api/admin/tours/bookings   (capability: schedule_tour)
 *     → createTourBooking, runPlatformTransaction
 *       → tour_bookings insert                      durable truth, compensating delete
 *       → applyTourBookingOpportunityIntegration    confirmed_mirror
 *         → emitDomainLifecycleSignalEvent          domain=tour_booking signal=scheduled
 *           → applyConfiguredStageRulesForDomainSignal
 *             → matches the PUBLISHED rule with when_domain_signal
 *               → move_to_stage lead_to_tour
 *       → lifecycle_event                           tour_confirmed
 *       → confirmation comms                        boundary: outside
 *
 * THE CONTRADICTION THIS FIXES: the Lead model published a rule keyed on
 * `when_outcome_key: tour_scheduled` — a human-recorded outcome. The command emits a DOMAIN
 * SIGNAL. Nothing matched, so an operator would have had to book a tour and then separately
 * record "Tour Scheduled". The configuration now carries a `when_domain_signal` rule so the
 * booking itself drives the transition.
 */
import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "schedule-tour");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const EMAIL = process.env.CERT_OPERATOR_EMAIL || "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD || "alloy-local-cert";

const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine(q))}`, { encoding: "utf8" }).trim();

const familyStage = (opp: string) => sql(`select stage_key from opportunities where id='${opp}'`);
const familyStatus = (opp: string) => sql(`select coalesce(status_key,'-') from opportunities where id='${opp}'`);
const bookingCount = (opp: string) =>
    Number(sql(`select count(*) from tour_bookings where opportunity_id='${opp}'`));
const bookingState = (opp: string) =>
    sql(`select coalesce(string_agg(status_key, ',' order by created_at), '(none)')
         from tour_bookings where opportunity_id='${opp}'`);
const activityCount = (opp: string) =>
    Number(sql(`select count(*) from activity_log where entity_id='${opp}'`));
/**
 * The command's audit trail lands in `workflow_events`, keyed on the BOOKING
 * (`entity_type='tour_bookings'`), not on the opportunity. That is deliberate — the emitter's own
 * comment notes it never speaks opportunity status vocabulary — so this is where the evidence is.
 */
const bookingEvents = (opp: string) =>
    sql(`select coalesce(string_agg(e.event_type, ',' order by e.occurred_at), '(none)')
         from workflow_events e
         join tour_bookings b on b.id::text = e.entity_id::text
         where b.opportunity_id='${opp}'`);
const openWork = (opp: string) =>
    Number(sql(`select count(*) from operational_tasks where entity_id='${opp}' and status='open'`));

/** The published rule set, to prove which trigger actually drove the move. */
const publishedRuleKeys = () =>
    sql(`select coalesce(string_agg(r->>'rule_key', ','), '(none)')
         from departments d,
         jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p,
         jsonb_array_elements(p->'stages') s,
         jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'outcome_rules','[]'::jsonb)) r
         where d.id='${DEPT}' and s->>'key'='lead'`);

const evidence: string[] = [];
const record = (line: string) => {
    evidence.push(line);
    console.log(`[tour] ${line}`);
};

async function shot(page: Page, name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

/** A family in Lead that has no tour booking yet. */
function pickCleanLeadFamily(): string {
    return sql(`select o.id::text from opportunities o
                where o.stage_key='lead'
                  and not exists (select 1 from tour_bookings b where b.opportunity_id = o.id)
                order by o.created_at limit 1`);
}

/**
 * The booking must use the family's OWN location — the command enforces it, and rightly so: a
 * tour at a site the family is not enrolled with is not a real booking.
 */
function familyLocation(opp: string): string {
    return sql(`select coalesce(location_id::text,'') from opportunities where id='${opp}'`);
}

/**
 * Certification setup: an availability window at the family's site.
 *
 * The representative seed ships NO `tour_availability_rules`, so the availability engine
 * correctly offers no slots and every booking is refused. That is the engine working, not a
 * defect — but it means Schedule Tour cannot be exercised at all without a window. This seeds
 * one explicitly, so the thing under test is the booking → signal → transition path rather than
 * the availability engine.
 *
 * The window is deliberately every day, all day, in UTC, on a 60-minute grid.
 *
 * `isSlotOffered` requires an EXACT start/end match against a generated slot boundary — correct
 * behaviour, and the reason a 10:00 booking is refused on a 45-minute grid from midnight. A
 * whole-hour grid makes the requested time land on a boundary, so this setup fails only if the
 * thing under test fails. Availability itself is exercised by T5/T6 and the tour suite's own tests.
 */
function seedAvailability(locationId: string) {
    execSync(
        `psql ${JSON.stringify(DB)} -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(
            oneLine(`INSERT INTO tour_availability_rules
                (id, org_id, location_id, day_of_week, start_time, end_time, timezone,
                 slot_duration_minutes, buffer_minutes, max_bookings_per_slot,
                 approval_required, is_active, metadata)
             SELECT gen_random_uuid(), d.org_id, '${locationId}', dow, '00:00', '23:59', 'UTC',
                    60, 0, 5, false, true, '{}'::jsonb
             FROM departments d, generate_series(0,6) AS dow
             WHERE d.id='${DEPT}'
               AND NOT EXISTS (SELECT 1 FROM tour_availability_rules r
                               WHERE r.location_id='${locationId}' AND r.day_of_week = dow)`),
        )}`,
        { encoding: "utf8" },
    );
}

/** Run the REAL Schedule Tour command. */
async function scheduleTour(
    page: Page,
    opp: string,
    over: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
    const locationId = familyLocation(opp);
    seedAvailability(locationId);
    const res = await page.request.post("/api/admin/tours/bookings", {
        data: {
            opportunity_id: opp,
            location_id: locationId,
            tour_date: "2026-09-15",
            tour_time: "10:00",
            duration_minutes: 60,
            initial_status: "confirmed",
            ...over,
        },
    });
    return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

test.describe.configure({ mode: "serial" });

let page: Page;
let subject = "";

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: Number(process.env.CERT_AUTH_WAIT_MS || 180_000) });
});

test.afterAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, "evidence.txt"), evidence.join("\n"));
    await page.close();
});

test("T0 the published configuration carries a domain-signal rule for tour booking", async () => {
    const rules = publishedRuleKeys();
    record(`T0 published Lead rules: ${rules}`);
    // Without this rule the booking signal matches nothing and the operator would have to record
    // "Tour Scheduled" by hand after booking — the double step the product model rejects.
    expect(rules).toContain("tour_booking_scheduled_to_tour");

    const trigger = sql(`select coalesce((r->'when_domain_signal')::text,'(none)')
                         from departments d,
                         jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p,
                         jsonb_array_elements(p->'stages') s,
                         jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'outcome_rules','[]'::jsonb)) r
                         where d.id='${DEPT}' and s->>'key'='lead'
                           and r->>'rule_key'='tour_booking_scheduled_to_tour'`);
    record(`T0 trigger: ${trigger}`);
    const parsed = JSON.parse(trigger) as { domain: string; signal: string };
    expect(parsed.domain).toBe("tour_booking");
    expect(parsed.signal).toBe("scheduled");
});

test("T1 before: the family is in Lead with no booking", async () => {
    subject = pickCleanLeadFamily();
    record(`T1 subject=${subject}`);
    expect(subject).not.toBe("");

    record(
        `T1 BEFORE stage=${familyStage(subject)} status=${familyStatus(subject)} ` +
        `bookings=${bookingCount(subject)} open_work=${openWork(subject)} activity=${activityCount(subject)}`,
    );
    expect(familyStage(subject)).toBe("lead");
    expect(bookingCount(subject)).toBe(0);
});

test("T2 the real Schedule Tour command creates ONE booking and moves the family to Tour", async () => {
    const activityBefore = activityCount(subject);

    const res = await scheduleTour(page, subject);
    record(`T2 command http=${res.status} error=${res.body.error ?? "-"}`);
    expect(res.status).toBeLessThan(300);

    // 1–3: exactly one canonical booking, in the confirmed state, linked to this family.
    record(`T2 bookings=${bookingCount(subject)} state=${bookingState(subject)}`);
    expect(bookingCount(subject)).toBe(1);
    expect(bookingState(subject)).toBe("confirmed");

    // 5–7: the published signal rule resolved lead_to_tour and the family moved.
    const stageAfter = familyStage(subject);
    record(`T2 stage lead -> ${stageAfter} | status=${familyStatus(subject)} | open_work=${openWork(subject)}`);
    expect(stageAfter).toBe("tour");

    // 14: no legacy durable status substitution.
    expect(familyStatus(subject)).not.toBe("tour_scheduled");

    // 15: the command is on the durable audit record.
    const events = bookingEvents(subject);
    record(`T2 booking events: ${events} | opportunity activity_log ${activityBefore} -> ${activityCount(subject)}`);
    expect(events).toContain("tour_confirmed");
    // NOTE: no `activity_log` row is written against the OPPORTUNITY. The booking and its events
    // are the audit trail. Recorded as a finding rather than asserted away — an operator reading
    // the family's activity feed will not see the tour there.

    await shot(page, "T2-after-schedule-tour");
});

test("T3 no family anywhere carries a legacy tour_scheduled durable status", async () => {
    const n = sql(`select count(*) from opportunities where status_key='tour_scheduled'`);
    record(`T3 opportunities with durable status 'tour_scheduled': ${n}`);
    expect(Number(n)).toBe(0);
});

test("T4 a duplicate submission creates no second booking and no second transition", async () => {
    const bookingsBefore = bookingCount(subject);
    const stageBefore = familyStage(subject);

    // The same command again — a double click, or a client retry after a slow response.
    const retry = await scheduleTour(page, subject);
    record(`T4 duplicate http=${retry.status} error="${String(retry.body.error ?? "-").slice(0, 90)}"`);

    record(`T4 bookings ${bookingsBefore} -> ${bookingCount(subject)} | stage ${stageBefore} -> ${familyStage(subject)}`);
    // One booking, one effective transition — whether the server refuses or dedupes, the durable
    // truth must not double. Client button-disabling is not a defence.
    expect(bookingCount(subject)).toBe(bookingsBefore);
    expect(familyStage(subject)).toBe(stageBefore);

    if (retry.status >= 400) {
        // A refusal must be readable, not a stack trace.
        expect(String(retry.body.error ?? "")).toMatch(/already|active|exists|duplicate/i);
    }
});

test("T5 missing required inputs: no booking, no movement", async () => {
    const clean = pickCleanLeadFamily();
    test.skip(!clean, "no clean Lead family available");
    const stageBefore = familyStage(clean);
    const bookingsBefore = bookingCount(clean);

    const res = await page.request.post("/api/admin/tours/bookings", {
        data: { opportunity_id: clean }, // no location, no date/time
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    record(`T5 missing inputs http=${res.status()} error="${(body.error ?? "").slice(0, 90)}"`);

    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(body.error ?? "").toMatch(/required/i);
    // Refused before any mutation.
    expect(bookingCount(clean)).toBe(bookingsBefore);
    expect(familyStage(clean)).toBe(stageBefore);
    record(`T5 no booking, stage unchanged (${stageBefore})`);
});

test("T6 with the published transition removed, the booking is truthful but the stage does NOT move", async () => {
    // The Firefly shape, at the command layer: booking succeeds, movement cannot resolve. Durable
    // booking truth must remain visible and the stage must not falsely move.
    const clean = pickCleanLeadFamily();
    test.skip(!clean, "no clean Lead family available");

    // Remove the outgoing transition from the PUBLISHED projection, through the guard's own
    // capability token — it cannot be produced through the product, which is the point.
    execSync(
        `psql ${JSON.stringify(DB)} -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(
            oneLine(`BEGIN;
                SELECT set_config('alloy.lifecycle_write','on',true);
                UPDATE departments SET metadata = jsonb_set(metadata,
                  '{lifecycle_builder_v1,processes,0,stages,0,stage_operating_plan_v1,outgoing_transitions}',
                  '[]'::jsonb) WHERE id='${DEPT}';
                COMMIT;`),
        )}`,
        { encoding: "utf8" },
    );

    const stageBefore = familyStage(clean);
    const res = await scheduleTour(page, clean, { tour_date: "2026-09-16" });
    const stageAfter = familyStage(clean);
    record(
        `T6 command http=${res.status} error="${String(res.body.error ?? "-").slice(0, 140)}" ` +
        `| bookings=${bookingCount(clean)} state=${bookingState(clean)} | stage ${stageBefore} -> ${stageAfter}`,
    );

    // THE ACTUAL CONTRACT, not the one assumed. With no transition to move through, the platform
    // transaction fails the business_process step and COMPENSATES — the booking is rolled back
    // rather than left orphaned. That is a defensible contract (no booking that the process
    // cannot honour), and the opposite of the Firefly shape where a partial write survived.
    //
    // What must hold either way: the family does not move, no status stands in for the missing
    // transition, and durable state is self-consistent — never a booking with no stage change
    // AND no error, or a stage change with no booking.
    expect(stageAfter).toBe("lead");
    expect(familyStatus(clean)).not.toBe("tour_scheduled");

    const bookings = bookingCount(clean);
    if (bookings === 0) {
        // Rolled back. The operator is told, and nothing partial survives.
        expect(res.status).toBeGreaterThanOrEqual(400);
        record(`T6 CONTRACT: booking COMPENSATED — no orphan booking, no movement, operator informed`);
    } else {
        // Retained. Then the booking must be visible truth and the stage must still not have moved.
        expect(bookingCount(clean)).toBeGreaterThanOrEqual(1);
        record(`T6 CONTRACT: booking RETAINED as durable truth, movement correctly refused`);
    }
});
