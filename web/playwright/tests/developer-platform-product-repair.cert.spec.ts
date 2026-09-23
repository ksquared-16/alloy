import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Mounted certification of the Developer Platform product repair.
 *
 * Three defects, each proven here in a real browser on the slot-8 certification origin: the
 * documentation destinations that answered 404, the documentation tab with no way back, and the
 * one-time secret injected into the middle of a page instead of presented as a decision.
 *
 * ── WHAT THIS DOES TO THE FIXTURE, AND WHY ──
 *
 * Certifying the credential modals requires issuing and rotating a real credential; there is no way
 * to photograph a one-time secret without producing one. It is done on ONE fixture installation and
 * the fixture is rebuilt to its canonical state at the end, so the environment the operator reviews
 * is the environment the instrument defines. It deliberately does NOT create an installation: an
 * application with any installation row is permanently "already connected", which would leave the
 * Add Integration wizard unexercisable for the operator.
 *
 * Nothing here touches Human QA state — that lives in browser storage under its own key, in the
 * operator's own profile, and no test in this file reads or writes it.
 */
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3018";
const IDENTITY = "qa-slot8-product@example.com";
const SHOTS = resolve(process.env.CERT_EVIDENCE_DIR ?? "playwright/evidence/developer-platform-product-repair");
const DOCS = "/organization/integrations/documentation";

/** The installation the credential modals are exercised on: it proves scope refusal, not credentials. */
const CREDENTIAL_FIXTURE = "QA Integration — No location capability";

function operatorPassword(): string | null {
    try {
        return readFileSync(resolve(process.env.HOME ?? "", ".config/alloy-dev/slot8-qa-cert-password"), "utf8")
            .split("\n")[1]?.trim() || null;
    } catch {
        return null;
    }
}

const password = operatorPassword();
const describeMounted = password ? test.describe : test.describe.skip;

mkdirSync(SHOTS, { recursive: true });

async function signIn(page: Page) {
    await page.goto(`${ORIGIN}/login`);
    if (!/\/login/.test(page.url())) return;
    await page.getByRole("textbox", { name: /email/i }).fill(IDENTITY);
    await page.getByRole("textbox", { name: "Password" }).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 90_000 });
}

/** The assistant is a global overlay; it would sit on top of every screenshot. */
async function dismissAssistant(page: Page) {
    for (const region of [
        page.getByRole("contentinfo", { name: /assistant/i }),
        page.getByRole("complementary", { name: /assistant/i }),
    ]) {
        if (await region.count()) {
            const close = region.first().getByRole("button", { name: "Close", exact: true });
            if (await close.count()) await close.first().click().catch(() => {});
        }
    }
}

async function shoot(page: Page, name: string) {
    /*
     * Do not go looking for the assistant while a modal is open. `aria-modal="true"` takes
     * everything outside the dialog out of the accessibility tree, so a role query for the
     * assistant retries until it times out — and the dialog is drawn above the assistant anyway,
     * which is the whole point of the nested-overlay z-index.
     */
    const modalOpen = await page.getByTestId("credential-secret-reveal").count();
    if (!modalOpen) await dismissAssistant(page);
    await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true });
}

async function openCredentialFixture(page: Page) {
    await page.goto(`${ORIGIN}/organization/integrations`);
    await expect(page.getByTestId("integrations-list")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button").filter({ hasText: CREDENTIAL_FIXTURE }).first().click();
    await expect(page.getByTestId("installation-credentials")).toBeVisible({ timeout: 30_000 });
}

describeMounted("Developer Platform product repair — mounted certification", () => {
    test.use({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
    test.describe.configure({ mode: "serial" });

    // ── SLICE A: every destination resolves ────────────────────────────────────
    test("A — every visible documentation destination returns 200", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}${DOCS}`);
        await expect(page.getByTestId("documentation-landing")).toBeVisible({ timeout: 30_000 });

        // Read the destinations off the rendered page rather than from a list in this test: what
        // must resolve is whatever the product actually shows, not what the spec remembers.
        const hrefs = await page.evaluate(() =>
            [...document.querySelectorAll("a[href]")]
                .map((a) => a.getAttribute("href") ?? "")
                .filter((h) => h.startsWith("/organization/integrations") || h.includes("openapi")));
        const destinations = [...new Set(hrefs)];
        expect(destinations.length).toBeGreaterThan(5);

        for (const href of destinations) {
            const response = await page.request.get(`${ORIGIN}${href}`);
            expect(response.status(), href).toBe(200);
        }

        // And the ones the rail promises, navigated for real.
        for (const slug of ["getting-started", "locations", "conventions", "specification", "api-reference"]) {
            const response = await page.goto(`${ORIGIN}${DOCS}/${slug}`, { waitUntil: "domcontentloaded" });
            expect(response?.status(), slug).toBe(200);
            await expect(page.locator("h1").first(), slug).toBeVisible();
        }

        await page.goto(`${ORIGIN}${DOCS}`);
        await shoot(page, "01-documentation-landing");
    });

    test("A2 — a slug with no published document is a real 404, like the rest of Alloy", async ({ page }) => {
        await signIn(page);
        /*
         * Navigated, not fetched. The browser's navigation status is the one a reader and a monitor
         * both see; an RSC payload fetch for the same address answers differently and would have
         * certified the wrong thing.
         */
        for (const slug of ["08-slice-b2-external-boundary", "authentication", "nonsense-xyz"]) {
            const response = await page.goto(`${ORIGIN}${DOCS}/${slug}`, { waitUntil: "domcontentloaded" });
            expect(response?.status(), slug).toBe(404);
        }
    });

    // ── SLICE E: the API Reference ─────────────────────────────────────────────
    test("E — the API Reference renders the three implemented operations", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}${DOCS}/api-reference`);
        await expect(page.getByTestId("api-reference")).toBeVisible({ timeout: 30_000 });

        for (const id of ["issueAccessToken", "getContext", "listLocations"]) {
            await expect(page.getByTestId(`api-operation-${id}`), id).toBeVisible();
        }
        // The method badge and the path are separate elements, so innerText puts a newline between
        // them. Collapse whitespace before matching a "METHOD /path" pair.
        const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        expect(body).toContain("POST /api/v1/oauth/token");
        expect(body).toContain("GET /api/v1/context");
        expect(body).toContain("GET /api/v1/locations");
        expect(body).not.toContain("/api/v1/attendance");
        // Required scope, parameters and errors are present — the reference is usable, not a stub.
        expect(body).toContain("locations.read");
        expect(body).toMatch(/cursor/);
        expect(body).toMatch(/\b429\b/);
        await expect(page.getByTestId("doc-code-copy").first()).toBeVisible();

        // The governed document itself is still reachable, and still governed.
        const raw = await page.request.get(`${ORIGIN}/api/admin/integrations/openapi`);
        expect(raw.status()).toBe(200);
        const spec = await raw.json() as { paths: Record<string, Record<string, unknown>> };
        const operations = Object.entries(spec.paths).flatMap(([route, ops]) =>
            Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
                .map((m) => `${m.toUpperCase()} ${route}`));
        expect(operations.sort()).toEqual([
            "GET /api/v1/context",
            "GET /api/v1/locations",
            "POST /api/v1/oauth/token",
        ]);

        await shoot(page, "03-api-reference");
    });

    // ── SLICE B + G: new tab, and the way back ─────────────────────────────────
    test("B — documentation opens in a new tab and offers the way back", async ({ page, context }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization/integrations`);
        await expect(page.getByTestId("integrations-list")).toBeVisible({ timeout: 30_000 });
        await page.getByTestId("integrations-list").getByRole("button").first().click();
        await expect(page.getByTestId("installation-developer-details")).toBeVisible({ timeout: 30_000 });

        const link = page.getByTestId("developer-documentation-link");
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);

        const [docs] = await Promise.all([context.waitForEvent("page"), link.click()]);
        await docs.waitForLoadState("domcontentloaded");
        await expect(docs).toHaveURL(new RegExp(DOCS));

        // The Installation tab is exactly where it was.
        await expect(page.getByTestId("installation-developer-details")).toBeVisible();

        // Back to Integrations returns, in the documentation tab.
        const back = docs.getByTestId("documentation-back-to-integrations");
        await expect(back).toBeVisible();
        await expect(back).not.toHaveAttribute("target", "_blank");
        await back.click();
        await docs.waitForURL(/\/organization\/integrations$/, { timeout: 30_000 });
        await expect(docs.getByTestId("organization-integrations")).toBeVisible({ timeout: 30_000 });
        // And the Installation tab still did not move.
        await expect(page.getByTestId("installation-developer-details")).toBeVisible();
        await docs.close();
    });

    test("B2 — the breadcrumb names places, not routes", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}${DOCS}/getting-started`);
        await expect(page.getByTestId("documentation-body")).toBeVisible({ timeout: 30_000 });
        const crumb = page.getByRole("navigation", { name: /hierarchy/i });
        const text = await crumb.first().innerText();
        expect(text).not.toContain("integrations/documentation");
        expect(text).toContain("Integrations");
        expect(text).toContain("Developer documentation");
        expect(text).toContain("Getting started");
        await shoot(page, "02-documentation-guide");
    });

    // ── SLICE C: the one-time secret is a modal ────────────────────────────────
    test("C — Issue credential presents a centered modal, and Done clears the secret", async ({ page }) => {
        await signIn(page);
        await openCredentialFixture(page);

        const before = await page.getByTestId("installation-credentials").innerText();

        await page.getByTestId("credential-issue").click();
        const dialog = page.getByTestId("credential-secret-reveal");
        await expect(dialog).toBeVisible({ timeout: 30_000 });
        await expect(dialog).toHaveAttribute("role", "dialog");
        await expect(dialog).toHaveAttribute("aria-modal", "true");

        // Centered: the dialog's own box sits within a few pixels of the viewport centre.
        const box = await dialog.locator("> div").boundingBox();
        const viewport = page.viewportSize()!;
        expect(Math.abs((box!.x + box!.width / 2) - viewport.width / 2)).toBeLessThan(8);

        await expect(dialog).toContainText("Credential issued");
        await expect(page.getByTestId("credential-client-id-value")).toBeVisible();
        await expect(page.getByTestId("credential-secret-value")).toBeVisible();
        await expect(page.getByTestId("credential-client-id-copy")).toBeVisible();
        await expect(page.getByTestId("credential-secret-copy")).toBeVisible();
        await expect(dialog).toContainText("Alloy cannot show it again");

        // Focus starts on the completion action, and Tab does not escape the dialog.
        await expect(page.getByTestId("credential-secret-dismiss")).toBeFocused();
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((d, el) => d.contains(el), await page.evaluateHandle(() => document.activeElement)))
            .toBe(true);

        const secret = await page.getByTestId("credential-secret-value").innerText();
        expect(secret.length).toBeGreaterThan(20);

        await shoot(page, "04-credential-issue-modal");

        await page.getByTestId("credential-secret-dismiss").click();
        await expect(dialog).toBeHidden();

        // The secret is gone from the page, and was never written anywhere durable.
        const html = await page.content();
        expect(html).not.toContain(secret);
        const stored = await page.evaluate(() => ({
            local: JSON.stringify(window.localStorage),
            session: JSON.stringify(window.sessionStorage),
            cookie: document.cookie,
            url: window.location.href,
        }));
        for (const [where, value] of Object.entries(stored)) {
            expect(value.includes(secret), `the secret reached ${where}`).toBe(false);
        }

        // The Credentials card reflects the new credential, and the page is its normal self.
        const after = page.getByTestId("installation-credentials");
        await expect(after).toContainText(/Active/);
        expect(await after.innerText()).not.toBe(before);
        await expect(page.getByTestId("installation-access")).toBeVisible();
        await expect(page.getByTestId("installation-activity")).toBeVisible();
        await shoot(page, "06-installation-after-modal");
    });

    test("C2 — Rotate uses the same one-time-secret modal", async ({ page }) => {
        await signIn(page);
        await openCredentialFixture(page);

        await expect(page.getByTestId("credential-rotate")).toBeEnabled();
        await page.getByTestId("credential-rotate").click();

        const dialog = page.getByTestId("credential-secret-reveal");
        await expect(dialog).toBeVisible({ timeout: 30_000 });
        await expect(dialog).toContainText("Credential rotated");
        await expect(page.getByTestId("credential-secret-value")).toBeVisible();
        await expect(page.getByTestId("credential-secret-copy")).toBeVisible();
        // Rotation states its overlap window — the one fact that makes a rotation deployable.
        await expect(page.getByTestId("credential-rotation-overlap")).toBeVisible();
        await shoot(page, "05-credential-rotate-modal");

        const secret = await page.getByTestId("credential-secret-value").innerText();

        // Escape dismisses, like every other Alloy dialog.
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        expect(await page.content()).not.toContain(secret);

        /*
         * And a reload cannot bring it back — there is nowhere for it to have been kept.
         *
         * A reload lands on the collection rather than this installation: installation detail is
         * client state, not a route of its own. So the installation is reopened, which is the
         * stronger test anyway — the secret is absent from a freshly loaded page AND from a freshly
         * reopened installation.
         */
        await page.reload();
        expect(await page.content()).not.toContain(secret);
        await openCredentialFixture(page);
        expect(await page.content()).not.toContain(secret);
        await expect(page.getByTestId("credential-secret-reveal")).toHaveCount(0);
        // The card still reports a live credential: rotation replaced the secret, not the credential.
        await expect(page.getByTestId("installation-credentials")).toContainText(/Active|Rotating/);
    });

    // ── SLICES D + F: what the documentation says, and does not say ────────────
    test("D/F — the documentation is externally appropriate", async ({ page }) => {
        await signIn(page);

        for (const slug of ["getting-started", "locations", "conventions", "specification"]) {
            await page.goto(`${ORIGIN}${DOCS}/${slug}`);
            await expect(page.getByTestId("documentation-body"), slug).toBeVisible({ timeout: 30_000 });
            // Scoped to the rendered document: the page has more than one <main>, and what is
            // under certification is what the governed source turned into.
            const body = await page.getByTestId("documentation-body").innerText();
            expect(body, `${slug}: frontmatter`).not.toContain("last_reviewed:");
            expect(body, `${slug}: thread language`).not.toMatch(/\bThread \d/);
            expect(body, `${slug}: security finding`).not.toMatch(/SEC-\d/);
            expect(body, `${slug}: repository path`).not.toMatch(/\.\.\/[\w./-]*\.md/);
            expect(body, `${slug}: source path`).not.toContain("web/lib/");
        }

        // The landing positions the platform without promising anything.
        await page.goto(`${ORIGIN}${DOCS}`);
        await expect(page.getByTestId("landing-platform-position")).toBeVisible();
        const landing = await page.getByTestId("documentation-landing").innerText();
        expect(landing).toContain("Developer Platform foundation");
        expect(landing).toContain("Public resource expansion");
        expect(landing).not.toMatch(/\bQ[1-4]\b|\bcoming in\b|\bby (January|June|20\d\d)/i);
        expect(landing).not.toContain("/api/v1/children");
        expect(landing).not.toContain("/api/v1/attendance");
    });

    // ── SLICE N: the operator's own run is untouched ───────────────────────────
    test("N — the Human QA instrument and its links are intact", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/dev/qa/developer-platform`);
        await expect(page.getByRole("heading", { name: /human QA walkthrough/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(/of 82 steps answered/)).toBeVisible();

        for (const href of ["/organization/integrations", DOCS, "/api/admin/integrations/openapi"]) {
            const response = await page.request.get(`${ORIGIN}${href}`);
            expect(response.status(), href).toBe(200);
        }
    });

    // ── Leave the environment as the fixture defines it ────────────────────────
    test("Z — the certification fixture is returned to its canonical state", async ({ page }) => {
        await signIn(page);
        const rebuilt = await page.request.post(`${ORIGIN}/api/dev/qa/developer-platform`, {
            data: { action: "ensure_fixture" },
        });
        expect(rebuilt.status()).toBe(200);
        const body = await rebuilt.json() as { fixture: { ok: boolean; installations?: unknown[] } };
        expect(body.fixture.ok, "the fixture rebuilt cleanly").toBe(true);
        expect(body.fixture.installations?.length).toBe(4);
    });
});
