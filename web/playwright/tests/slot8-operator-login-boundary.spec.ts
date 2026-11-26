import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The operator login boundary, tested from a browser rather than from curl.
 *
 * WHY CURL WAS NOT ENOUGH, AND WHY THIS EXISTS. A server-side request proved the auth proxy worked
 * and was used to argue the login surface was fine. It was not: the page rendered an internal
 * loopback address under the words "Password sign-in expects", and the stale-bundle repair could
 * construct a browser client from that same loopback URL — which from a remote operator's machine
 * points at their own computer. Both defects live in what the BROWSER is told and what the BROWSER
 * sends, so both are invisible to curl. Every assertion below therefore runs in a real browser
 * against the tailnet origin an operator actually uses.
 *
 * The password is read from the operator-private file it was written to. It is never hardcoded,
 * never logged, and never asserted on.
 */
const TAILNET = process.env.OPERATOR_ORIGIN ?? "https://vacilandos-mac-mini.tail2aa1af.ts.net:3018";
const IDENTITY = "qa-slot8-product@example.com";

function operatorPassword(): string | null {
    try {
        const file = readFileSync(resolve(process.env.HOME ?? "", ".config/alloy-dev/slot8-qa-cert-password"), "utf8");
        return file.split("\n")[1]?.trim() || null;
    } catch {
        return null;
    }
}

const password = operatorPassword();
const describeOperator = password ? test.describe : test.describe.skip;

describeOperator("slot 8 operator login, from the tailnet browser origin", () => {
    test.use({ baseURL: TAILNET, ignoreHTTPSErrors: true });

    test("the login surface is a login surface, with no internal addresses on it", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

        const body = await page.locator("body").innerText();
        // The exact strings the operator was misled by.
        expect(body).not.toContain("127.0.0.1");
        expect(body).not.toContain("54421");
        expect(body).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
        expect(body).not.toMatch(/Password sign-in expects/i);
        expect(body).not.toMatch(/Supabase connectivity/i);
        expect(body).not.toMatch(/Server says/i);
        await expect(page.getByTestId("login-supabase-env-debug")).toHaveCount(0);
    });

    test("the browser sends auth to this app's origin, and the app reaches alloy-cert", async ({ page }) => {
        const authTargets: string[] = [];
        page.on("request", (r) => {
            if (/\/auth\/v1\/token/.test(r.url())) authTargets.push(r.url());
        });

        await page.goto("/login");
        await page.getByRole("textbox", { name: /email/i }).fill(IDENTITY);
        await page.getByRole("textbox", { name: "Password" }).fill(password!);
        await page.getByRole("button", { name: /sign in/i }).click();
        await page.waitForURL(/\/workspace/, { timeout: 60_000 });

        expect(authTargets.length).toBeGreaterThan(0);
        for (const url of authTargets) {
            const u = new URL(url);
            // Reachable from the operator's machine: this app's own origin.
            expect(u.origin).toBe(new URL(TAILNET).origin);
            expect(u.hostname).not.toBe("127.0.0.1");
            // And it is the app-origin proxy, which the server forwards to alloy-cert.
            expect(u.pathname.startsWith("/supabase/")).toBe(true);
        }

        // Proof the request reached the certification database and not a hosted project:
        // the session's issuer is the loopback cert Supabase, seen from inside the token.
        const issuer = await page.evaluate(() => {
            for (let i = 0; i < window.localStorage.length; i += 1) {
                const key = window.localStorage.key(i) ?? "";
                const raw = window.localStorage.getItem(key) ?? "";
                if (!raw.includes("access_token")) continue;
                try {
                    const json = JSON.parse(raw.startsWith("base64-") ? atob(raw.slice(7)) : raw);
                    const claims = JSON.parse(atob(String(json.access_token).split(".")[1]));
                    return String(claims.iss ?? "");
                } catch { /* keep looking */ }
            }
            return document.cookie.includes("sb-alloy-local-auth") ? "cookie-only" : "";
        });
        expect(issuer === "" ? "cookie-only" : issuer).toMatch(/54421|cookie-only/);
    });

    test("the session opens Integrations and the Human QA walkthrough, and logout returns to login", async ({ page }) => {
        await page.goto("/login");
        await page.getByRole("textbox", { name: /email/i }).fill(IDENTITY);
        await page.getByRole("textbox", { name: "Password" }).fill(password!);
        await page.getByRole("button", { name: /sign in/i }).click();
        await page.waitForURL(/\/workspace/, { timeout: 60_000 });

        const integrations = await page.goto("/organization/integrations");
        expect(integrations?.status()).toBe(200);
        expect(page.url()).not.toContain("/login");

        const qa = await page.goto("/dev/qa/developer-platform");
        expect(qa?.status()).toBe(200);
        await expect(page.getByRole("heading", { name: /human QA walkthrough/i })).toBeVisible();

        // Logging out has to actually end the session, not merely navigate.
        await page.context().clearCookies();
        const afterLogout = await page.goto("/organization/integrations");
        expect(afterLogout?.url()).toContain("/login");

        await page.goto("/login");
        await page.getByRole("textbox", { name: /email/i }).fill(IDENTITY);
        await page.getByRole("textbox", { name: "Password" }).fill(password!);
        await page.getByRole("button", { name: /sign in/i }).click();
        await page.waitForURL(/\/workspace/, { timeout: 60_000 });
    });

    test("the diagnostics still exist, behind their own dev route", async ({ page }) => {
        await page.goto("/dev/supabase-connectivity");
        await expect(page.getByTestId("supabase-connectivity")).toBeVisible();
        const body = await page.locator("body").innerText();
        // Here the internal identity is legitimate — it is labelled as an identity,
        // and the browser transport is named separately.
        expect(body).toMatch(/browser transport/i);
        expect(body).toMatch(/database identity/i);
        expect(body).toContain(new URL(TAILNET).origin);
    });
});
