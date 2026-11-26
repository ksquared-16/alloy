/**
 * ACTION DEFINITIONS, MOUNTED — Settings → Actions, and the control beside the placement control.
 *
 * `ctx.role !== "admin"` stood on this mutation while the ACTION PLACEMENT control in the same
 * guided editor had already been decided on `business_process.configure`. One surface, two answers:
 * it admitted an administrator whose package withholds the key and refused a custom Process
 * Configurer who holds it. `ActionPlacementGuidedEditor` PATCHes the definition's operator label as
 * part of the guided flow, so this is the definition-editing control that surface actually invokes —
 * not the placement control the previous slice certified.
 *
 * The Activator is the sharp persona again, for the same reason and one level up: a role trusted to
 * switch a configuration live is not thereby trusted to decide what an Action IS, or to withdraw one
 * from every stage at once with `is_active`.
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
    configurer: "cert.bpconfig@northwind.invalid",
    activator: "cert.bpactivate@northwind.invalid",
    titular: "cert.bptitular@northwind.invalid",
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

let DEF_ID = "";
let ORIGINAL_LABEL = "";

test.beforeAll(async () => {
    const { data } = await sb
        .from("action_definitions")
        .select("id, label")
        .eq("org_id", ORG)
        .limit(1)
        .maybeSingle();
    test.skip(!data?.id, "the cert tenant has no org-owned Action definition to certify against");
    DEF_ID = String(data.id);
    ORIGINAL_LABEL = String((data as { label: string }).label ?? "");
});

/** Read the row straight out of Postgres; the API that wrote it cannot vouch for itself. */
async function definitionLabel(): Promise<string | null> {
    const { data } = await sb
        .from("action_definitions")
        .select("label")
        .eq("id", DEF_ID)
        .eq("org_id", ORG)
        .maybeSingle();
    return (data as { label: string | null } | null)?.label ?? null;
}

const rename = (api: APIRequestContext, label: string) =>
    api.patch(`/api/admin/action-definitions/${DEF_ID}`, { data: { label } });

test.describe("Action definitions mounted — the design owner may define", () => {
    test("a Business Process configurer renames the definition, and the database agrees", async ({ browser }) => {
        const api = await signIn(browser, P.configurer);
        const target = `${ORIGINAL_LABEL} ✓cert`.slice(0, 120);

        const res = await rename(api, target);
        expect(res.status(), "the configurer holds the owner key").toBeLessThan(400);
        expect(await definitionLabel(), "the change must be durable, not just a 200").toBe(target);

        // Put the tenant back the way it was found.
        await rename(api, ORIGINAL_LABEL);
        expect(await definitionLabel()).toBe(ORIGINAL_LABEL);
    });
});

test.describe("Action definitions mounted — who is refused, and nothing changes", () => {
    for (const [label, email] of [
        ["portal admission alone", P.portalOnly],
        ["a role LABELLED for Business Process holding no grant", P.titular],
        /*
         * The sharp case, one level up from the placement matrix. `business_process.activate` may
         * switch a configuration live; deciding what an Action IS — and `is_active`, which withdraws
         * it from every stage at once — is `configure`. The two stay independent.
         */
        ["a process ACTIVATOR who cannot configure", P.activator],
    ] as const) {
        test(`${label} cannot rename a definition`, async ({ browser }) => {
            const before = await definitionLabel();
            const api = await signIn(browser, email);
            const res = await rename(api, "SHOULD NEVER PERSIST");
            expect(res.status()).toBe(403);
            expect(await definitionLabel(), "a refusal must leave the row untouched").toBe(before);
        });
    }

    test("an Activator cannot withdraw an Action from every stage either", async ({ browser }) => {
        const { data: before } = await sb
            .from("action_definitions").select("is_active").eq("id", DEF_ID).eq("org_id", ORG).maybeSingle();
        const api = await signIn(browser, P.activator);
        const res = await api.patch(`/api/admin/action-definitions/${DEF_ID}`, { data: { is_active: false } });
        expect(res.status()).toBe(403);
        const { data: after } = await sb
            .from("action_definitions").select("is_active").eq("id", DEF_ID).eq("org_id", ORG).maybeSingle();
        expect((after as { is_active: boolean }).is_active).toBe((before as { is_active: boolean }).is_active);
    });
});

test.describe("Action definitions mounted — W-17 composition", () => {
    test("the same surface refuses, then admits, by grant alone", async ({ browser }) => {
        /*
         * Two principals differing ONLY in which Business Process key they hold. No grant row is
         * edited here and no clock advanced — the contrast IS the composition proof, and it fails if
         * a role title or portal admission is doing the deciding.
         */
        const denied = await signIn(browser, P.activator);
        expect((await rename(denied, "SHOULD NEVER PERSIST")).status()).toBe(403);
        expect(await definitionLabel()).toBe(ORIGINAL_LABEL);

        const target = `${ORIGINAL_LABEL} ✓w17`.slice(0, 120);
        const admitted = await signIn(browser, P.configurer);
        expect((await rename(admitted, target)).status()).toBeLessThan(400);
        expect(await definitionLabel()).toBe(target);

        await rename(admitted, ORIGINAL_LABEL);
        expect(await definitionLabel()).toBe(ORIGINAL_LABEL);
    });
});
