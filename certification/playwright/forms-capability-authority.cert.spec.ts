/**
 * FORMS AUTHORITY — THREE CAPABILITIES, SIX PEOPLE, ONE RUNNING PRODUCT.
 *
 * Until this change, Forms authority was the word `"admin"` written into twenty-two route
 * handlers. An organization could define any role it liked and grant it anything in the catalog;
 * none of that reached Forms, because Forms was not asking about capabilities. It was asking what
 * someone's job was called.
 *
 * The repair splits that one word into three capabilities — `forms.author` for design,
 * `forms.submissions` for handling what people send back, `forms.submissions.confirm` for
 * confirming a submission belongs to the record it claims — and the only way to show those are
 * genuinely THREE rather than one capability wearing three names is to give a different person
 * each one and watch the product answer differently for each. That is what this file does, against
 * the real server, through the real login flow, with each persona's own session.
 *
 * ── WHY A STATUS CODE IS THE SUBJECT ──
 *
 * Every gated handler checks its capability BEFORE it reads the request body. So an empty body is
 * all the payload this file needs, and the answer is unambiguous:
 *
 *     403  → refused at the gate
 *     anything else (400 invalid body, 404 no such row) → ADMITTED past the gate
 *
 * A 400 is therefore a PASS for an authorized persona: it means the gate let them through to
 * validation. Sending well-formed payloads would prove the same thing while also writing rows this
 * file would then have to clean up, and cleanup that fails leaves the next run lying.
 *
 * ── WHAT IS WRITTEN, AND WHAT IS PUT BACK ──
 *
 * One form definition, created by `cert.formsoperator` through the product's own route and deleted
 * in teardown. One role assignment added to `cert.formsauthor` and removed again. The
 * `mutation_events` rows those produce are NOT cleaned up and cannot be — they are truthful records
 * of access changes that really happened, which is the entire point of D2.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first.
 */
import {
    test,
    expect,
    type APIRequestContext,
    type Browser,
    type BrowserContext,
    type Page,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OPERATOR_STATE = path.join(__dirname, "..", ".auth", "operator.json");
const EVIDENCE = path.join(__dirname, "..", "evidence", "forms-authority");
const PASSWORD = "alloy-local-cert";

/** A submission id that belongs to nobody. Admitted callers get 404; refused callers get 403. */
const NO_SUCH_SUBMISSION = "99999999-0000-4000-8000-00000000f001";

/**
 * The six personas, and what each one is the claim FOR.
 *
 * Every one also holds `portal.access`, because W-13 made admission its own capability: a role
 * carrying every Forms key and no admission would be refused at the front door, and that refusal
 * would read as a Forms defect. Admission is the precondition of the question, not part of it.
 */
const PERSONAS = {
    author: { email: "cert.formsauthor@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d009", role: "mcert_forms_author" },
    reader: { email: "cert.formsreader@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d010", role: "mcert_forms_reader" },
    confirmer: { email: "cert.formsconfirm@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d011", role: "mcert_forms_confirmer" },
    operator: { email: "cert.formsoperator@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d012", role: "mcert_forms_operator" },
    bystander: { email: "cert.formsbystander@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d013", role: "mcert_forms_bystander" },
    /** The control. Its LABEL is "Forms Administrator". It holds no Forms capability at all. */
    titular: { email: "cert.formstitular@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d014", role: "mcert_forms_titular" },
} as const;

/** The seeded `ops` persona — compatibility's load-bearing case. */
const OPS = { email: "cert.ops@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d003" };
/**
 * Holds portal admission and `crm.customers.read`, and NO Forms capability.
 *
 * Deliberately not `cert.frontdesk`, which holds the CRM key and no `portal.access`: W-13 refuses
 * that persona at admission before any route-level check runs, so probing with it would vary two
 * things at once and prove neither. This one varies exactly the CRM key.
 */
const CRM_READER = { email: "cert.formscrm@northwind.invalid", id: "c0000000-0000-4000-8000-00000000d015" };

type Door = "author" | "submissions" | "confirm";

type Session = {
    label: string;
    page: Page;
    request: APIRequestContext;
    signedIn: boolean;
    close: () => Promise<void>;
};

/** Sign a persona in through the product's own login flow — no injected tokens, no service key. */
async function signIn(browser: Browser, email: string, label: string): Promise<Session> {
    const context: BrowserContext = await browser.newContext({ storageState: undefined });
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
    return { label, page, request: page.request, signedIn, close: () => context.close() };
}

/**
 * Knock on one door and report the status.
 *
 * The bodies are deliberately empty — see the header. `failOnStatusCode` stays off because a 4xx is
 * the expected answer on most of these knocks and is exactly what is being measured.
 */
async function knock(request: APIRequestContext, door: Door): Promise<number> {
    switch (door) {
        case "author":
            return (await request.post("/api/admin/forms/blank", { data: {}, failOnStatusCode: false })).status();
        case "submissions":
            return (await request.post("/api/admin/forms/submissions", { data: {}, failOnStatusCode: false })).status();
        case "confirm":
            return (
                await request.post(`/api/admin/forms/submissions/${NO_SUCH_SUBMISSION}/confirm-linkage`, {
                    data: {},
                    failOnStatusCode: false,
                })
            ).status();
    }
}

/** Admitted past the gate means anything that is not the gate's own refusal. */
const admitted = (status: number) => status !== 403;

/** The matrix, recorded as it is proved, and written out as evidence. */
const MATRIX: Record<string, Record<string, number>> = {};

function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

/** The one form this file creates, so later phases have something real to ask about. */
let createdFormId: string | null = null;

test.describe.configure({ mode: "serial" });

test.describe("Forms authority is a capability, not a job title", () => {
    test.afterAll(async ({ browser }) => {
        if (createdFormId) {
            const ctx = await browser.newContext({ storageState: OPERATOR_STATE });
            await ctx.request
                .delete(`/api/admin/forms/${createdFormId}`, { failOnStatusCode: false })
                .catch(() => undefined);
            await ctx.close();
        }
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    /* ── PHASE 0 — the subjects are real operators, not API tokens ────────────────────────── */

    test("PHASE 0 — every persona signs in and is admitted to the organization", async ({ browser }) => {
        for (const [name, p] of Object.entries(PERSONAS)) {
            const s = await signIn(browser, p.email, name);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            await s.page.goto("/organization", { waitUntil: "domcontentloaded" });
            /*
             * Admitted means they ARRIVED. A principal holding nothing is bounced to /login rather
             * than /unauthorized, so testing only for /unauthorized reports them as admitted.
             */
            expect(/\/organization/.test(s.page.url()), `${name} was not admitted to the portal`).toBe(true);
            await s.close();
        }
    });

    /* ── PHASE 1 — three capabilities, proved independent ─────────────────────────────────── */

    test("PHASE 1 — each capability opens ONE door and leaves the other two shut", async ({ browser }) => {
        /*
         * This is the whole claim in one table. If the three keys were secretly one key, some row
         * here would show two doors opening together; if any handler still read a job title, the
         * `titular` row would open doors its holder was never granted.
         */
        const expected: Record<keyof typeof PERSONAS, Record<Door, boolean>> = {
            author: { author: true, submissions: false, confirm: false },
            reader: { author: false, submissions: true, confirm: false },
            confirmer: { author: false, submissions: false, confirm: true },
            operator: { author: true, submissions: true, confirm: true },
            bystander: { author: false, submissions: false, confirm: false },
            titular: { author: false, submissions: false, confirm: false },
        };

        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            const s = await signIn(browser, p.email, name);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            for (const door of ["author", "submissions", "confirm"] as Door[]) {
                const status = await knock(s.request, door);
                record(name, door, status);
                expect(
                    admitted(status),
                    `${name} at the ${door} door: expected ${expected[name][door] ? "ADMITTED" : "REFUSED (403)"}, got ${status}`
                ).toBe(expected[name][door]);
            }
            await s.close();
        }
    });

    test("PHASE 1b — the refusal is the server's, not a hidden button", async ({ browser }) => {
        /*
         * A UI that hides an affordance has not refused anything; the request still works for
         * anyone who makes it directly. Every refusal above came from an HTTP call this file made
         * itself, with no screen involved — and this one reads the refusal's own body to show it is
         * an authorization answer rather than an incidental failure.
         */
        const s = await signIn(browser, PERSONAS.titular.email, "titular");
        const res = await s.page.request.post("/api/admin/forms/blank", { data: {}, failOnStatusCode: false });
        expect(res.status()).toBe(403);
        const body = await res.text();
        expect(body.length, "a refusal must say something").toBeGreaterThan(0);
        // It must not leak WHICH capability is missing to an unauthorized caller's console, but it
        // must be a refusal rather than a stack trace.
        expect(body).not.toMatch(/at .*\.js:\d+/);
        await s.close();
    });

    /* ── PHASE 2 — compatibility: the roles that already had Forms keep exactly what they had ─ */

    test("PHASE 2 — admin keeps all three; ops keeps confirm and gains nothing", async ({ browser }) => {
        /*
         * The seeded operator is an administrator. Before this change, `admin` was the ONLY way in,
         * so the compatibility grants must leave an administrator able to do everything they could
         * do yesterday — a cleanup that quietly removes an operator's access is a regression wearing
         * a cleanup's clothes.
         */
        const adminCtx = await browser.newContext({ storageState: OPERATOR_STATE });
        for (const door of ["author", "submissions", "confirm"] as Door[]) {
            const status = await knock(adminCtx.request, door);
            record("admin", door, status);
            expect(admitted(status), `admin lost the ${door} door (${status})`).toBe(true);
        }
        await adminCtx.close();

        /*
         * ops is the load-bearing half. It held exactly ONE Forms write before — confirming a
         * linkage — and the compatibility grant gives it exactly that one back. Widening ops to the
         * other two would be the easiest mistake in the change and the hardest to notice, because
         * everything would keep working.
         */
        const s = await signIn(browser, OPS.email, "ops");
        expect(s.signedIn, "cert.ops could not sign in").toBe(true);
        const opsExpected: Record<Door, boolean> = { author: false, submissions: false, confirm: true };
        for (const door of ["author", "submissions", "confirm"] as Door[]) {
            const status = await knock(s.request, door);
            record("ops", door, status);
            expect(
                admitted(status),
                `ops at the ${door} door: expected ${opsExpected[door] ? "ADMITTED" : "REFUSED"}, got ${status}`
            ).toBe(opsExpected[door]);
        }
        await s.close();
    });

    /* ── PHASE 3 — reads were preserved ──────────────────────────────────────────────────── */

    test("PHASE 3 — a read that was never gated still answers for someone holding no Forms key", async ({ browser }) => {
        /*
         * The conversion touched WRITE authority. Turning a read into a refusal would be a silent
         * regression: operators who could always see the form library would start getting 403s and
         * the cause would look like a Forms bug rather than an access change.
         */
        const s = await signIn(browser, PERSONAS.bystander.email, "bystander");
        for (const url of ["/api/admin/forms", "/api/admin/forms/submissions"]) {
            const res = await s.request.get(url, { failOnStatusCode: false });
            record("bystander", `GET ${url}`, res.status());
            expect(res.status(), `${url} must not refuse a reader who holds no Forms capability`).not.toBe(403);
        }
        await s.close();
    });

    /* ── PHASE 4 — the CRM door is gated on the CRM key, not on anything Forms ───────────── */

    test("PHASE 4 — CRM entity search asks for crm.customers.read, and nothing else", async ({ browser }) => {
        /*
         * This handler lives under /api/admin/forms and used to be gated on the `admin` role. It
         * searches CUSTOMERS, so the capability that owns it is `crm.customers.read` — which this
         * change moved out of the "dead keys" list, because it now has an enforcement site.
         *
         * Two personas make that specific rather than plausible: one holds every Forms capability
         * and not the CRM key, the other holds the CRM key and no Forms capability at all. If the
         * gate were "something Forms-ish", they would come back the wrong way round.
         */
        // `entity_type` is required by the handler; without it an ADMITTED caller gets 400, which
        // would still pass "not 403" but for the wrong reason. Naming it makes admission mean the
        // search actually ran.
        const q = "?entity_type=person&q=test";
        const operator = await signIn(browser, PERSONAS.operator.email, "operator");
        const res1 = await operator.request.get(`/api/admin/forms/crm-entity-search${q}`, { failOnStatusCode: false });
        record("operator", "crm-entity-search", res1.status());
        expect(res1.status(), "all three Forms capabilities must not buy CRM search").toBe(403);
        await operator.close();

        const crmReader = await signIn(browser, CRM_READER.email, "crmreader");
        expect(crmReader.signedIn, "cert.formscrm could not sign in").toBe(true);
        const res2 = await crmReader.request.get(`/api/admin/forms/crm-entity-search${q}`, { failOnStatusCode: false });
        record("crmreader", "crm-entity-search", res2.status());
        expect(res2.status(), "crm.customers.read is what this door asks for").not.toBe(403);
        await crmReader.close();
    });

    /* ── PHASE 5 — a real form, made by capability alone ─────────────────────────────────── */

    test("PHASE 5 — the author capability actually authors, with no admin role anywhere", async ({ browser }) => {
        /*
         * Phases 1-4 prove who is refused. This proves the other half: `cert.formsoperator` holds
         * no `admin` role and never has, and creates a real form through the product's own route.
         * A gate that admits everyone would pass every refusal test in this file by failing to
         * exist, so the admission has to be shown doing real work.
         */
        const s = await signIn(browser, PERSONAS.operator.email, "operator");
        const res = await s.request.post("/api/admin/forms/blank", {
            data: { name: "Forms authority certification form" },
            failOnStatusCode: false,
        });
        expect(res.status(), `create failed: ${await res.text()}`).toBeLessThan(400);
        const payload = (await res.json()) as { data?: { form_id?: string } };
        createdFormId = payload?.data?.form_id ?? null;
        expect(createdFormId, "the created form must come back with an id").toBeTruthy();
        await s.close();
    });

    /* ── PHASE 6 — shaping is not refusing ──────────────────────────────────────────────── */

    test("PHASE 6 — outcome labels SHAPE for a non-author instead of refusing", async ({ browser }) => {
        /*
         * One of the twenty-two sites was not a gate at all: it added outcome-configuration picker
         * options — design material — behind `ctx.role === "admin"`. The repair swaps WHICH question
         * is asked without changing WHAT happens when the answer is no. The request still succeeds
         * and still returns the catalog, just without the pickers. Turning it into a 403 here would
         * have been a regression this file exists to catch.
         */
        expect(createdFormId, "PHASE 5 must have created a form").toBeTruthy();
        const url = `/api/admin/forms/${createdFormId}/outcome-labels?include_picker_options=1`;

        const author = await signIn(browser, PERSONAS.author.email, "author");
        const withPickers = await author.request.get(url, { failOnStatusCode: false });
        expect(withPickers.status()).toBe(200);
        const authorBody = await withPickers.text();
        record("author", "outcome-labels", withPickers.status());
        await author.close();

        const reader = await signIn(browser, PERSONAS.reader.email, "reader");
        const shaped = await reader.request.get(url, { failOnStatusCode: false });
        record("reader", "outcome-labels", shaped.status());
        expect(shaped.status(), "a non-author must be SHAPED, not refused").toBe(200);
        const readerBody = await shaped.text();
        await reader.close();

        // The author gets strictly more. Comparing the payloads is what makes "shaped" a claim
        // rather than a hope: two identical 200s would mean the branch never fired.
        expect(
            authorBody.length,
            "the author must receive picker options the non-author does not"
        ).toBeGreaterThan(readerBody.length);
    });

    /* ── PHASE 7 — W-17 composition, and the cache that must not lie ────────────────────── */

    test("PHASE 7 — a second role opens a second door, and closes again when removed", async ({ browser }) => {
        /*
         * W-17 made role assignment additive and the resolver unions capabilities. Forms is where
         * that becomes visible to an operator: `cert.formsauthor` can design forms and cannot touch
         * submissions, and an administrator can grant the second responsibility without taking away
         * the first.
         *
         * The cache is the part worth watching. `getAdminContextCached` memoizes per request, and
         * the admin shell keeps its own context cache — so a grant that takes effect only after the
         * person signs out and back in would be a product that lies about what it just did. The
         * probe below re-uses the SAME signed-in session throughout.
         */
        const subject = PERSONAS.author;
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });

        const before = await signIn(browser, subject.email, "author");
        expect(await knock(before.request, "submissions"), "precondition: the door is shut").toBe(403);

        const add = await admin.request.post(`/api/admin/users/${subject.id}/roles`, {
            data: { role: PERSONAS.reader.role },
            failOnStatusCode: false,
        });
        expect(add.status(), `assignment failed: ${await add.text()}`).toBeLessThan(400);

        // Same session, next request. No sign-out, no reload.
        const opened = await knock(before.request, "submissions");
        record("author+reader", "submissions", opened);
        expect(admitted(opened), `the union must take effect immediately (got ${opened})`).toBe(true);

        // And the first responsibility survived — additive means additive.
        expect(admitted(await knock(before.request, "author")), "the original capability was lost").toBe(true);

        const remove = await admin.request.delete(
            `/api/admin/users/${subject.id}/roles/${PERSONAS.reader.role}`,
            { failOnStatusCode: false }
        );
        expect(remove.status(), `removal failed: ${await remove.text()}`).toBeLessThan(400);

        const closed = await knock(before.request, "submissions");
        record("author-after-removal", "submissions", closed);
        expect(closed, "removing the role must close the door again").toBe(403);

        await before.close();
        await admin.close();
    });

    test("PHASE 8 — those two changes are in the access history, attributed", async ({ browser }) => {
        /*
         * D2's claim, read through the product's own surface rather than the database: an access
         * change that is not recorded did not happen as far as anyone reviewing it can tell.
         */
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });
        const res = await admin.request.get(`/api/admin/access/history?subject=${PERSONAS.author.id}&limit=25`);
        expect(res.status()).toBe(200);
        const body = (await res.json()) as { entries: { summary: string; actorDisplay: string }[] };
        expect(body.entries.length, "the assignment and the removal must both be recorded").toBeGreaterThanOrEqual(2);
        for (const entry of body.entries.slice(0, 2)) {
            expect(entry.actorDisplay, "an access change must name who made it").toBeTruthy();
            expect(entry.actorDisplay).not.toBe("");
        }
        await admin.close();
    });

    /* ── PHASE 9 — scope: a capability is held IN an organization ───────────────────────── */

    test("PHASE 9 — Forms capability does not cross an organization boundary", async ({ browser }) => {
        /*
         * `cert.otherorg` is an administrator — of a DIFFERENT organization. Their own org's
         * authority must not reach this org's form, and the answer must be "no such form here"
         * rather than a successful edit.
         */
        expect(createdFormId, "PHASE 5 must have created a form").toBeTruthy();
        const s = await signIn(browser, "cert.otherorg@adapter.invalid", "otherorg");
        expect(s.signedIn, "cert.otherorg could not sign in").toBe(true);
        const res = await s.request.patch(`/api/admin/forms/${createdFormId}`, {
            data: { name: "renamed from another organization" },
            failOnStatusCode: false,
        });
        record("otherorg", "PATCH form in org A", res.status());
        expect(
            res.status(),
            "another organization's administrator must not be able to edit this form"
        ).toBeGreaterThanOrEqual(400);
        await s.close();
    });

    /* ── PHASE 10 — the matrix, as evidence ────────────────────────────────────────────── */

    test("PHASE 10 — the recorded matrix is complete and non-vacuous", async () => {
        /*
         * A matrix in which everything is admitted, or everything is refused, would satisfy every
         * `expect` above only if those expectations were themselves wrong. This asserts the shape of
         * the evidence: both answers appear, and the six personas plus admin and ops are all in it.
         */
        const statuses = Object.values(MATRIX).flatMap((doors) => Object.values(doors));
        expect(statuses.some((s) => s === 403), "no refusal was recorded — the gates are not gating").toBe(true);
        expect(statuses.some((s) => s !== 403), "no admission was recorded — nothing can be done at all").toBe(true);
        for (const who of [...Object.keys(PERSONAS), "admin", "ops"]) {
            expect(MATRIX[who], `${who} is missing from the matrix`).toBeTruthy();
        }
    });
});
