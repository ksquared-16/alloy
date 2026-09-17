/**
 * OPERATIONAL INTELLIGENCE RESIDUAL, MOUNTED — the guided question builders.
 *
 * `/organization/operational-intelligence` renders `OiRoomUtilizationBuilder` and
 * `OiFutureRoomCapacityBuilder`, and both POST to `operational-questions/configure` to create a
 * measurement with a healthy-range goal. That handler asked `ctx.role !== "admin"` while the
 * canonical door to the same measurements collection — `POST metrics/oi-org-calc-measurements` —
 * has required `reports.write` since Operational Intelligence Authority Convergence V1.
 *
 * The OI Reader is the sharp persona: `reports.read` is what an organization grants someone to LOOK
 * at Operational Intelligence, and it is a subset of the writer in the READ gate. If it ever
 * satisfied the manage gate, every viewer would silently become an author of the definitions their
 * numbers are computed from.
 *
 * ── WHAT THIS SPEC DELIBERATELY DOES NOT CLAIM ──
 *
 * `organization-populations` POST and `organization-weightings` POST are in the same slice and are
 * NOT certified here, because a method-level trace found no POST caller for either anywhere in the
 * repository — the builders only GET those lists. They are API_ONLY_CURRENT and their proof is the
 * direct certification. Fabricating a mounted control for them would be inventing product.
 *
 * Every refusal is checked against the database afterwards. A 403 with a side effect is a failure.
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

/** Mirrored from `fixtures/access-personas.mjs`. */
const P = {
    writer: "cert.oiwriter@northwind.invalid",
    reader: "cert.oireader@northwind.invalid",
    titular: "cert.oititular@northwind.invalid",
    portalOnly: "cert.commsportal@northwind.invalid",
} as const;

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

/**
 * Read the measurement collection straight out of Postgres. The API that wrote it cannot vouch for
 * itself, and these definitions live in `org_settings.metadata` rather than a table of their own.
 */
async function measurementCount(): Promise<number> {
    const { data } = await sb.from("org_settings").select("metadata").eq("org_id", ORG).maybeSingle();
    const meta = (data as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {};
    const key = Object.keys(meta).find((k) => k.includes("measurement"));
    const v = key ? (meta as Record<string, unknown>)[key] : null;
    return Array.isArray(v) ? v.length : 0;
}

const configure = (api: APIRequestContext, name: string) =>
    api.post("/api/admin/operational-questions/configure", {
        data: { question_key: "future_room_capacity", name, reuse_existing: false },
    });

test.describe("OI residual mounted — the reporting owner may configure a question", () => {
    test("an OI writer configures a measurement, and the database agrees", async ({ browser }) => {
        const before = await measurementCount();
        const api = await signIn(browser, P.writer);

        const res = await configure(api, `Cert Future Room Capacity ${Date.now()}`);
        expect(res.status(), "the writer holds reports.write").toBeLessThan(400);
        expect(await measurementCount(), "the configuration must be durable, not just a 201").toBe(before + 1);
    });
});

test.describe("OI residual mounted — who is refused, and nothing is configured", () => {
    for (const [label, email] of [
        ["portal admission alone", P.portalOnly],
        /*
         * The sharp case. `reports.read` is the viewer's key and a subset of the writer in the read
         * gate; it must never reach the manage gate.
         */
        ["an OI READER — looking at the numbers is not authoring their definitions", P.reader],
        ["a role LABELLED for Operational Intelligence holding no grant", P.titular],
    ] as const) {
        test(`${label} cannot configure a question`, async ({ browser }) => {
            const before = await measurementCount();
            const api = await signIn(browser, email);
            const res = await configure(api, "SHOULD NEVER PERSIST");
            expect(res.status()).toBe(403);
            expect(await measurementCount(), "a refusal must leave the collection untouched").toBe(before);
        });
    }
});

test.describe("OI residual mounted — W-17 composition", () => {
    test("the same surface refuses, then admits, by grant alone", async ({ browser }) => {
        /*
         * Two principals differing ONLY in whether they hold `reports.write`. No grant row is edited
         * here and no clock advanced — the contrast IS the composition proof, and it fails if a role
         * title or portal admission is doing the deciding.
         */
        const before = await measurementCount();

        const denied = await signIn(browser, P.reader);
        expect((await configure(denied, "SHOULD NEVER PERSIST")).status()).toBe(403);
        expect(await measurementCount()).toBe(before);

        const admitted = await signIn(browser, P.writer);
        expect((await configure(admitted, `Cert W17 ${Date.now()}`)).status()).toBeLessThan(400);
        expect(await measurementCount()).toBe(before + 1);
    });
});
