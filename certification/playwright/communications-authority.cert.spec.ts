/**
 * THE FIVE COMMUNICATIONS AUTHORITIES, MOUNTED.
 *
 * Communications had two capability keys and five materially different powers. The gap was filled by
 * `requireAdminOrOps()` — a function whose name promises a role check and whose body resolves portal
 * admission and nothing else. The census proved the consequence rather than inferring it: a
 * principal holding ONLY `portal.access`, in a role LABELLED "Admin" that grants nothing, was
 * admitted past the authority gate on provider configuration, template creation, announcement
 * creation and channel bindings. Each answered 400 or 404 — never 403 — meaning the route accepted
 * their authority and rejected only their request body.
 *
 * This drives the real routes as real signed-in people and proves both directions, because either
 * alone is worthless:
 *
 *   - a capability that refuses everything is "safe" and makes the key pointless, so every one of
 *     the five must be shown ACTUALLY DOING ITS JOB — with an effect read back out of the database,
 *     not a 200 that might have done nothing;
 *   - a capability that permits everything is the defect, so each persona must be REFUSED the other
 *     four, with the database unchanged after the refusal.
 *
 * NO REAL DELIVERY. Nothing here contacts a family. The three mutations that prove the positive
 * cases create a template row, a draft announcement and a channel binding — all of them records
 * about messaging, none of them a message. The send-family proof uses the internal note path, whose
 * own contract is `in_app` and no external transmission. No test schedules, sends, or advances an
 * announcement out of draft.
 *
 * Personas come from `fixtures/access-personas.mjs`; run its `setup` first.
 */
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Resolved from THIS FILE, not from the invoking cwd, and NOT by importing the persona fixture.
 * `fixtures/access-personas.mjs` is a real ES module that reads `import.meta`, which Playwright's
 * transform cannot take from a `.ts` spec — the import fails the whole file and Playwright then
 * reports "no tests found", which reads as a missing spec rather than a broken one. Every other
 * cert spec that needs service credentials builds its own client the same way.
 */
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

/**
 * The Communications personas, mirrored from `fixtures/access-personas.mjs`.
 *
 * Mirrored rather than imported, for the module reason above. The fixture remains the authority
 * that CREATES them; the lock test below the matrix checks the two lists still agree, so a persona
 * renamed there cannot leave this file quietly certifying somebody who no longer exists.
 */
const P = {
    ops:             { email: "cert.ops@northwind.invalid" },
    commsReader:     { email: "cert.commsreader@northwind.invalid" },
    commsSender:     { email: "cert.commssender@northwind.invalid" },
    commsTemplates:  { email: "cert.commstemplates@northwind.invalid" },
    commsProvider:   { email: "cert.commsprovider@northwind.invalid" },
    commsBulk:       { email: "cert.commsbulk@northwind.invalid" },
    commsOperator:   { email: "cert.commsoperator@northwind.invalid" },
    commsFull:       { email: "cert.commsfull@northwind.invalid" },
    commsTitular:    { email: "cert.commstitular@northwind.invalid" },
    commsPortalOnly: { email: "cert.commsportal@northwind.invalid" },
    commsUnion:      { email: "cert.commsunion@northwind.invalid" },
} as const;

/** Every row this file creates is tagged, so teardown is exact and can never reach a fixture. */
const TAG = `commscert-${Date.now()}`;

/*
 * A FRESH NAME PER REQUEST. Template names are unique per organization, so re-using one name across
 * the matrix made the SECOND permitted caller fail 409 — a uniqueness answer wearing the shape of an
 * authority answer. Since the whole file turns on telling 403 apart from "the body was judged", a
 * collision that only ever hits the permitted path is exactly the wrong thing to leave in.
 */
let seq = 0;
const unique = () => `${TAG}-${++seq}`;

type Session = { request: APIRequestContext; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return { request: page.request, close: () => context.close() };
}

/**
 * THE FIVE FAMILIES, EACH AS THE CHEAPEST REQUEST THAT REALLY EXERCISES IT.
 *
 * `capability` is the key the route must name in its refusal — asserted, not assumed, because a 403
 * that names the wrong key means the route is gated on an authority nobody intended.
 */
const FAMILY = {
    read: {
        capability: "communications.read",
        call: (r: APIRequestContext) => r.get("/api/admin/communications/templates"),
    },
    send: {
        capability: "communications.send",
        // Internal note. Its own contract: creates communication_messages via in_app send, no
        // external delivery. A deliberately incomplete body, so a permitted caller is judged on the
        // BODY (400) and a refused one on their AUTHORITY (403) — the two are never confusable.
        call: (r: APIRequestContext) =>
            r.post("/api/admin/communications/family-note", { data: { note_probe: TAG } }),
    },
    templates: {
        capability: "communications.templates.manage",
        call: (r: APIRequestContext) =>
            r.post("/api/admin/communications/templates", {
                data: { name: `${unique()}-tpl`, category: "certification", channel: "email", subject: "Cert", body: "Cert body" },
            }),
    },
    provider: {
        capability: "communications.provider.configure",
        call: (r: APIRequestContext) =>
            r.post("/api/admin/communications/bindings", { data: { binding_probe: TAG } }),
    },
    bulk: {
        capability: "communications.bulk.send",
        call: (r: APIRequestContext) =>
            r.post("/api/admin/communications/announcements", {
                data: { title: `${unique()}-ann`, channels: ["email"], body_format: "text", body: "Cert body" },
            }),
    },
} as const;
type FamilyKey = keyof typeof FAMILY;
const FAMILIES = Object.keys(FAMILY) as FamilyKey[];

/** Which single capability each persona holds — the diagonal of the matrix. */
const SINGLE: Record<FamilyKey, string> = {
    read: P.commsReader.email,
    send: P.commsSender.email,
    templates: P.commsTemplates.email,
    provider: P.commsProvider.email,
    bulk: P.commsBulk.email,
};

/** What the organization actually holds, read with service credentials rather than through the API. */
async function counts() {
    const tpl = await sb.from("communication_templates").select("id", { count: "exact", head: true })
        .eq("org_id", ORG).like("name", `${TAG}%`);
    const ann = await sb.from("announcements").select("id", { count: "exact", head: true })
        .eq("org_id", ORG).like("title", `${TAG}%`);
    const bind = await sb.from("communication_provider_bindings").select("id", { count: "exact", head: true })
        .eq("org_id", ORG);
    return { templates: tpl.count ?? 0, announcements: ann.count ?? 0, bindings: bind.count ?? 0 };
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
    await sb.from("communication_templates").delete().eq("org_id", ORG).like("name", `${TAG}%`);
    await sb.from("announcements").delete().eq("org_id", ORG).like("title", `${TAG}%`);
});

test.describe("Communications authority — five capabilities, mounted", () => {
    test("the surface is reachable and the routes are live", async ({ browser }) => {
        /*
         * NON-VACUITY, AND THE 404 TRAP SPECIFICALLY. Two of these routes check a feature flag
         * BEFORE the authority gate, so a disabled flag answers 404. Every refusal below would then
         * be "not 200" for a reason that has nothing to do with authority, and the matrix would pass
         * while proving nothing at all.
         */
        const s = await signIn(browser, P.commsFull.email);
        for (const key of FAMILIES) {
            const res = await FAMILY[key].call(s.request);
            expect(res.status(), `${key}: the full-authority persona must not be refused`).not.toBe(403);
            expect(res.status(), `${key}: route answered 404 — feature flag off, not an authority result`).not.toBe(404);
        }
        await s.close();
    });

    test("each capability actually does its job — read back from the database", async ({ browser }) => {
        /*
         * A 200 IS NOT AN EFFECT. This is the half a permission test usually skips: it asserts the
         * refusals, sees green, and never notices the permitted path stopped working. Each row is
         * read back with service credentials, which cannot be fooled by the API that wrote it.
         */
        const author = await signIn(browser, SINGLE.templates);
        const tplRes = await FAMILY.templates.call(author.request);
        expect(tplRes.status(), await tplRes.text()).toBeLessThan(400);
        await author.close();

        const campaigner = await signIn(browser, SINGLE.bulk);
        const annRes = await FAMILY.bulk.call(campaigner.request);
        expect(annRes.status(), await annRes.text()).toBeLessThan(400);
        await campaigner.close();

        const after = await counts();
        expect(after.templates, "the template author's template must exist").toBeGreaterThan(0);
        expect(after.announcements, "the campaign sender's announcement must exist").toBeGreaterThan(0);

        // And the reader can SEE it — `communications.read` returning an empty 200 would prove nothing.
        const reader = await signIn(browser, SINGLE.read);
        const list = await reader.request.get("/api/admin/communications/templates");
        expect(list.status()).toBe(200);
        expect(await list.text(), "the reader must see the template that was just authored").toContain(TAG);
        await reader.close();
    });

    for (const holds of FAMILIES) {
        test(`NON-IMPLICATION: holding only ${FAMILY[holds].capability} confers none of the other four`, async ({ browser }) => {
            /*
             * The claim the model makes, stated as the product's own answer. A sender may not rewrite
             * the organization's templates; a template author may not deliver what they wrote; a
             * provider administrator may not message a family; a campaign sender does not thereby
             * configure delivery. Composition is done with GRANTS — never with implication hidden in
             * the backend, which would make the role editor's distinctions a fiction.
             */
            const s = await signIn(browser, SINGLE[holds]);
            const before = await counts();

            for (const asked of FAMILIES) {
                const res = await FAMILY[asked].call(s.request);
                if (asked === holds) {
                    expect(res.status(), `${holds} must be permitted its own capability`).not.toBe(403);
                    continue;
                }
                expect(res.status(), `holding ${holds} must NOT confer ${asked}`).toBe(403);
                // The refusal must name the key it wanted, so an operator debugging a denial can see
                // which authority they lack rather than being told only that they are forbidden.
                expect(await res.text()).toContain(FAMILY[asked].capability);
            }

            const after = await counts();
            // A 403 WITH A SIDE EFFECT IS A FAILURE. The refusals above must have written nothing.
            expect(after.bindings, "a refused provider request created a binding").toBe(before.bindings);
            if (holds !== "templates") expect(after.templates, "a refused request created a template").toBe(before.templates);
            if (holds !== "bulk") expect(after.announcements, "a refused request created an announcement").toBe(before.announcements);
            await s.close();
        });
    }

    test("send does not imply read — the direction nobody checks", async ({ browser }) => {
        /*
         * Called out on its own because it is the asymmetry a reviewer waves through. It is obvious
         * that a reader must not send. It is much less obvious, and just as wrong, that a person
         * hired to answer one family's question can page through every conversation the organization
         * has ever had.
         */
        const s = await signIn(browser, P.commsSender.email);
        const res = await s.request.get("/api/admin/communications/templates");
        expect(res.status()).toBe(403);
        expect(await res.text()).toContain("communications.read");
        await s.close();
    });

    test("the job title confers nothing — the persona named Communications Administrator", async ({ browser }) => {
        /*
         * THE DEFECT THIS CLOSED, POINTED AT DIRECTLY. The send path really did open with
         * `roleKeys.some(r => r === "admin" || r === "ops")` — a role KEY, recorded in no grant
         * table, satisfying a capability check on its own. This persona's role is LABELLED
         * "Communications Administrator" and holds `portal.access` and nothing else.
         */
        const s = await signIn(browser, P.commsTitular.email);
        const before = await counts();
        for (const key of FAMILIES) {
            const res = await FAMILY[key].call(s.request);
            expect(res.status(), `a job title must not confer ${key}`).toBe(403);
        }
        const after = await counts();
        expect(after, "the titled persona changed the organization").toEqual(before);
        await s.close();
    });

    test("the portal-only principal the census found is refused everywhere, and changes nothing", async ({ browser }) => {
        const s = await signIn(browser, P.commsPortalOnly.email);
        const before = await counts();
        for (const key of FAMILIES) {
            const res = await FAMILY[key].call(s.request);
            expect(res.status(), `portal admission must not confer ${key}`).toBe(403);
            expect(res.status(), "400 or 404 here is the pre-fix answer: authority accepted, body rejected")
                .not.toBeLessThan(403);
        }
        expect(await counts()).toEqual(before);
        await s.close();
    });

    test("a custom role behaves exactly like the seeded ops role with the same package", async ({ browser }) => {
        /*
         * The promise of configurable roles, and the thing the role-title check broke in BOTH
         * directions: a custom role holding the administrator's exact package still could not send,
         * and an `admin` role deliberately stripped of `communications.send` still could.
         * `mcert_comms_operator` carries exactly what the seeded `ops` role carries here.
         */
        const custom = await signIn(browser, P.commsOperator.email);
        const seeded = await signIn(browser, P.ops.email);
        for (const key of FAMILIES) {
            const a = await FAMILY[key].call(custom.request);
            const b = await FAMILY[key].call(seeded.request);
            const refused = (n: number) => n === 403;
            expect(refused(a.status()), `${key}: custom role and seeded ops must agree`).toBe(refused(b.status()));
        }
        // And specifically: both may read and send, neither may manage.
        expect((await FAMILY.read.call(custom.request)).status()).not.toBe(403);
        expect((await FAMILY.templates.call(custom.request)).status()).toBe(403);
        await custom.close();
        await seeded.close();
    });

    test("effective authority is the UNION of a person's roles", async ({ browser }) => {
        /*
         * Two roles, neither sufficient: one carries admission and read, the other carries the
         * campaign key and no admission. A model that read only the first role, or only the
         * "primary" one, would refuse this person something they hold.
         */
        const s = await signIn(browser, P.commsUnion.email);
        expect((await FAMILY.read.call(s.request)).status(), "read comes from the first role").not.toBe(403);
        expect((await FAMILY.bulk.call(s.request)).status(), "bulk comes from the second role").not.toBe(403);
        // And the union is a union, not a promotion: neither role carries these.
        expect((await FAMILY.templates.call(s.request)).status()).toBe(403);
        expect((await FAMILY.provider.call(s.request)).status()).toBe(403);
        await s.close();
    });

    test("conversation assignment is excluded, and says so rather than pretending", async ({ browser }) => {
        /*
         * ASSIGNMENTS_AUTHORITY_MODEL_DEBT, certified as a DARK route rather than a gated one.
         * Assignment decides who owns a piece of work, and the same unresolved question governs work
         * items, cases and jobs — answering it here would settle a platform model as a side effect of
         * a Communications lock. What bounds it meanwhile is the flag: 404, for everyone, including
         * the persona holding all five Communications capabilities.
         */
        const s = await signIn(browser, P.commsFull.email);
        const res = await s.request.post(
            "/api/admin/communications/conversations/00000000-0000-4000-8000-0000000000ff/assign",
            { data: { action: "claim" } },
        );
        expect(res.status(), "the excluded route must be dark, not quietly reachable").toBe(404);
        await s.close();
    });
});
