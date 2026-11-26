/**
 * ACTION PLACEMENTS, MOUNTED — Settings → Actions, decided by the key that already owned it.
 *
 * `ctx.role !== "admin"` stood on these three mutations. It admitted an admin whose package
 * withholds `business_process.configure` and refused a custom Process Configurer who holds it —
 * while the SAME `action_placements` rows were already being authored through the Lifecycle actions
 * matrix under that capability. Two doors to one configuration, disagreeing.
 *
 * The personas that matter are the plausible-but-wrong ones, and the Activator is the sharpest: a
 * role trusted to switch a configuration live is not thereby trusted to design it. `configure` and
 * `activate` are deliberately independent, and this proves the split holds on this surface.
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

let PLACEMENT_ID = "";
let ORIGINAL_ACTIVE: boolean | null = null;

test.beforeAll(async () => {
    const { data } = await sb
        .from("action_placements")
        .select("id, is_active")
        .eq("org_id", ORG)
        .limit(1)
        .maybeSingle();
    test.skip(!data?.id, "the cert tenant has no action placement to certify against");
    PLACEMENT_ID = String(data.id);
    ORIGINAL_ACTIVE = (data as { is_active: boolean | null }).is_active;
});

/** Read the row straight out of Postgres; the API that wrote it cannot vouch for itself. */
async function placementActive(): Promise<boolean | null> {
    const { data } = await sb
        .from("action_placements")
        .select("is_active")
        .eq("id", PLACEMENT_ID)
        .eq("org_id", ORG)
        .maybeSingle();
    return (data as { is_active: boolean | null } | null)?.is_active ?? null;
}

const editPlacement = (api: APIRequestContext, isActive: boolean) =>
    api.patch(`/api/admin/action-placements/${PLACEMENT_ID}`, { data: { is_active: isActive } });

test.describe("Action Placements mounted — the owner may configure", () => {
    test("a Business Process configurer flips a placement, and the database agrees", async ({ browser }) => {
        const api = await signIn(browser, P.configurer);
        const before = await placementActive();
        const target = !(before ?? true);

        const res = await editPlacement(api, target);
        expect(res.status(), "the configurer holds the owner key").toBeLessThan(400);
        expect(await placementActive(), "the change must be durable, not just a 200").toBe(target);

        // Put the tenant back the way it was found.
        await editPlacement(api, ORIGINAL_ACTIVE ?? true);
        expect(await placementActive()).toBe(ORIGINAL_ACTIVE ?? true);
    });
});

test.describe("Action Placements mounted — who is refused, and nothing changes", () => {
    for (const [label, email] of [
        ["portal admission alone", P.portalOnly],
        ["a role LABELLED for Business Process holding no grant", P.titular],
        /*
         * The sharpest case. `business_process.activate` is trusted to switch a configuration live;
         * designing which actions a stage offers is `configure`. The two are deliberately
         * independent, and an Activator must be refused here.
         */
        ["a process ACTIVATOR who cannot configure", P.activator],
    ] as const) {
        test(`${label} cannot change a placement`, async ({ browser }) => {
            const before = await placementActive();
            const api = await signIn(browser, email);
            const res = await editPlacement(api, !(before ?? true));
            expect(res.status()).toBe(403);
            expect(await placementActive(), "a refusal must leave the row untouched").toBe(before);
        });
    }
});

test.describe("Action Placements mounted — create and remove carry the same owner", () => {
    test("an Activator is refused on create and on remove", async ({ browser }) => {
        const api = await signIn(browser, P.activator);
        const create = await api.post("/api/admin/action-placements", {
            data: { action_definition_id: PLACEMENT_ID, surface: "record_header", slot: "primary" },
        });
        expect(create.status()).toBe(403);
        const remove = await api.delete(`/api/admin/action-placements/${PLACEMENT_ID}`);
        expect(remove.status()).toBe(403);
        // The row the DELETE named must still be there.
        expect(await placementActive()).not.toBeNull();
    });
});

test.describe("Action Placements mounted — W-17 composition", () => {
    test("the same principal is refused, then admitted, by grant alone", async ({ browser }) => {
        /*
         * Two principals differing ONLY in whether they hold `business_process.configure`: the
         * Activator holds portal admission and the sibling BP key, the Configurer holds the owner.
         * No grant row is edited here and no clock advanced — the contrast IS the composition
         * proof, and it fails if a role title or portal admission is doing the deciding.
         */
        const before = await placementActive();

        const denied = await signIn(browser, P.activator);
        expect((await editPlacement(denied, !(before ?? true))).status()).toBe(403);
        expect(await placementActive()).toBe(before);

        const admitted = await signIn(browser, P.configurer);
        expect((await editPlacement(admitted, !(before ?? true))).status()).toBeLessThan(400);
        expect(await placementActive()).toBe(!(before ?? true));

        await editPlacement(admitted, ORIGINAL_ACTIVE ?? true);
        expect(await placementActive()).toBe(ORIGINAL_ACTIVE ?? true);
    });
});
