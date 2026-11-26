/**
 * ASSIGNMENT AUTHORITY, MOUNTED — the verb is shared, the power is not.
 *
 * The Director ruling: assignment is an OPERATION PATTERN. Several products contain an action called
 * "assign" and that does not make them one authority, so there is no platform-wide
 * `assignments.manage`. This drives the two families that got truthful owners and proves the
 * separation with people rather than with source reading.
 *
 * THE COMMUNICATIONS SEPARATION IS THE LOAD-BEARING ONE. `decideCommunicationsSendScope` checks
 * assignment BEFORE site scope — an assigned thread returns `assigned_to_actor` — and the action
 * list includes `claim`, which assigns a thread to the ACTOR. Had assignment been folded into
 * `communications.send`, any site-restricted sender could claim any conversation in the organization
 * and answer it. So: a persona who can assign and cannot send, and a persona who can send and
 * cannot assign, both proven against the real route.
 *
 * THE JOBS NON-SEPARATION IS ALSO PROVEN. `ops.jobs.write` already permits setting
 * `assigned_vendor_id` through the job PATCH, so vendor assignment is an ordinary Job operation and
 * gets no key of its own. What must NOT work is `scheduling.write` — which owns WHEN a job happens
 * and has never owned WHO performs it.
 */
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const webDir = path.join(__dirname, "..", "..", "web");
const require_ = createRequire(path.join(webDir, "package.json"));
const { createClient } = require_("@supabase/supabase-js");
const envText = readFileSync(path.join(webDir, ".env.certification.local"), "utf8");
const readEnv = (k: string) =>
    envText.split("\n").find((l: string) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
const sb = createClient(
    readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
const PASSWORD = "alloy-local-cert";

/** Mirrored from `fixtures/access-personas.mjs`; the RL-11 lock keeps the two lists in step. */
const P = {
    assigner:   { email: "cert.commsassign@northwind.invalid",   id: "c0000000-0000-4000-8000-00000000d062" },
    sender:     { email: "cert.commssender@northwind.invalid",   id: "c0000000-0000-4000-8000-00000000d053" },
    full:       { email: "cert.commsfull@northwind.invalid",     id: "c0000000-0000-4000-8000-00000000d058" },
    titular:    { email: "cert.commstitular@northwind.invalid",  id: "c0000000-0000-4000-8000-00000000d059" },
    portalOnly: { email: "cert.commsportal@northwind.invalid",   id: "c0000000-0000-4000-8000-00000000d060" },
    jobber:     { email: "cert.sjjobber@northwind.invalid" },     // ops.jobs.write
    scheduler:  { email: "cert.sjscheduler@northwind.invalid" },  // scheduling.write ONLY
    otherOrg:   { email: "cert.otherorg@adapter.invalid" },       // admin of a DIFFERENT organization
} as const;

const THREAD = "c0ffee11-0000-4000-8000-00000000a551";
const FOREIGN_THREAD = "c0ffee11-0000-4000-8000-00000000a552";

async function signIn(browser: Browser, email: string) {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return { request: page.request as APIRequestContext, close: () => context.close() };
}

const assign = (r: APIRequestContext, thread: string, body: Record<string, unknown>) =>
    r.post(`/api/admin/communications/conversations/${thread}/assign`, { data: body });

/** Read the assignment straight out of Postgres — the API that wrote it cannot vouch for itself. */
async function assignedUser(thread: string): Promise<string | null> {
    const { data } = await sb.from("communication_threads").select("assigned_user_id").eq("id", thread).maybeSingle();
    return (data as { assigned_user_id?: string | null } | null)?.assigned_user_id ?? null;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
    // Two threads, one per organization, so cross-tenant assignment has something real to be refused on.
    await sb.from("communication_threads").upsert(
        [
            // `primary_entity_type` / `primary_entity_id` are NOT NULL: a thread is always a
            // conversation ABOUT something. The first draft omitted them, the upsert failed
            // silently, and the route answered "not found" — which read as a gate failure.
            { id: THREAD, org_id: ORG, channel: "email", primary_entity_type: "customers", primary_entity_id: THREAD, assignment_state: "unassigned", assigned_user_id: null },
            { id: FOREIGN_THREAD, org_id: OTHER_ORG, channel: "email", primary_entity_type: "customers", primary_entity_id: FOREIGN_THREAD, assignment_state: "unassigned", assigned_user_id: null },
        ],
        { onConflict: "id" }
    );
    const { count } = await sb
        .from("communication_threads")
        .select("id", { count: "exact", head: true })
        .in("id", [THREAD, FOREIGN_THREAD]);
    expect(count, "the assignment fixtures must exist, or every result below is a fixture failure wearing a gate's clothes").toBe(2);
});

test.afterAll(async () => {
    await sb.from("conversation_assignment_events").delete().in("thread_id", [THREAD, FOREIGN_THREAD]);
    await sb.from("communication_threads").delete().in("id", [THREAD, FOREIGN_THREAD]);
});

test.describe("Communications — assignment is its own authority", () => {
    test("the assigner can assign, and the thread really moves", async ({ browser }) => {
        /*
         * A 200 is not an effect. The assignment is read back with service credentials, which the
         * route cannot influence.
         */
        const s = await signIn(browser, P.assigner.email);
        const res = await assign(s.request, THREAD, { action: "assign", to_user_id: P.sender.id });
        expect(res.status(), await res.text()).toBeLessThan(400);
        expect(await assignedUser(THREAD)).toBe(P.sender.id);
        await s.close();
    });

    test("the assigner cannot send — routing the inbox is not answering it", async ({ browser }) => {
        const s = await signIn(browser, P.assigner.email);
        const res = await s.request.post("/api/admin/communications/send", { data: { probe: "assignment-cert" } });
        expect(res.status(), "assignment must not confer the ability to send").toBe(403);
        expect(await res.text()).toContain("communications.send");
        await s.close();
    });

    test("the sender cannot assign — and this is the escalation that closes", async ({ browser }) => {
        /*
         * THE WHOLE POINT. `claim` assigns a thread to the actor, and an assigned thread bypasses
         * site scope. If sending conferred assigning, this persona could hand themselves every
         * conversation in the organization and answer each one.
         */
        const before = await assignedUser(THREAD);
        const s = await signIn(browser, P.sender.email);
        const res = await assign(s.request, THREAD, { action: "claim" });
        expect(res.status()).toBe(403);
        expect(await res.text()).toContain("communications.assign");
        expect(await assignedUser(THREAD), "a refused claim must not have moved the thread").toBe(before);
        await s.close();
    });

    test("a job title confers nothing, and portal admission confers nothing", async ({ browser }) => {
        for (const who of [P.titular, P.portalOnly]) {
            const before = await assignedUser(THREAD);
            const s = await signIn(browser, who.email);
            const res = await assign(s.request, THREAD, { action: "claim" });
            expect(res.status(), `${who.email} must be refused`).toBe(403);
            expect(await assignedUser(THREAD)).toBe(before);
            await s.close();
        }
    });

    test("a feature flag is not the boundary any more", async ({ browser }) => {
        /*
         * This route's only effective boundary used to be `comms_v2_assignment`. The flag is enabled
         * in the certification environment precisely so the AUTHORITY can be exercised: if the flag
         * were still doing the work, every persona above would see 404 and the matrix would prove
         * nothing. A 403 that names the capability is the proof that authority, not availability, is
         * refusing.
         */
        const s = await signIn(browser, P.portalOnly.email);
        const res = await assign(s.request, THREAD, { action: "claim" });
        expect(res.status(), "404 here would mean the flag is still the boundary").toBe(403);
        await s.close();
    });

    test("cross-organization assignment is refused, and the foreign thread is untouched", async ({ browser }) => {
        const before = await assignedUser(FOREIGN_THREAD);
        const s = await signIn(browser, P.full.email);
        const res = await assign(s.request, FOREIGN_THREAD, { action: "claim" });
        expect(res.status(), "another organization's conversation must not be assignable").toBeGreaterThanOrEqual(400);
        expect(await assignedUser(FOREIGN_THREAD), "foreign state must be unchanged").toBe(before);
        await s.close();
    });

    test("unassign returns the thread, and the audit row survives it", async ({ browser }) => {
        const s = await signIn(browser, P.assigner.email);
        const res = await assign(s.request, THREAD, { action: "unassign" });
        expect(res.status(), await res.text()).toBeLessThan(400);
        expect(await assignedUser(THREAD)).toBe(null);

        const { count } = await sb
            .from("conversation_assignment_events")
            .select("id", { count: "exact", head: true })
            .eq("thread_id", THREAD);
        expect(count ?? 0, "assignment history is the owning domain's truth, and it is immutable").toBeGreaterThan(1);
        await s.close();
    });
});

test.describe("Jobs — vendor assignment is an ordinary Job operation", () => {
    /*
     * AUTHORITY-GATE PROOF, STATED AS SUCH. The certification tenant carries no jobs, schedules or
     * vendors, so the permitted path here is proven to PASS THE GATE (it reaches the handler and is
     * refused on the missing target) rather than to produce an assignment. The effect side is held
     * by the source lock, which pins the exact helper and key. Saying "200" about something that
     * assigned nothing would be the failure mode this programme keeps finding.
     */
    const SCHEDULE = "c0ffee11-0000-4000-8000-00000000b001";

    test("scheduling.write does NOT confer vendor assignment", async ({ browser }) => {
        /*
         * The granularity question, answered by the product. `scheduling.write` owns WHEN a job
         * happens: its PATCH allows start_at, end_at, timezone, status, status_key and metadata, and
         * cannot set a vendor at all. Routing assignment through it would widen Scheduling into
         * deciding who performs the work.
         */
        const s = await signIn(browser, P.scheduler.email);
        const res = await s.request.post(`/api/admin/schedules/${SCHEDULE}/assign`, { data: { vendor_id: SCHEDULE } });
        expect(res.status(), "a schedule manager must not assign vendors").toBe(403);
        await s.close();
    });

    test("ops.jobs.write passes the gate — it already owns this effect at job grain", async ({ browser }) => {
        const s = await signIn(browser, P.jobber.email);
        const res = await s.request.post(`/api/admin/schedules/${SCHEDULE}/assign`, { data: { vendor_id: SCHEDULE } });
        expect(res.status(), "the Jobs authority must not be refused on authority").not.toBe(403);
        await s.close();
    });

    test("portal admission confers no vendor assignment", async ({ browser }) => {
        const s = await signIn(browser, P.portalOnly.email);
        for (const url of [
            `/api/admin/schedules/${SCHEDULE}/assign`,
            `/api/admin/jobs/${SCHEDULE}/apply-vendor-to-upcoming`,
        ]) {
            const res = await s.request.post(url, { data: { vendor_id: SCHEDULE } });
            expect(res.status(), `${url} must refuse portal admission`).toBe(403);
        }
        await s.close();
    });

    test("no Communications capability reaches into Jobs", async ({ browser }) => {
        // The ruling, from the other direction: the assignment verb does not cross product lines.
        const s = await signIn(browser, P.assigner.email);
        const res = await s.request.post(`/api/admin/schedules/${SCHEDULE}/assign`, { data: { vendor_id: SCHEDULE } });
        expect(res.status(), "communications.assign must not assign vendors").toBe(403);
        await s.close();
    });
});
