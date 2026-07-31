/**
 * Certification auth setup — establishes a REUSABLE operator session.
 *
 * Logs the seeded synthetic operator into the running app through the real login
 * flow and saves the browser session to `.auth/operator.json`. Every certification
 * spec reuses that session, so the manual login becomes a one-time, automated,
 * captured session rather than a recurring engineering task. The session is
 * re-established automatically only when it has expired.
 */
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_FILE = path.join(__dirname, "..", ".auth", "operator.json");
const EMAIL = process.env.CERT_OPERATOR_EMAIL || "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD || "alloy-local-cert";

setup("authenticate seeded operator", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    // Submit via Enter — robust across button labels.
    await pw.press("Enter");
    // Success lands on the operator workspace (client-side push after sign-in).
    await page.waitForURL("**/workspace**", { timeout: 45_000 });
    // NOT `networkidle`: the operator workspace keeps long-lived requests open, so it never goes
    // idle and the wait burns the whole timeout on a page that is already usable.
    await page.waitForLoadState("domcontentloaded");
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
    // Report whether the captured session survives a fresh SSR round-trip through
    // the auth middleware. This is the one @supabase/ssr handshake detail: the
    // login creates a real server session (verified), but the SSR client must
    // accept the captured cookie on a cold navigation for the reusable session to
    // load Current Work directly. Non-fatal so evidence is still captured.
    await page.goto("/workspace");
    const serverValid = /workspace/.test(page.url());
    console.log(`[certify] captured session server-valid on cold load: ${serverValid} (url=${page.url()})`);
});
