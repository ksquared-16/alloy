/**
 * THE FAMILY RECORD, MOUNTED — two keys that existed on paper and governed nothing.
 *
 * `crm.customers.read` and `crm.customers.write` have been in the catalog since the permission grid
 * and granted to `admin` and `ops` in every organization. `crm.customers.write` was named by NO
 * source file; `crm.customers.read` by exactly one. The routes were decided by `requireAdminOrOps()`
 * (portal admission), by `ctx.role !== "admin"` (a title in no grant table), and on four contact
 * mutations by nothing at all.
 *
 * So the matrix is about whether the two keys now mean anything: a reader who cannot write, a writer
 * who can, a person titled "Customer Administrator" who can do neither, and a documents writer who
 * can replace a person's photo without being able to touch the person.
 *
 * Every refusal is checked against the database afterwards. A 403 with a side effect is a failure,
 * and a 200 that changed nothing is not proof of the permitted path.
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

/** Mirrored from `fixtures/access-personas.mjs`. */
const P = {
    reader:     "cert.crmreader@northwind.invalid",
    writer:     "cert.crmwriter@northwind.invalid",
    writeOnly:  "cert.crmwriteonly@northwind.invalid",
    titular:    "cert.crmtitular@northwind.invalid",
    portalOnly: "cert.commsportal@northwind.invalid",
    docsWriter: "cert.procdocswriter@northwind.invalid",
    ops:        "cert.ops@northwind.invalid",
    otherOrg:   "cert.otherorg@adapter.invalid",
} as const;

const TAG = `crmcert-${Date.now()}`;
const PERSON = "c0ffee22-0000-4000-8000-00000000c001";
const FOREIGN_PERSON = "c0ffee22-0000-4000-8000-00000000c002";

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

/** Read the record straight out of Postgres; the API that wrote it cannot vouch for itself. */
async function firstNameOf(id: string): Promise<string | null> {
    const { data } = await sb.from("persons").select("first_name").eq("id", id).maybeSingle();
    return (data as { first_name?: string | null } | null)?.first_name ?? null;
}
async function personCount(): Promise<number> {
    const { count } = await sb.from("persons").select("id", { count: "exact", head: true })
        .eq("org_id", ORG).like("first_name", `${TAG}%`);
    return count ?? 0;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
    await sb.from("persons").upsert(
        [
            /*
             * `updated_at` is set deliberately. The list is ordered by it, descending, and capped at
             * 500 of the tenant's 1,825 people — so a fixture without it sorts off the end of the
             * page and the read assertion fails for a reason that has nothing to do with authority.
             */
            { id: PERSON, org_id: ORG, first_name: "CertFamily", last_name: "Record", updated_at: new Date().toISOString() },
            { id: FOREIGN_PERSON, org_id: OTHER_ORG, first_name: "CertFamily", last_name: "Foreign", updated_at: new Date().toISOString() },
        ],
        { onConflict: "id" }
    );
    const { count } = await sb.from("persons").select("id", { count: "exact", head: true })
        .in("id", [PERSON, FOREIGN_PERSON]);
    expect(count, "fixtures must exist, or every result below is a fixture failure wearing a gate's clothes").toBe(2);
});

test.afterAll(async () => {
    await sb.from("persons").delete().eq("org_id", ORG).like("first_name", `${TAG}%`);
    await sb.from("persons").delete().in("id", [PERSON, FOREIGN_PERSON]);
});

test.describe("CRM/People — the record surface names its authority", () => {
    test("the reader reads, and the read is real", async ({ browser }) => {
        const s = await signIn(browser, P.reader);
        const res = await s.request.get("/api/admin/persons");
        expect(res.status()).toBe(200);
        expect(await res.text(), "an empty 200 proves nothing").toContain("CertFamily");
        await s.close();
    });

    test("the reader cannot write — and the record is untouched", async ({ browser }) => {
        const before = await firstNameOf(PERSON);
        const s = await signIn(browser, P.reader);
        const res = await s.request.patch(`/api/admin/persons/${PERSON}`, { data: { first_name: `${TAG}-reader` } });
        expect(res.status()).toBe(403);
        expect(await res.text()).toContain("crm.customers.write");
        expect(await firstNameOf(PERSON), "a refused PATCH must not have changed the person").toBe(before);
        await s.close();
    });

    test("the writer writes, and the change is in the database", async ({ browser }) => {
        const s = await signIn(browser, P.writer);
        const res = await s.request.patch(`/api/admin/persons/${PERSON}`, { data: { first_name: `${TAG}-writer` } });
        expect(res.status(), await res.text()).toBeLessThan(400);
        expect(await firstNameOf(PERSON)).toBe(`${TAG}-writer`);
        await s.close();
    });

    test("write does not confer read — the direction the catalog always claimed", async ({ browser }) => {
        /*
         * Two keys have been offered in the role editor for this surface since the permission grid.
         * Nothing checked either, so nothing could tell them apart. This is the assertion that makes
         * the distinction real rather than decorative.
         */
        const s = await signIn(browser, P.writeOnly);
        const res = await s.request.get("/api/admin/persons");
        expect(res.status()).toBe(403);
        expect(await res.text()).toContain("crm.customers.read");
        await s.close();
    });

    test("the persona titled Customer Administrator can do neither", async ({ browser }) => {
        /*
         * THE DEFECT THIS CLOSED, POINTED AT DIRECTLY. Nine handlers here were gated on
         * `ctx.role !== "admin"` — a role TITLE, recorded in no grant table.
         */
        const before = await firstNameOf(PERSON);
        const countBefore = await personCount();
        const s = await signIn(browser, P.titular);
        expect((await s.request.get("/api/admin/persons")).status()).toBe(403);
        const w = await s.request.post("/api/admin/persons", { data: { first_name: `${TAG}-titular`, last_name: "X" } });
        expect(w.status()).toBe(403);
        expect(await firstNameOf(PERSON)).toBe(before);
        expect(await personCount(), "a refused create must not have created anybody").toBe(countBefore);
        await s.close();
    });

    test("portal admission confers nothing on the family record", async ({ browser }) => {
        const countBefore = await personCount();
        const s = await signIn(browser, P.portalOnly);
        for (const [method, url] of [["GET", "/api/admin/persons"], ["GET", "/api/admin/customers"], ["GET", "/api/admin/contacts"]] as const) {
            const res = await s.request.fetch(url, { method });
            expect(res.status(), `${url} must refuse portal admission`).toBe(403);
        }
        const c = await s.request.post("/api/admin/contacts", { data: { first_name: `${TAG}-portal` } });
        expect(c.status()).toBe(403);
        expect(await personCount()).toBe(countBefore);
        await s.close();
    });

    test("the documents writer may replace a photo and may not touch the person", async ({ browser }) => {
        /*
         * The cross-family separation. A person's photo is documents-backed, so its mutations take
         * `documents.write`; the person's record does not. One persona, two answers.
         */
        const before = await firstNameOf(PERSON);
        const s = await signIn(browser, P.docsWriter);
        const photo = await s.request.delete(`/api/admin/persons/${PERSON}/profile-photo`);
        expect(photo.status(), "documents.write must not be refused on authority").not.toBe(403);

        const person = await s.request.patch(`/api/admin/persons/${PERSON}`, { data: { first_name: `${TAG}-docs` } });
        expect(person.status(), "documents.write must not confer family-record authority").toBe(403);
        expect(await firstNameOf(PERSON)).toBe(before);
        await s.close();
    });

    test("the CRM writer may not write a document", async ({ browser }) => {
        // And the same separation from the other side.
        const s = await signIn(browser, P.writer);
        const res = await s.request.delete(`/api/admin/persons/${PERSON}/profile-photo`);
        expect(res.status()).toBe(403);
        expect(await res.text()).toContain("documents.write");
        await s.close();
    });

    test("the seeded ops package reaches the record, as its grants say it should", async ({ browser }) => {
        /*
         * Nine of these handlers were admin-title-only, which DENIED ops — while ops held
         * `crm.customers.write`, `ops.customers.write` and `ops.contacts.write` in every
         * organization. The title contradicted the package; the capability restores it.
         */
        const s = await signIn(browser, P.ops);
        expect((await s.request.get("/api/admin/persons")).status()).toBe(200);
        const res = await s.request.patch(`/api/admin/persons/${PERSON}`, { data: { first_name: `${TAG}-ops` } });
        expect(res.status(), await res.text()).toBeLessThan(400);
        expect(await firstNameOf(PERSON)).toBe(`${TAG}-ops`);
        await s.close();
    });

    test("another organization's person is not reachable, and stays unchanged", async ({ browser }) => {
        const before = await firstNameOf(FOREIGN_PERSON);
        const s = await signIn(browser, P.writer);
        const res = await s.request.patch(`/api/admin/persons/${FOREIGN_PERSON}`, { data: { first_name: `${TAG}-cross` } });
        expect(res.status(), "cross-tenant write must be refused").toBeGreaterThanOrEqual(400);
        expect(await firstNameOf(FOREIGN_PERSON), "foreign state must be unchanged").toBe(before);
        await s.close();
    });
});
