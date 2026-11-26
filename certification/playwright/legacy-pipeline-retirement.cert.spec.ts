/**
 * CRM PIPELINE RETIREMENT, MOUNTED — the product is gone and the runtime it fed still runs.
 *
 * The pipeline editor had no renderer and its four routes had no caller, so the six mutations sat
 * in the Access backlog waiting for a capability on behalf of a screen nobody could open. They were
 * retired rather than converged.
 *
 * Two things have to be true at once, and only one of them is obvious:
 *
 *   1. The retired PRODUCT is unreachable signed in — not merely deleted from the tree.
 *   2. The retained PERSISTENCE still serves current runtime. `pipelines` and `pipeline_stages`
 *      feed the Lead drawer, the opportunity queue and the inbox. A retirement that quietly broke
 *      those would pass a "route is 404" check and fail the product.
 *
 * Signed in, because an unauthenticated 404 proves nothing about a route that would have required
 * a session anyway.
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
const PASSWORD = "alloy-local-cert";
/** The composed Enrollment operator from the Slice-1 fixture: a real signed-in principal. */
const OPERATOR = "cert.enrollboth@northwind.invalid";

async function signIn(browser: Browser, email: string): Promise<APIRequestContext> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return page.request as APIRequestContext;
}

let LEAD_ID = "";

test.beforeAll(async () => {
    const { data } = await sb
        .from("opportunities")
        .select("id")
        .eq("org_id", ORG)
        .limit(1)
        .maybeSingle();
    test.skip(!data?.id, "no opportunity in the cert tenant");
    LEAD_ID = String(data.id);
});

test.describe("CRM Pipeline — the retired product is unreachable signed in", () => {
    test("all four retired endpoints answer 404 to an authenticated operator", async ({ browser }) => {
        const api = await signIn(browser, OPERATOR);
        for (const url of [
            "/api/admin/pipelines",
            "/api/admin/pipelines/00000000-0000-4000-8000-0000000000aa",
            "/api/admin/pipeline-stages",
            "/api/admin/pipeline-stages/00000000-0000-4000-8000-0000000000aa",
        ]) {
            const res = await api.get(url);
            expect(res.status(), `${url} must be gone, not merely forbidden`).toBe(404);
        }
    });

    test("the retired mutations are gone too — not left open, not left gated", async ({ browser }) => {
        const api = await signIn(browser, OPERATOR);
        expect((await api.post("/api/admin/pipelines", { data: { name: "x" } })).status()).toBe(404);
        expect((await api.post("/api/admin/pipeline-stages", { data: { name: "x" } })).status()).toBe(404);
    });
});

test.describe("CRM Pipeline — the compatibility redirects still land on current Settings", () => {
    test("the legacy pipeline URL redirects into the current product", async ({ browser }) => {
        const context = await browser.newContext({ storageState: undefined });
        const page = await context.newPage();
        await page.goto("/login");
        await page.locator('input[type="email"]').first().fill(OPERATOR);
        const pw = page.locator('input[type="password"]').first();
        await pw.fill(PASSWORD);
        await pw.press("Enter");
        await page.waitForURL("**/workspace**", { timeout: 90_000 });

        const res = await page.goto("/legacy-admin/system/pipelines");
        /*
         * Retirement kept this as a deliberate compatibility contract: it must not 404, and it must
         * not render a pipeline editor. It lands on the current Processes surface.
         *
         * The destination is asserted as "somewhere in the current product that is not the legacy
         * island", not as one literal path: the legacy page's own comment says `/settings/processes`
         * while the app actually settles on `/organization/processes`, and pinning the stale string
         * would make this case fail for a reason that has nothing to do with retirement.
         */
        expect(res?.status() ?? 0).toBeLessThan(400);
        expect(page.url()).toMatch(/\/(organization|settings)\/processes/);
        expect(page.url(), "must not land back in the legacy island").not.toContain("/legacy-admin/");
        await context.close();
    });
});

test.describe("CRM Pipeline — the retained persistence still serves current runtime", () => {
    test("the tables are still present and readable", async () => {
        /*
         * PRESENT AND READABLE, not populated — and the difference is a finding, not a weaker test.
         *
         * Both tables answer with zero rows in the certification tenant. The six runtime modules
         * that read them are real (RL-26 asserts that in source), so the CODE PATHS are live while
         * the DATA is empty here. That makes the tables a schema-retirement CANDIDATE for a later
         * slice, on the evidence of a hosted row census nobody has run — it does not make them
         * droppable on the strength of this one.
         *
         * Asserting rows > 0 would pin this certification to fixture content and fail for a reason
         * that has nothing to do with the retirement.
         */
        for (const t of ["pipelines", "pipeline_stages"]) {
            const { error } = await sb
                .from(t)
                .select("id", { count: "exact", head: true })
                .eq("org_id", ORG);
            expect(error, `${t} must still exist — the product retired, the persistence did not`).toBeNull();
        }
    });

    test("the Lead drawer, which reads pipeline persistence, still answers", async ({ browser }) => {
        const api = await signIn(browser, OPERATOR);
        const res = await api.get(`/api/admin/view-models/drawer/opportunity/${LEAD_ID}`);
        expect(res.status(), "the drawer resolves status labels through pipeline_stages").toBeLessThan(400);
    });

    test("the current Settings surface and the workspace still load", async ({ browser }) => {
        const context = await browser.newContext({ storageState: undefined });
        const page = await context.newPage();
        await page.goto("/login");
        await page.locator('input[type="email"]').first().fill(OPERATOR);
        const pw = page.locator('input[type="password"]').first();
        await pw.fill(PASSWORD);
        await pw.press("Enter");
        await page.waitForURL("**/workspace**", { timeout: 90_000 });
        const res = await page.goto("/settings/processes");
        expect(res?.status() ?? 0).toBeLessThan(400);
        await context.close();
    });
});
