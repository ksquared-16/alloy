import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Mounted certification of the Developer Platform productization pass.
 *
 * Runs against the slot-8 certification server on alloy-cert — the same environment the Human QA
 * walkthrough uses — because the finding being repaired was "this does not look or behave like
 * Alloy", and that is only answerable in a real browser against real data.
 *
 * NOTHING HERE MUTATES THE QA FIXTURE. Behavioural proof that credential issue/rotate/revoke and
 * suspend/reactivate still work belongs to the deterministic `verify` action, which issues and
 * revokes its own credentials and cleans up after itself. This spec proves what the operator SEES:
 * the surfaces, their hierarchy, their controls and their states. A certification that issued a
 * credential here would be a certification that changed the run the operator is about to perform.
 */
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3018";
const IDENTITY = "qa-slot8-product@example.com";
const SHOTS = resolve(process.env.CERT_EVIDENCE_DIR ?? "playwright/evidence/integrations-productization");

function operatorPassword(): string | null {
    try {
        const file = readFileSync(resolve(process.env.HOME ?? "", ".config/alloy-dev/slot8-qa-cert-password"), "utf8");
        return file.split("\n")[1]?.trim() || null;
    } catch {
        return null;
    }
}

const password = operatorPassword();
const describeMounted = password ? test.describe : test.describe.skip;

mkdirSync(SHOTS, { recursive: true });

async function signIn(page: Page) {
    await page.goto(`${ORIGIN}/login`);
    if (!/\/login/.test(page.url())) return; // already authenticated
    await page.getByRole("textbox", { name: /email/i }).fill(IDENTITY);
    await page.getByRole("textbox", { name: "Password" }).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 90_000 });
}

/**
 * Dismiss the operator assistant before capturing evidence.
 *
 * It is a global overlay that opens by default in this session and sits on top of the right-hand
 * third of every page. Leaving it up would mean every screenshot in this certification showed the
 * assistant rather than the surface under certification.
 */
async function dismissAssistant(page: Page) {
    // Scoped to the assistant's own region. A bare "Close" button matched the Access editor's own
    // toggle, which reads Close while it is open — so dismissing the assistant also collapsed the
    // editor that was about to be photographed.
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
    await dismissAssistant(page);
    await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true });
}

/** Open Integrations and click into the first connection. */
async function openFirstInstallation(page: Page) {
    await page.goto(`${ORIGIN}/organization/integrations`);
    await expect(page.getByTestId("integrations-list")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("integrations-list").getByRole("button").first().click();
    await expect(page.getByTestId("installation-access")).toBeVisible({ timeout: 30_000 });
}

describeMounted("Developer Platform productization — mounted certification", () => {
    test.use({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
    test.describe.configure({ mode: "serial" });

    test("A — Integrations is a first-class Organization configuration domain", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization`);
        await expect(page.getByTestId("organization-configuration-page")).toBeVisible({ timeout: 30_000 });

        const card = page.getByTestId("organization-domain-integrations");
        await expect(card).toBeVisible();
        await expect(card).toContainText("Integrations");
        await expect(card).toContainText(/external software/i);

        // The landing and the left rail must agree that this is a domain.
        const rail = page.getByTestId("config-mode-nav-integrations");
        if (await rail.count()) await expect(rail.first()).toBeVisible();

        await shoot(page, "01-organization-landing");

        // And the card is a route into the domain, not decoration.
        await card.getByRole("link").first().click();
        await page.waitForURL(/\/organization\/integrations/, { timeout: 30_000 });
    });

    test("B — the Integrations collection reads as an Alloy collection", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization/integrations`);

        await expect(page.getByTestId("integrations-context")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
        await expect(page.getByTestId("add-integration")).toBeVisible();

        // Wait for the collection itself: the header renders before the fetch resolves, and the
        // totals are deliberately withheld until they are real.
        await expect(page.getByTestId("integrations-list")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("integrations-summary")).toContainText(/Connected/);
        await expect(page.getByTestId("integrations-summary")).toContainText(/Healthy/);
        await expect(page.getByTestId("integrations-summary-pending")).toHaveCount(0);

        const rows = page.getByTestId("integrations-list").getByRole("listitem");
        const count = await rows.count();
        expect(count, "the certification fixture provides several connections").toBeGreaterThan(1);

        /*
         * The defect in the operator's own words: "Active · Needs attention" as one run of text.
         * State and health are now two badges, so the row must not contain the concatenation.
         */
        const firstRow = rows.first();
        await expect(firstRow).not.toContainText("Active · Needs attention");
        await expect(firstRow).toContainText(/location/i);

        await shoot(page, "02-integrations-collection");
    });

    test("C — installation detail is an operational home", async ({ page }) => {
        await signIn(page);
        await openFirstInstallation(page);

        for (const section of [
            "installation-access",
            "installation-credentials",
            "installation-activity",
            "installation-state-controls",
            "installation-developer-details",
        ]) {
            await expect(page.getByTestId(section), section).toBeVisible();
        }

        // The header establishes identity and the two state facts.
        await expect(page.getByTestId("installation-context")).toBeVisible();
        await expect(page.getByTestId("installation-health")).toBeVisible();

        // Access states the COMBINED effect of capabilities and boundary, not two disconnected lists.
        await expect(page.getByTestId("access-effective-summary")).toBeVisible();

        // Activity filters are controls, not bare buttons, and each is pressable.
        for (const f of ["all", "success", "failure"]) {
            await expect(page.getByTestId(`activity-filter-${f}`)).toHaveAttribute("aria-pressed", /true|false/);
        }
        await page.getByTestId("activity-filter-failure").click();
        await expect(page.getByTestId("activity-filter-failure")).toHaveAttribute("aria-pressed", "true");
        await page.getByTestId("activity-filter-all").click();

        // Identifiers are present but secondary — folded away behind a disclosure.
        const developerDetails = page.getByTestId("installation-developer-details");
        await expect(developerDetails.locator("details")).toHaveCount(1);

        await shoot(page, "03-installation-detail");
    });

    test("C2 — credential controls agree with the credential's state", async ({ page }) => {
        await signIn(page);
        await openFirstInstallation(page);

        const issue = page.getByTestId("credential-issue");
        const rotate = page.getByTestId("credential-rotate");
        const revoke = page.getByTestId("credential-revoke");
        await expect(issue).toBeVisible();

        /*
         * The rule, unchanged by the productization: Issue is always the way back, and Rotate and
         * Revoke are live only when there is an ACTIVE credential. Nothing is pressed — a
         * certification that issued a credential would change the fixture the operator is about to
         * walk. What is asserted is that the controls do not contradict the state above them.
         */
        const hasActive = await page.getByTestId("installation-credentials").getByText(/Active|Rotating/).count();
        await expect(issue).toBeEnabled();
        if (hasActive > 0) {
            await expect(rotate).toBeEnabled();
            await expect(revoke).toBeEnabled();
        } else {
            await expect(rotate).toBeDisabled();
            await expect(revoke).toBeDisabled();
        }
    });

    test("D — the access editors are understandable", async ({ page }) => {
        await signIn(page);
        await openFirstInstallation(page);

        await page.getByTestId("edit-capabilities").click();
        const capabilityEditor = page.getByTestId("capability-editor");
        await expect(capabilityEditor).toBeVisible();
        // Operator language leads; the scope key is present but secondary.
        await expect(capabilityEditor).toContainText(/Read only|Can make changes/);
        await expect(capabilityEditor).toContainText("context.read");
        await expect(capabilityEditor).toContainText(/does not by itself mean Alloy publishes an endpoint/i);
        await shoot(page, "04-capability-editor");
        await page.getByTestId("capability-cancel").click();

        await page.getByTestId("edit-locations").click();
        const locationEditor = page.getByTestId("location-access-editor");
        await expect(locationEditor).toBeVisible();
        await expect(page.getByTestId("editor-boundary-org-wide")).toBeVisible();
        await expect(page.getByTestId("editor-boundary-selected")).toBeVisible();
        await page.getByTestId("editor-boundary-selected").locator("input").check();
        await expect(page.getByTestId("editor-site-list")).toBeVisible();
        await shoot(page, "05-location-editor");
        await page.getByTestId("editor-cancel").click();
        await expect(locationEditor).toBeHidden();
    });

    test("D2 — a restricted boundary opens with its own selection, not an empty one", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization/integrations`);
        await expect(page.getByTestId("integrations-list")).toBeVisible({ timeout: 30_000 });

        /*
         * The access-loss defect this pass closed. "Edit locations" used to open with nothing
         * ticked on an installation whose boundary held two sites; saving from that screen narrowed
         * access to nothing. The restricted fixture installation is the one that proves it.
         */
        const restricted = page.getByRole("button").filter({ hasText: /Restricted|selected location/i }).first();
        if (await restricted.count() === 0) test.skip(true, "no restricted-boundary installation in this fixture");
        await restricted.click();
        await expect(page.getByTestId("installation-access")).toBeVisible({ timeout: 30_000 });

        const summary = await page.getByTestId("access-effective-summary").innerText();
        const expectsSelection = /selected location/i.test(summary);

        // The server must SAY which locations, not merely how many — the count alone is what left
        // the editor unable to prefill.
        const payload = await (await page.request.get(`${ORIGIN}/api/admin/integrations/installations`)).json() as {
            installations: { boundaryMode: string; locationIds?: string[] }[];
        };
        const restrictedInstallations = payload.installations.filter((i) => i.boundaryMode === "locations");
        expect(restrictedInstallations.length).toBeGreaterThan(0);
        for (const i of restrictedInstallations) {
            expect(Array.isArray(i.locationIds), "the boundary is reported as ids").toBe(true);
        }
        expect(
            restrictedInstallations.some((i) => (i.locationIds ?? []).length > 0),
            "the restricted fixture reports the site it is bound to",
        ).toBe(true);

        await page.getByTestId("edit-locations").click();
        await expect(page.getByTestId("location-access-editor")).toBeVisible();
        if (expectsSelection) {
            // The site list is fetched, so wait for it rather than counting an empty render.
            const boxes = page.getByTestId("editor-site-list").locator("input[type=checkbox]");
            await expect.poll(() => boxes.count(), { timeout: 20_000 }).toBeGreaterThan(0);
            await expect
                .poll(
                    () => page.getByTestId("editor-site-list").locator("input:checked").count(),
                    { timeout: 20_000, message: "the editor prefills the boundary it is editing" },
                )
                .toBeGreaterThan(0);
        }
        await page.getByTestId("editor-cancel").click();
    });

    test("E — the four-step wizard is productized and still behaves", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization/integrations`);
        await page.getByTestId("add-integration").click();
        await expect(page.getByTestId("add-integration-wizard")).toBeVisible({ timeout: 30_000 });

        // Step 1 — choose what to connect.
        await expect(page.getByTestId("wizard-progress")).toBeVisible();
        await expect(page.getByTestId("wizard-progress-application")).toHaveAttribute("aria-current", "step");
        await expect(page.getByTestId("wizard-step-application")).toBeVisible();
        await shoot(page, "06-wizard-step-1-application");

        // Continue is refused until something is chosen — the behaviour, unchanged.
        await expect(page.getByTestId("wizard-next")).toBeDisabled();
        const choosable = page.getByTestId("wizard-step-application").getByRole("button").and(page.locator(":not([disabled])"));
        const available = await choosable.count();
        test.skip(available === 0, "every approved application is already connected in this fixture");

        await choosable.first().click();
        await expect(page.getByTestId("wizard-next")).toBeEnabled();
        await page.getByTestId("wizard-next").click();

        // Step 2 — capabilities, using the same component as the editor.
        await expect(page.getByTestId("wizard-step-capabilities")).toBeVisible();
        await expect(page.getByTestId("wizard-progress-capabilities")).toHaveAttribute("aria-current", "step");
        await page.getByTestId("wizard-step-capabilities").locator("input[type=checkbox]").first().check();
        await shoot(page, "07-wizard-step-2-capabilities");
        await page.getByTestId("wizard-next").click();

        // Step 3 — locations, including the boundary truth.
        await expect(page.getByTestId("wizard-step-locations")).toBeVisible();
        await page.getByTestId("wizard-boundary-selected").locator("input").check();
        await expect(page.getByTestId("wizard-restricted-empty-warning")).toBeVisible();
        await expect(page.getByTestId("wizard-next")).toBeDisabled();
        await shoot(page, "08-wizard-step-3-locations");
        await page.getByTestId("wizard-boundary-org-wide").locator("input").check();
        await expect(page.getByTestId("wizard-next")).toBeEnabled();
        await page.getByTestId("wizard-next").click();

        // Step 4 — review restates Integration / Can / Where before anything exists.
        await expect(page.getByTestId("wizard-step-review")).toBeVisible();
        await expect(page.getByTestId("review-application")).not.toBeEmpty();
        await expect(page.getByTestId("review-capabilities")).not.toBeEmpty();
        await expect(page.getByTestId("review-access")).toContainText("All locations");
        await expect(page.getByTestId("wizard-step-review")).toContainText(/Alloy enforces this on every request/);
        await shoot(page, "09-wizard-step-4-review");

        // Back still walks the flow in reverse, and nothing was created.
        await page.getByTestId("wizard-back").click();
        await expect(page.getByTestId("wizard-step-locations")).toBeVisible();
        await page.getByTestId("wizard-cancel").click();
        await expect(page.getByTestId("integrations-list")).toBeVisible();
    });

    test("F/G — Developer Documentation opens in a new tab and renders as documentation", async ({ page, context }) => {
        await signIn(page);
        await openFirstInstallation(page);

        const link = page.getByTestId("developer-documentation-link");
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);

        const [docs] = await Promise.all([context.waitForEvent("page"), link.click()]);
        await docs.waitForLoadState("domcontentloaded");
        await expect(docs).toHaveURL(/\/organization\/integrations\/documentation/);

        // The operator keeps their place.
        await expect(page.getByTestId("installation-access")).toBeVisible();

        // The landing stands on its own and answers the first questions.
        await expect(docs.getByTestId("documentation-landing")).toBeVisible({ timeout: 30_000 });
        await expect(docs.getByTestId("landing-current-surface")).toBeVisible();
        await expect(docs.getByTestId("developer-documentation-index")).toBeVisible();
        await expect(docs.getByTestId("developer-documentation-api-reference")).toBeVisible();

        const operations = docs.getByTestId("landing-operations");
        await expect(operations).toContainText("POST /api/v1/oauth/token");
        await expect(operations).toContainText("GET /api/v1/context");
        await expect(operations).toContainText("GET /api/v1/locations");
        // The whole public surface, and nothing that is not implemented.
        await expect(operations.getByRole("listitem")).toHaveCount(3);
        await expect(operations).not.toContainText("/api/v1/attendance");

        await docs.setViewportSize({ width: 1440, height: 900 });
        await dismissAssistant(docs);
        await docs.screenshot({ path: resolve(SHOTS, "10-documentation-landing.png"), fullPage: true });
    });

    test("F2 — canonical Markdown renders as human-readable documentation", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization/integrations/documentation/getting-started`);
        await expect(page.getByTestId("doc-section-getting-started")).toBeVisible({ timeout: 30_000 });

        const body = page.getByTestId("documentation-body");
        await expect(body).toBeVisible();

        // Real structure, not a scrollable text box.
        await expect(body.locator("h2").first()).toBeVisible();
        await expect(body.locator("p").first()).toBeVisible();
        await expect(body.locator("ul, ol").first()).toBeVisible();
        await expect(body.locator("[data-doc-block=code]").first()).toBeVisible();
        await expect(body.locator("[data-doc-block=callout]").first()).toBeVisible();
        await expect(page.getByTestId("doc-code-copy").first()).toBeVisible();

        // No raw Markdown source and no frontmatter reaches the reader.
        const text = await page.locator("body").innerText();
        expect(text).not.toContain("owner: platform");
        expect(text).not.toContain("last_reviewed:");
        expect(text).not.toContain("supersedes:");
        expect(text).not.toMatch(/^---$/m);
        expect(text).not.toMatch(/^## /m);
        expect(text).not.toMatch(/\*\*[A-Za-z]/);

        // A table of contents, and headings it can reach.
        const toc = page.getByTestId("developer-documentation-toc");
        if (await toc.count()) {
            const first = toc.getByRole("link").first();
            const href = await first.getAttribute("href");
            expect(href).toMatch(/^#/);
            await expect(body.locator(`${href}`)).toHaveCount(1);
        }

        await dismissAssistant(page);
        await page.screenshot({ path: resolve(SHOTS, "11-documentation-section.png"), fullPage: true });
    });

    test("F3 — a code example is rendered exactly as authored", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/organization/integrations/documentation/getting-started`);
        await expect(page.getByTestId("documentation-body")).toBeVisible({ timeout: 30_000 });

        const rendered = await page.locator("[data-doc-block=code] pre code").first().innerText();
        const source = readFileSync(
            resolve(__dirname, "../../..", "docs/api/developer-platform/guide/README.md"),
            "utf8",
        );
        expect(source, "the rendered example appears verbatim in the governed source")
            .toContain(rendered.replace(/\n$/, ""));
    });

    test("H — the API reference remains governed and reachable", async ({ page }) => {
        await signIn(page);
        const response = await page.goto(`${ORIGIN}/api/admin/integrations/openapi`);
        expect(response?.status()).toBe(200);
        const spec = JSON.parse(await page.locator("body").innerText()) as {
            paths: Record<string, Record<string, unknown>>;
        };
        const operations = Object.entries(spec.paths).flatMap(([route, ops]) =>
            Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
                .map((m) => `${m.toUpperCase()} ${route}`),
        );
        expect(operations.sort()).toEqual([
            "GET /api/v1/context",
            "GET /api/v1/locations",
            "POST /api/v1/oauth/token",
        ]);
    });

    test("K — the Human QA instrument still reaches the repaired surfaces", async ({ page }) => {
        await signIn(page);
        await page.goto(`${ORIGIN}/dev/qa/developer-platform`);
        await expect(page.getByRole("heading", { name: /human QA walkthrough/i })).toBeVisible({ timeout: 60_000 });

        // Every surface the instrument links to must still answer. These are the routes the 82
        // steps send the operator to, and a productization pass that moved one would strand them.
        for (const href of [
            "/organization/integrations",
            "/organization/integrations/documentation",
            "/api/admin/integrations/openapi",
        ]) {
            const response = await page.request.get(`${ORIGIN}${href}`);
            expect(response.status(), href).toBe(200);
        }
    });
});
