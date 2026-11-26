/**
 * Authenticated browser QA for Access UI + compact grouped landings.
 * Slot 2 cookie domain is 127.0.0.1 — use BASE=http://127.0.0.1:3012
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../../web/package.json"));
const { chromium } = require("playwright");

const EVIDENCE = process.env.EVIDENCE || join(__dirname, "qa");
const AUTH =
    process.env.AUTH ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot2/storage-state.json`;
const BASE = process.env.BASE || "http://127.0.0.1:3012";

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const report = {
        startedAt: new Date().toISOString(),
        base: BASE,
        checks: {},
        steps: [],
        errors: [],
        consoleErrors,
    };

    async function shot(name) {
        const file = join(EVIDENCE, `${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        report.steps.push({ name, url: page.url() });
    }

    async function goto(urlPath) {
        await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(2800);
    }

    async function step(name, fn) {
        try {
            await fn();
        } catch (err) {
            report.errors.push({ name, message: err instanceof Error ? err.message : String(err) });
            await shot(`error-${name}`).catch(() => {});
        }
    }

    await step("financials-landing", async () => {
        await goto("/organization/financials");
        const mainText = (await page.locator("main").innerText().catch(() => "")) || "";
        report.checks.financialsLanding = {
            tiles: await page.locator('[data-testid="financials-landing-tiles"]').count(),
            helper: await page.locator('[data-testid="financials-landing-helper"]').count(),
            noScopeBar: (await page.locator('[data-testid="financials-landing-posture"]').count()) === 0,
            bodyHasConceptual: /Financial Domains|Choose a domain|Separate domain/i.test(mainText),
            onLogin: page.url().includes("/login"),
        };
        await shot("01-financials-landing");
    });

    await step("programs-locations-landing", async () => {
        await goto("/organization/programs-locations");
        const mainText = (await page.locator("main").innerText().catch(() => "")) || "";
        report.checks.programsLocationsLanding = {
            tiles: await page.locator('[data-testid="programs-locations-landing-tiles"]').count(),
            helper: await page.locator('[data-testid="programs-locations-landing-helper"]').count(),
            noScopeBar: (await page.locator('[data-testid="programs-locations-landing-posture"]').count()) === 0,
            bodyHasConceptual: /One operational system|Define once|Local ownership/i.test(mainText),
        };
        await shot("02-programs-locations-landing");
    });

    await step("access-landing", async () => {
        await goto("/settings/users-roles");
        const mainText = (await page.locator("main").innerText().catch(() => "")) || "";
        report.checks.accessLanding = {
            launcher: await page.locator('[data-testid="access-launcher-tiles"]').count(),
            users: await page.locator('[data-testid="access-launcher-tile-users"]').count(),
            roles: await page.locator('[data-testid="access-launcher-tile-roles"]').count(),
            scopes: await page.locator('[data-testid="access-launcher-tile-scopes"]').count(),
            security: await page.locator('[data-testid="access-launcher-tile-security"]').count(),
            bodyHasConceptual: /Permission \/ Roles|Visibility \/ Scope|Assignment \/ Users/i.test(mainText),
        };
        await shot("03-access-landing");
    });

    await step("users-collection", async () => {
        if (await page.locator('[data-testid="access-launcher-open-users"]').count()) {
            await page.locator('[data-testid="access-launcher-open-users"]').click();
            await page.waitForTimeout(3000);
        } else {
            await goto("/settings/users-roles?section=users");
        }
        report.checks.usersPage = {
            surface: await page.locator('[data-testid="access-workspace-surface"]').count(),
            collection: await page.locator('[data-testid="access-users-page"]').count(),
            invite: await page.locator('[data-testid="access-users-invite"]').count(),
        };
        await shot("04-users-collection");
    });

    await step("selected-user", async () => {
        const userRow = page.locator('[data-testid^="access-user-"]').first();
        if (!(await userRow.count())) {
            report.checks.selectedUser = { skipped: true, reason: "no users" };
            return;
        }
        await userRow.click();
        await page.waitForTimeout(1500);
        report.checks.selectedUser = {
            overview: await page.locator('[data-testid="access-user-overview"]').count(),
            workspace: await page.locator('[data-testid="access-user-selected-workspace"]').count(),
        };
        await shot("05-user-overview");

        await page.locator('[data-testid="access-user-tab-roles"]').click();
        await page.waitForTimeout(700);
        await shot("06-user-roles");

        await page.locator('[data-testid="access-user-tab-access"]').click();
        await page.waitForTimeout(700);
        await shot("07-user-access");

        await page.locator('[data-testid="access-user-tab-security"]').click();
        await page.waitForTimeout(700);
        report.checks.userSecurityPlanned = await page.locator('[data-capability="planned"]').count();
        await shot("08-user-security");

        await page.locator('[data-testid="access-user-tab-history"]').click();
        await page.waitForTimeout(700);
        await shot("09-user-history");
    });

    await step("invite-dialog", async () => {
        await page.locator('[data-testid="access-users-invite"]').click();
        await page.waitForTimeout(600);
        report.checks.inviteDialog = {
            open: await page.getByRole("dialog", { name: /Invite user/i }).count(),
            steps: await page.locator('[data-testid="access-invite-steps"]').count(),
            accessPlanned: await page.locator('[data-testid="access-invite-access-planned"]').count(),
        };
        await shot("10-invite-dialog");
        const cancel = page.getByRole("button", { name: "Cancel" });
        if (await cancel.count()) await cancel.click();
        await page.waitForTimeout(400);
    });

    await step("roles-collection", async () => {
        if (await page.locator('[data-testid="access-chapter-tab-roles"]').count()) {
            await page.locator('[data-testid="access-chapter-tab-roles"]').click();
            await page.waitForTimeout(2500);
        } else {
            await goto("/settings/users-roles?section=roles");
        }
        report.checks.rolesPage = {
            collection: await page.locator('[data-testid="access-roles-page"]').count(),
        };
        await shot("11-roles-collection");
    });

    await step("selected-role", async () => {
        const roleRow = page.locator('[data-testid^="access-role-"]').first();
        if (!(await roleRow.count())) {
            report.checks.selectedRole = { skipped: true, reason: "no roles" };
            return;
        }
        await roleRow.click();
        await page.waitForTimeout(1500);
        await shot("12-role-overview");

        await page.locator('[data-testid="access-role-tab-permissions"]').click();
        await page.waitForTimeout(1000);
        const mainText = await page.locator('[data-testid="access-roles-page"]').innerText();
        report.checks.permissionsNoRawKeySample = !mainText.includes("financials.tuition.write");
        await shot("13-role-permissions");

        await page.locator('[data-testid="access-role-tab-users"]').click();
        await page.waitForTimeout(700);
        await shot("14-role-users");

        await page.locator('[data-testid="access-role-tab-experience"]').click();
        await page.waitForTimeout(700);
        await shot("15-role-experience-access");

        await page.locator('[data-testid="access-role-tab-history"]').click();
        await page.waitForTimeout(700);
        await shot("16-role-history");
        report.checks.selectedRole = { ok: true };
    });

    await step("scopes", async () => {
        await goto("/settings/users-roles?section=scopes");
        report.checks.scopes = {
            page: await page.locator('[data-testid="access-scopes-page"]').count(),
        };
        await shot("17-access-scopes");
    });

    await step("security", async () => {
        await goto("/settings/users-roles?section=security");
        report.checks.securityPlanned = await page.locator('[data-capability="planned"]').count();
        report.checks.securityPage = await page.locator('[data-testid="access-security-page"]').count();
        await shot("18-security-landing");
    });

    await step("narrow", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await goto("/settings/users-roles");
        await shot("19-access-landing-narrow");
    });

    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(join(EVIDENCE, "qa-report.json"), JSON.stringify(report, null, 2));
    await browser.close();

    const fail =
        report.errors.length > 0 ||
        report.checks.financialsLanding?.bodyHasConceptual ||
        report.checks.programsLocationsLanding?.bodyHasConceptual ||
        report.checks.accessLanding?.bodyHasConceptual ||
        report.checks.financialsLanding?.onLogin ||
        !report.checks.accessLanding?.users ||
        !report.checks.usersPage?.collection;

    console.log(JSON.stringify({ checks: report.checks, errors: report.errors }, null, 2));
    if (fail) {
        console.error("QA checks failed");
        process.exit(1);
    }
    console.log("QA ok →", EVIDENCE);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
