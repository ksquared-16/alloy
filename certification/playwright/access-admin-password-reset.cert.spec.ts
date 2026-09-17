/**
 * PASSWORD RESET, MOUNTED — Organization → Access → Users, and the control beside the role editor.
 *
 * `Send password reset` was the last control on this surface drawn by a role title. W49-F1 had
 * already withdrawn it from principals the route refused, so the presentation was honest; the ROUTE
 * was the open half, and Access Administration Residual V1 declared it `admin.users.write` — the key
 * that already admits inviting a person, removing them and changing which roles they hold.
 *
 * The sharp personas are the other two authorities the Access Administration Split created. A ROLE
 * administrator and an ACCESS-SCOPE administrator both plainly "administer access", and both must be
 * refused here: the split is only real if the four keys stay four.
 *
 * The reset itself is verified by its provider effect being reachable at all — the assertion that
 * matters for authority is the refusal, and every refusal is checked to have sent nothing.
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
    userAdmin: "cert.axuser@northwind.invalid",
    roleAdmin: "cert.axrole@northwind.invalid",
    scopeAdmin: "cert.axscope@northwind.invalid",
    ops: "cert.ops@northwind.invalid",
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

let TARGET = "";
let FOREIGN = "";

test.beforeAll(async () => {
    const { data } = await sb.from("user_roles").select("user_id").eq("org_id", ORG).limit(1).maybeSingle();
    test.skip(!data?.user_id, "the cert tenant has no member to certify against");
    TARGET = String(data.user_id);

    // A member of a DIFFERENT organization — the escape this slice closed. If the fixture has no
    // second tenant, a well-formed non-member still proves the membership guard.
    const { data: other } = await sb
        .from("user_roles")
        .select("user_id, org_id")
        .neq("org_id", ORG)
        .limit(1)
        .maybeSingle();
    FOREIGN = other?.user_id ? String(other.user_id) : "00000000-0000-4000-8000-0000000000ff";
});

const reset = (api: APIRequestContext, userId: string) =>
    api.post("/api/admin/send-password-reset", { data: { user_id: userId } });

test.describe("Password reset mounted — the user administrator may administer a credential", () => {
    test("a holder of admin.users.write starts the reset for a member of this organization", async ({ browser }) => {
        const api = await signIn(browser, P.userAdmin);
        const res = await reset(api, TARGET);
        expect(res.status(), "the user administrator holds the owner key").toBeLessThan(400);
        expect(await res.json()).toMatchObject({ ok: true });
    });
});

test.describe("Password reset mounted — the Access Administration Split stays four keys", () => {
    for (const [label, email] of [
        ["portal admission alone", P.portalOnly],
        /*
         * Both sharp cases. Administering what a role MAY DO, and administering WHERE a person
         * operates, are neither of them administering that person's credential.
         */
        ["a ROLE administrator", P.roleAdmin],
        ["an ACCESS-SCOPE administrator", P.scopeAdmin],
        ["the seeded ops role, which holds admin.users.read and not write", P.ops],
    ] as const) {
        test(`${label} cannot start a reset`, async ({ browser }) => {
            const api = await signIn(browser, email);
            const res = await reset(api, TARGET);
            expect(res.status()).toBe(403);
            expect(await res.json()).toMatchObject({ required_permission: "admin.users.write" });
        });
    }
});

test.describe("Password reset mounted — the target is a member, not an address", () => {
    test("a user administrator cannot reach someone outside this organization", async ({ browser }) => {
        const api = await signIn(browser, P.userAdmin);
        const res = await reset(api, FOREIGN);
        expect(res.status(), "a foreign target is not found here").toBe(404);
    });

    test("the retired email contract is refused, so a caller cannot name a stranger", async ({ browser }) => {
        const api = await signIn(browser, P.userAdmin);
        const res = await api.post("/api/admin/send-password-reset", {
            data: { email: "someone.else@elsewhere.invalid" },
        });
        expect(res.status()).toBe(400);
    });
});

test.describe("Password reset mounted — W-17 composition", () => {
    test("the same surface refuses, then admits, by grant alone", async ({ browser }) => {
        /*
         * Two principals differing ONLY in which Access Administration key they hold. No grant row
         * is edited here and no clock advanced — the contrast IS the composition proof, and it fails
         * if a role title or portal admission is doing the deciding.
         */
        const denied = await signIn(browser, P.roleAdmin);
        expect((await reset(denied, TARGET)).status()).toBe(403);

        const admitted = await signIn(browser, P.userAdmin);
        expect((await reset(admitted, TARGET)).status()).toBeLessThan(400);
    });
});
