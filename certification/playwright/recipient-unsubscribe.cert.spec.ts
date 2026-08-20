/**
 * Recipient-initiated Email unsubscribe — certified in a browser, against the real route
 * and the real database.
 *
 * The unit suite proves the token's security properties in isolation. It cannot prove the
 * three things that actually decide whether a recipient can get out of a mailing list:
 *
 *   1. the page opens with NO SESSION — an unsubscribe that redirects a parent to a login
 *      screen is not an unsubscribe, and nothing but a real unauthenticated browser
 *      context can demonstrate that;
 *   2. the GET does not mutate — mail clients and security scanners prefetch links, so a
 *      preference that changes on page load changes without the recipient asking;
 *   3. the POST reaches the canonical preference authority — the row and the audit event
 *      have to exist in the database afterwards, not merely in a mock.
 *
 * No Email is sent by this spec. The link is minted directly with the same secret the
 * server resolves, which is exactly what the outbound header builder does; certifying the
 * link does not require certifying delivery a second time.
 */

import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ORG = "00000000-0000-4000-8000-000000000001";
/** The recipient under test. guardian1 is left alone as an isolation control. */
const RECIPIENT = "00000000-0000-4000-8000-200000000002";
const CONTROL = "00000000-0000-4000-8000-200000000001";

/**
 * The cert environment sets none of the platform signing secrets, so the token module
 * falls back to its development secret. Minting with the same value here is what makes
 * this an end-to-end proof rather than a mock: the server verifies a signature it did not
 * produce and did not trust in advance.
 */
const SECRET = "unsubscribe-development-secret";

function mint(claims: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const sig = createHmac("sha256", SECRET).update(payload).digest().toString("base64url");
    return `${payload}.${sig}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

function token(over: Record<string, unknown> = {}): string {
    const iat = nowSec();
    return mint({ p: RECIPIENT, o: ORG, c: "email_marketing", v: 1, iat, exp: iat + 3600, ...over });
}

function sql(statement: string): string {
    return execFileSync(
        "docker",
        ["exec", "supabase_db_alloy-cert", "psql", "-U", "postgres", "-d", "postgres", "-tAc", statement],
        { encoding: "utf8" },
    ).trim();
}

const prefRow = (person: string) =>
    sql(
        `select coalesce(state,'')||'|'||coalesce(source,'')||'|'||coalesce(method,'')
         from communication_preferences
         where org_id='${ORG}' and person_id='${person}' and category='email_marketing'`,
    );

const eventCount = (person: string) =>
    Number(
        sql(
            `select count(*) from communication_preference_events
             where org_id='${ORG}' and person_id='${person}' and source='recipient_unsubscribe'`,
        ) || "0",
    );

/** Leave the shared cert tenant exactly as it was found. */
function resetRecipientState(): void {
    for (const person of [RECIPIENT, CONTROL]) {
        sql(`delete from communication_preference_events where org_id='${ORG}' and person_id='${person}' and source='recipient_unsubscribe'`);
        sql(`delete from communication_preferences where org_id='${ORG}' and person_id='${person}' and category='email_marketing'`);
    }
}

const unsubscribeUrl = (base: string, t: string) =>
    `${base}/api/communications/unsubscribe?t=${encodeURIComponent(t)}`;

/**
 * A browser with no storage state at all. The default cert context is signed in, and a
 * signed-in browser cannot prove that a stranger holding the link gets through.
 */
async function strangerPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    await page.context().clearCookies();
    return page;
}

test.describe("recipient-initiated Email unsubscribe", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test.beforeEach(() => resetRecipientState());
    test.afterAll(() => resetRecipientState());

    test("a stranger with no session reaches the confirmation page — no login wall", async ({ page, baseURL }) => {
        const response = await page.goto(unsubscribeUrl(String(baseURL), token()), { waitUntil: "domcontentloaded" });

        expect(response?.status(), "the unsubscribe page must answer 200 to an unauthenticated browser").toBe(200);
        expect(page.url(), "an unsubscribe link must never redirect to sign-in").not.toMatch(/login|signin|sign-in|auth/i);
        await expect(page.locator("h1")).toHaveText(/unsubscribe/i);
        await expect(page.locator("button[type=submit]")).toBeVisible();
    });

    test("the GET does NOT mutate — a mail-client prefetch changes nothing", async ({ page, baseURL }) => {
        expect(prefRow(RECIPIENT), "precondition: no preference recorded").toBe("");

        await page.goto(unsubscribeUrl(String(baseURL), token()), { waitUntil: "domcontentloaded" });
        // Load it a second time, as a scanner following the link would.
        await page.reload({ waitUntil: "domcontentloaded" });

        expect(prefRow(RECIPIENT), "viewing the page must not opt anybody out").toBe("");
        expect(eventCount(RECIPIENT), "viewing the page must not write a consent event").toBe(0);
    });

    test("confirming writes opted_out through the canonical authority, with recipient provenance", async ({ page, baseURL }) => {
        await page.goto(unsubscribeUrl(String(baseURL), token()), { waitUntil: "domcontentloaded" });
        await page.locator("button[type=submit]").click();

        await expect(page.locator("h1")).toHaveText(/you have been unsubscribed/i);
        // The confirmation must be honest about what still sends.
        await expect(page.locator("body")).toContainText(/essential messages/i);

        expect(prefRow(RECIPIENT), "the preference row must record the recipient as the actor").toBe(
            "opted_out|recipient_unsubscribe|email_link",
        );
        expect(eventCount(RECIPIENT), "a consent change with no audit trail is not a consent change").toBe(1);
    });

    test("ISOLATION — the other recipient in the same org is untouched", async ({ page, baseURL }) => {
        await page.goto(unsubscribeUrl(String(baseURL), token()), { waitUntil: "domcontentloaded" });
        await page.locator("button[type=submit]").click();
        await expect(page.locator("h1")).toHaveText(/you have been unsubscribed/i);

        expect(prefRow(CONTROL), "a token names one Person; nobody else may change").toBe("");
    });

    test("IDEMPOTENT — a second confirmation is not an error", async ({ page, baseURL }) => {
        const url = unsubscribeUrl(String(baseURL), token());
        for (const _pass of [1, 2]) {
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.locator("button[type=submit]").click();
            await expect(page.locator("h1")).toHaveText(/you have been unsubscribed/i);
        }
        expect(prefRow(RECIPIENT)).toBe("opted_out|recipient_unsubscribe|email_link");
    });

    test("a TAMPERED link is refused, and changes nothing", async ({ page, baseURL }) => {
        // Repoint the token at the control recipient — the exact attack the signature exists
        // to stop. The claims are edited but the signature is left as minted.
        const original = token();
        const [payload, sig] = original.split(".");
        const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
        claims.p = CONTROL;
        const forged = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;

        const response = await page.goto(unsubscribeUrl(String(baseURL), forged), { waitUntil: "domcontentloaded" });

        expect(response?.status()).toBe(400);
        await expect(page.locator("h1")).toHaveText(/no longer valid/i);
        expect(prefRow(CONTROL), "a forged link must not reach the person it names").toBe("");
        expect(prefRow(RECIPIENT)).toBe("");
    });

    test("an EXPIRED link says so, and blames nobody", async ({ page, baseURL }) => {
        const iat = nowSec() - 7200;
        const expired = token({ iat, exp: iat + 60 });

        const response = await page.goto(unsubscribeUrl(String(baseURL), expired), { waitUntil: "domcontentloaded" });

        expect(response?.status()).toBe(400);
        await expect(page.locator("body")).toContainText(/contact your school/i);
        expect(prefRow(RECIPIENT)).toBe("");
    });

    test("the URL carries no secret and no address", async ({ page, baseURL }) => {
        const url = unsubscribeUrl(String(baseURL), token());
        await page.goto(url, { waitUntil: "domcontentloaded" });

        expect(url).not.toContain(SECRET);
        expect(url).not.toContain("@");
        expect(url.toLowerCase()).not.toContain("example.invalid");
        // …and the rendered page does not put the address back either.
        await expect(page.locator("body")).not.toContainText("@example.invalid");
    });
});
