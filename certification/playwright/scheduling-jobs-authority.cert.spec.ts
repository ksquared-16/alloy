/**
 * SCHEDULES, JOBS, AND THE MONEY THEY POST.
 *
 * Fourteen handlers asked `ctx.role !== "admin"`. Ten are genuinely schedule and job operations.
 * FOUR are not — they post a cash receipt, a vendor payout, a GL journal entry and a receivable
 * charge, and they are the reason this could not be a one-key-per-URL-folder rename. Authority
 * follows the business consequence, so those four are Financials-owned even though they are served
 * from under `schedules/` and `jobs/`.
 *
 * ── THE TWO ROWS THIS FILE EXISTS FOR ──
 *
 * `sjFinWrite` holds the `fin.write` that `ops` holds in every organization. If `fin.post` had not
 * been minted and `fin.write` reused instead, that persona would open all four money doors — which
 * is the widening the slice refused. It must be refused here.
 *
 * `sjTitular` is labelled "Admin" and holds nothing. It must be refused everywhere.
 *
 * ── WHY A STATUS CODE IS THE SUBJECT ──
 *
 * Every gate runs before the handler reads its body, so an empty body is enough and the answer is
 * unambiguous: 403 is the gate refusing; anything else (400 invalid body, 404 no such row) is the
 * gate admitting. A 404 is therefore a PASS for an authorized persona. Writing real schedules,
 * jobs and financial postings would prove the same thing while leaving money rows behind.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OPERATOR_STATE = path.join(__dirname, "..", ".auth", "operator.json");
const EVIDENCE = path.join(__dirname, "..", "evidence", "scheduling-jobs-authority");
const PASSWORD = "alloy-local-cert";

/** Ids that belong to nobody: admitted callers reach a lookup, refused callers never do. */
const NO_SCHEDULE = "99999999-0000-4000-8000-0000000000a1";
const NO_JOB = "99999999-0000-4000-8000-0000000000b1";

const PERSONAS = {
    scheduler: { email: "cert.sjscheduler@northwind.invalid", role: "mcert_sj_scheduler" },
    jobber: { email: "cert.sjjobber@northwind.invalid", role: "mcert_sj_jobber" },
    poster: { email: "cert.sjposter@northwind.invalid", role: "mcert_sj_poster" },
    titular: { email: "cert.sjtitular@northwind.invalid", role: "mcert_sj_titular" },
    finWrite: { email: "cert.sjfinwrite@northwind.invalid", role: "mcert_sj_finwrite" },
    portalOnly: { email: "cert.procportal@northwind.invalid", role: "mcert_proc_portal_only" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d003" };

type Door =
    | "sched:cancel" | "sched:location" | "sched:patch" | "sched:create"
    | "job:archive" | "job:location" | "job:patch" | "job:create"
    | "money:customerPayment" | "money:vendorPayout" | "money:completion" | "money:jobCharge";

type Session = { page: Page; request: APIRequestContext; signedIn: boolean; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 90_000 });
    } catch {
        signedIn = false;
    }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

async function knock(request: APIRequestContext, door: Door): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    const S = `/api/admin/schedules/${NO_SCHEDULE}`;
    const J = `/api/admin/jobs/${NO_JOB}`;
    switch (door) {
        case "sched:cancel": return (await request.post(`${S}/cancel`, no)).status();
        case "sched:location": return (await request.patch(`${S}/location`, no)).status();
        case "sched:patch": return (await request.patch(S, no)).status();
        case "sched:create": return (await request.post("/api/admin/schedules", no)).status();
        case "job:archive": return (await request.post(`${J}/archive`, no)).status();
        case "job:location": return (await request.patch(`${J}/location`, no)).status();
        case "job:patch": return (await request.patch(J, no)).status();
        case "job:create": return (await request.post("/api/admin/jobs", no)).status();
        case "money:customerPayment": return (await request.post(`${S}/post-customer-payment`, no)).status();
        case "money:vendorPayout": return (await request.post(`${S}/post-vendor-payout`, no)).status();
        case "money:completion": return (await request.post(`${S}/post-completion`, no)).status();
        case "money:jobCharge": return (await request.post(`${J}/charges`, no)).status();
    }
}

const admitted = (s: number) => s !== 403;
const SCHED_DOORS: Door[] = ["sched:cancel", "sched:location", "sched:patch", "sched:create"];
const JOB_DOORS: Door[] = ["job:archive", "job:location", "job:patch", "job:create"];
const MONEY_DOORS: Door[] = ["money:customerPayment", "money:vendorPayout", "money:completion", "money:jobCharge"];
const ALL: Door[] = [...SCHED_DOORS, ...JOB_DOORS, ...MONEY_DOORS];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Schedules and Jobs authority, and the money they post", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    /**
     * PHASE 0 — put the certification tenant's `ops` role on the DEFAULT package.
     *
     * This is setup, and it is worth explaining, because the reason it is needed is itself a result.
     *
     * The migration removes the two write keys from `ops` only where NO audited change ever touched
     * that key FOR THAT ROLE — a grant nobody chose. This tenant is the one place that test
     * legitimately says "leave it alone": two of its `mutation_events` name the ops role, written by
     * this suite's own earlier certification runs through the role editor. The product cannot tell a
     * certification run from a deliberate decision, and it is right not to try — so it preserved the
     * grant, exactly as doctrine requires.
     *
     * That makes this tenant's `ops` a CONFIGURED role rather than a default one, and the mandate's
     * claim is about default ops. So the suite sets it back to the default package the same way an
     * organization would: through `/api/admin/rbac/grants`, the route the role editor itself calls.
     * The revocation is audited like any other, and the denial proved in PHASE 2 is then a statement
     * about the default package rather than about this tenant's history.
     */
    test("PHASE 0 — the tenant's ops role is set to the default package through the product", async ({ browser }) => {
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });
        const read = await admin.request.get("/api/admin/rbac/grants?role_key=ops", { failOnStatusCode: false });
        expect(read.status(), "the role editor must be able to read the ops role").toBeLessThan(400);
        const body = (await read.json()) as { permission_keys?: string[]; data?: { permission_keys?: string[] } };
        const held = body.permission_keys ?? body.data?.permission_keys ?? [];
        expect(held.length, "ops holds nothing at all — the fixture is not what this expects").toBeGreaterThan(0);

        const DEFAULT_OPS = held.filter((k) => k !== "scheduling.write" && k !== "ops.jobs.write");
        const put = await admin.request.put("/api/admin/rbac/grants?role_key=ops", {
            data: { permission_keys: DEFAULT_OPS },
            failOnStatusCode: false,
        });
        expect(put.status(), `setting ops to the default package failed: ${await put.text()}`).toBeLessThan(400);
        record("ops-default-package", "keys", DEFAULT_OPS.length);
        await admin.close();
    });

    test("PHASE 1 — each capability opens its own family and no other", async ({ browser }) => {
        const expected: Record<keyof typeof PERSONAS, (d: Door) => boolean> = {
            scheduler: (d) => SCHED_DOORS.includes(d),
            jobber: (d) => JOB_DOORS.includes(d),
            poster: (d) => MONEY_DOORS.includes(d),
            titular: () => false,
            /*
             * THE ROW THAT JUSTIFIES fin.post EXISTING. fin.write is held by ops in every
             * organization. Had the slice reused it for the money four, this persona would open
             * them — and ops would have gained four admin-only money operations.
             */
            finWrite: () => false,
            portalOnly: () => false,
        };
        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            const s = await signIn(browser, p.email);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(name, door, status);
                expect(
                    admitted(status),
                    `${name} at ${door}: expected ${expected[name](door) ? "ADMITTED" : "REFUSED (403)"}, got ${status}`,
                ).toBe(expected[name](door));
            }
            await s.close();
        }
    });

    test("PHASE 2 — admin keeps all fourteen; ops is denied all fourteen", async ({ browser }) => {
        const adminCtx = await browser.newContext({ storageState: OPERATOR_STATE });
        for (const door of ALL) {
            const status = await knock(adminCtx.request, door);
            record("admin", door, status);
            expect(admitted(status), `admin lost ${door} (${status})`).toBe(true);
        }
        await adminCtx.close();

        /*
         * The compatibility claim in one phase. Before this slice every one of these answered ops
         * with 403 because the gate read `ctx.role !== "admin"`. The two write keys were seeded to
         * ops and enforced nowhere, so the grant conferred nothing; the default-package correction
         * is what keeps that true now that the keys are real.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "cert.ops could not sign in").toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("ops", door, status);
            expect(status, `ops gained ${door} — the default-grant correction failed`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 3 — wrong capability is not authority", async ({ browser }) => {
        // Each family must refuse the others' keys, or the split is decorative.
        const sched = await signIn(browser, PERSONAS.scheduler.email);
        expect(await knock(sched.request, "money:jobCharge"), "scheduling.write must not raise a charge").toBe(403);
        expect(await knock(sched.request, "job:archive"), "scheduling.write must not archive a job").toBe(403);
        await sched.close();

        const jobber = await signIn(browser, PERSONAS.jobber.email);
        expect(await knock(jobber.request, "money:customerPayment"), "ops.jobs.write must not post a receipt").toBe(403);
        expect(await knock(jobber.request, "sched:cancel"), "ops.jobs.write must not cancel a schedule").toBe(403);
        await jobber.close();

        const poster = await signIn(browser, PERSONAS.poster.email);
        expect(await knock(poster.request, "sched:patch"), "fin.post must not edit a schedule").toBe(403);
        expect(await knock(poster.request, "job:patch"), "fin.post must not edit a job").toBe(403);
        await poster.close();
    });

    test("PHASE 4 — the reads that were open are still open", async ({ browser }) => {
        /*
         * Four of the fourteen files carry a GET beside the mutation, and in all four the gate sits
         * INSIDE the mutating handler. This slice changed write authority and was not approved to
         * touch reads; a run that quietly gated them would look identical in the matrix above.
         */
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        for (const url of ["/api/admin/schedules", "/api/admin/jobs",
                           `/api/admin/schedules/${NO_SCHEDULE}`, `/api/admin/jobs/${NO_JOB}`]) {
            const res = await s.request.get(url, { failOnStatusCode: false });
            record("portalOnly", `GET ${url.replace(NO_SCHEDULE, ":id").replace(NO_JOB, ":id")}`, res.status());
            expect(res.status(), `${url} was open before this slice and must stay open`).not.toBe(403);
        }
        await s.close();
    });

    test("PHASE 5 — composition: a second role opens money, and removing it closes money only", async ({ browser }) => {
        /*
         * The compositional model the mandate names. The subject manages schedules and cannot post;
         * granting the posting role opens money in the SAME signed-in session; removing it closes
         * money again and leaves schedule management untouched.
         */
        const subjectId = "c0000000-0000-4000-8000-00000000d024";
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });
        const subject = await signIn(browser, PERSONAS.scheduler.email);

        expect(await knock(subject.request, "sched:cancel"), "precondition: schedules open").not.toBe(403);
        expect(await knock(subject.request, "money:completion"), "precondition: money shut").toBe(403);

        const add = await admin.request.post(`/api/admin/users/${subjectId}/roles`, {
            data: { role: PERSONAS.poster.role }, failOnStatusCode: false,
        });
        expect(add.status(), `assignment failed: ${await add.text()}`).toBeLessThan(400);

        const opened = await knock(subject.request, "money:completion");
        record("scheduler+poster", "money:completion", opened);
        expect(admitted(opened), `the union must take effect immediately (got ${opened})`).toBe(true);

        const remove = await admin.request.delete(`/api/admin/users/${subjectId}/roles/${PERSONAS.poster.role}`, {
            failOnStatusCode: false,
        });
        expect(remove.status(), `removal failed: ${await remove.text()}`).toBeLessThan(400);

        expect(await knock(subject.request, "money:completion"), "money must close again").toBe(403);
        expect(await knock(subject.request, "sched:cancel"), "schedule management must survive").not.toBe(403);

        await subject.close();
        await admin.close();
    });

    test("PHASE 6 — cross-organization", async ({ browser }) => {
        const s = await signIn(browser, "cert.otherorg@adapter.invalid");
        expect(s.signedIn, "cert.otherorg could not sign in").toBe(true);
        for (const door of ["sched:cancel", "money:jobCharge"] as Door[]) {
            const status = await knock(s.request, door);
            record("otherorg", door, status);
            expect(status, `another organization's administrator must not act here (${door})`).toBeGreaterThanOrEqual(400);
        }
        await s.close();
    });

    test("PHASE 7 — the recorded matrix is complete and non-vacuous", async () => {
        const statuses = Object.values(MATRIX).flatMap((d) => Object.values(d));
        expect(statuses.some((s) => s === 403), "no refusal recorded — the gates are not gating").toBe(true);
        expect(statuses.some((s) => s !== 403), "no admission recorded — nothing can be done at all").toBe(true);
        for (const who of [...Object.keys(PERSONAS), "admin", "ops"]) {
            expect(MATRIX[who], `${who} is missing from the matrix`).toBeTruthy();
        }
    });
});
