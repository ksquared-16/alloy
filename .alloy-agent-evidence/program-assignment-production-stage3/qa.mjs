import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EVIDENCE =
    process.env.EVIDENCE ||
    path.resolve(import.meta.dirname);
const AUTH =
    process.env.AUTH ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const BASE = process.env.BASE || "http://localhost:3014";

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const network = [];
    page.on("request", (req) => {
        if (req.url().includes("/api/admin/configuration/programs")) {
            network.push({ type: "request", postData: req.postData() });
        }
    });
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/configuration/programs")) return;
        let body = null;
        try {
            body = await res.json();
        } catch {
            body = await res.text().catch(() => null);
        }
        network.push({ type: "response", status: res.status(), body });
    });
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const report = { startedAt: new Date().toISOString(), steps: [] };

    async function shot(name) {
        const file = path.join(EVIDENCE, `${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        report.steps.push({ name, url: page.url() });
    }

    await page.goto(`${BASE}/organization/programs`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(4000);
    await shot("01-programs-landing");

    const add = page.getByRole("button", { name: /Add to Locations/i });
    report.steps.push({ name: "add-to-locations-count", count: await add.count() });
    if (await add.count()) {
        await add.first().click();
        await page.waitForTimeout(2000);
        await shot("02-add-to-locations");
        report.steps.push({
            name: "program-flow",
            flow: await page
                .locator('[data-testid="program-location-availability-flow"]')
                .isVisible()
                .catch(() => false),
            unpublished: await page
                .locator('[data-testid="pla-flow-unpublished-block"]')
                .isVisible()
                .catch(() => false),
        });
    }

    await page.goto(`${BASE}/organization/locations`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(4000);
    await shot("03-locations-landing");

    const loc = page.locator('[data-testid="config-collection-item"]').first();
    if (await loc.count()) await loc.click();
    await page.waitForTimeout(1200);
    const pt = page.getByRole("button", { name: "Programs" });
    if (await pt.count()) await pt.first().click();
    await page.waitForTimeout(1500);
    await shot("04-location-programs");

    const addProgram = page.getByRole("button", { name: /Add Program/i });
    report.steps.push({ name: "add-program-count", count: await addProgram.count() });
    if (await addProgram.count()) {
        await addProgram.first().click();
        await page.waitForTimeout(2500);
        await shot("05-location-add-program-flow");
        report.steps.push({
            name: "location-flow",
            visible: await page
                .locator('[data-testid="program-location-availability-flow"]')
                .isVisible()
                .catch(() => false),
        });
        const createNew = page.locator('[data-testid="pla-flow-create-new"]');
        if (await createNew.isVisible().catch(() => false)) {
            await createNew.click();
            const stamp = Date.now().toString(36).slice(-6);
            await page.locator('[data-testid="pla-flow-create-name"]').fill(`Stage3 QA ${stamp}`);
            await page.locator('[data-testid="pla-flow-create-key"]').fill(`stage3_qa_${stamp}`);
            await page.locator('[data-testid="pla-flow-continue-locations"]').click();
            await page.waitForTimeout(1000);
            await shot("06-location-selection");
            const reviewBtn = page.locator('[data-testid="pla-flow-continue-review"]');
            if (await reviewBtn.isEnabled()) {
                await reviewBtn.click();
                await page.waitForTimeout(7000);
                await shot("07-preview-review");
                report.steps.push({
                    name: "preview-copy",
                    text: (
                        await page
                            .locator('[data-testid="pla-flow-review"]')
                            .innerText()
                            .catch(() => "")
                    ).slice(0, 900),
                    alerts: await page.locator('[role="alert"]').allInnerTexts().catch(() => []),
                });
                const apply = page.locator('[data-testid="pla-flow-apply"]');
                if (await apply.isVisible().catch(() => false)) {
                    await apply.click();
                    await page.waitForTimeout(12000);
                    await shot("08-commit-result");
                    report.steps.push({
                        name: "commit-result",
                        text: (
                            await page
                                .locator('[data-testid="pla-flow-success"]')
                                .innerText()
                                .catch(() => "")
                        ).slice(0, 900),
                        error: (
                            await page
                                .locator('[data-testid="pla-flow-commit-error"]')
                                .innerText()
                                .catch(() => "")
                        ).slice(0, 600),
                    });
                    const done = page.locator('[data-testid="pla-flow-done"]');
                    if (await done.isVisible().catch(() => false)) {
                        await done.click();
                        await page.waitForTimeout(2000);
                        await shot("09-return-location-programs");
                    }
                }
            } else {
                report.steps.push({ name: "review-disabled" });
            }
        } else {
            report.steps.push({
                name: "create-new-missing",
                snippet: (await page.locator("body").innerText()).slice(0, 600),
            });
        }
    }

    const actions = network
        .filter((n) => n.type === "request" && n.postData)
        .map((n) => {
            try {
                const body = JSON.parse(n.postData);
                return {
                    action: body.action,
                    hasOrgId: body.orgId != null,
                    hasActor: body.actorUserId != null,
                    locationCount: (body.locationIds || []).length,
                    programKind: body.program && body.program.kind,
                    idempotencyKey: body.idempotencyKey,
                };
            } catch {
                return { parseError: true };
            }
        });
    const responses = network
        .filter((n) => n.type === "response")
        .map((n) => ({
            status: n.status,
            ok: n.body && n.body.ok,
            hasPreview: !!(n.body && n.body.preview),
            hasResult: !!(n.body && n.body.result),
            willPublish:
                n.body &&
                n.body.preview &&
                n.body.preview.program &&
                n.body.preview.program.willPublish,
            resultStatus: n.body && n.body.result && n.body.result.status,
            programId: n.body && n.body.result && n.body.result.programId,
            error:
                n.body &&
                (typeof n.body.error === "string"
                    ? n.body.error
                    : (n.body.error && n.body.error.message) || n.body.operatorMessage),
        }));

    report.networkSummary = actions;
    report.networkResponses = responses;
    report.previewCount = actions.filter((a) => a.action === "preview_make_available").length;
    report.commitCount = actions.filter((a) => a.action === "make_available").length;
    report.consoleErrors = consoleErrors.slice(0, 40);
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(EVIDENCE, "qa-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(EVIDENCE, "network.json"), JSON.stringify(network, null, 2));
    console.log(
        JSON.stringify(
            {
                previewCount: report.previewCount,
                commitCount: report.commitCount,
                steps: report.steps,
                consoleErrorCount: consoleErrors.length,
                networkActions: actions,
                networkResponses: responses,
            },
            null,
            2,
        ),
    );
    await browser.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
