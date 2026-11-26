/**
 * Stage 4 focused re-cert after distribution_runs schema fix.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:3014";
const AUTH = `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const EVIDENCE =
    process.env.EVIDENCE ||
    "/Users/Kelly/Code/alloy-worktrees/wt4-org-runtime-realization/.alloy-agent-evidence/program-assignment-production-stage4";
const API = "/api/admin/configuration/programs";

async function main() {
    const report = { startedAt: new Date().toISOString(), steps: [], network: [] };
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.on("request", (req) => {
        if (req.url().includes(API) && req.method() === "POST") {
            try {
                const body = JSON.parse(req.postData() || "{}");
                report.network.push({ type: "request", action: body.action, body });
            } catch {
                /* ignore */
            }
        }
    });
    page.on("response", async (res) => {
        if (!res.url().includes(API)) return;
        const json = await res.json().catch(() => null);
        report.network.push({
            type: "response",
            status: res.status(),
            ok: json?.ok,
            hasPreview: !!json?.preview,
            hasResult: !!json?.result,
            willPublish: json?.preview?.program?.willPublish,
            eligible: json?.preview?.impact?.eligible,
            newAssoc: json?.preview?.newAssociations?.length,
            resultStatus: json?.result?.status,
            programId: json?.result?.programId,
            operationId: json?.result?.operationId,
            associated: json?.result?.associatedLocationIds?.length,
            idempotentReplay: json?.result?.idempotentReplay,
            refreshTargets: json?.result?.refreshTargets,
            error: typeof json?.error === "string" ? json.error : json?.error?.message || json?.issue?.message,
        });
    });

    async function shot(name) {
        await page.screenshot({ path: path.join(EVIDENCE, name + ".png"), fullPage: true });
    }

    // Locations → North Campus → Programs → Add
    await page.goto(`${BASE}/organization/locations`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator('[data-testid="locations-loading"]').waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.locator('[data-testid="locations-row-1a5644a7-45c4-413b-9021-5f556118b6e2"]').click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Programs$/ }).first().click();
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="locations-program-add"]').click();
    await page.waitForTimeout(1000);
    await page.locator('[data-testid="pla-flow-create-new"]').click();
    const stamp = Date.now().toString(36).slice(-6);
    await page.locator('[data-testid="pla-flow-create-name"]').fill(`Stage4 Recert ${stamp}`);
    await page.locator('[data-testid="pla-flow-create-key"]').fill(`stage4_recert_${stamp}`);
    await page.locator('[data-testid="pla-flow-continue-locations"]').click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid="pla-flow-select-all"]').click();
    await page.waitForTimeout(300);
    await shot("r2-03-bulk-picker");
    const t0 = Date.now();
    await page.locator('[data-testid="pla-flow-continue-review"]').click();
    await page.locator('[data-testid="pla-flow-review"]').waitFor({ timeout: 30000 });
    const previewMs = Date.now() - t0;
    await shot("r2-04c-preview");
    const reviewText = await page.locator('[data-testid="pla-flow-review"]').innerText();
    const preview = [...report.network].reverse().find((n) => n.type === "response" && n.hasPreview);
    report.steps.push({
        name: "preview",
        previewMs,
        reviewText: reviewText.slice(0, 500),
        eligible: preview?.eligible,
        newAssoc: preview?.newAssoc,
        willPublish: preview?.willPublish,
        ok: preview?.ok,
    });

    const t1 = Date.now();
    await page.locator('[data-testid="pla-flow-apply"]').click();
    await page.locator('[data-testid="pla-flow-success"], [data-testid="pla-flow-commit-error"]').waitFor({
        timeout: 120000,
    });
    const commitMs = Date.now() - t1;
    await shot("r2-04d-commit");
    const commit = [...report.network].reverse().find((n) => n.type === "response" && (n.hasResult || n.error));
    const commitReq = [...report.network].reverse().find((n) => n.type === "request" && n.action === "make_available");
    report.steps.push({
        name: "commit",
        commitMs,
        ok: commit?.ok,
        resultStatus: commit?.resultStatus,
        programId: commit?.programId,
        operationId: commit?.operationId,
        associated: commit?.associated,
        error: commit?.error,
        locationCount: commitReq?.body?.locationIds?.length,
        idempotencyKey: commitReq?.body?.idempotencyKey,
        refreshTargets: commit?.refreshTargets,
    });

    // Idempotent replay
    if (commitReq?.body && commit?.ok) {
        const replay = await page.evaluate(async ({ api, body }) => {
            const res = await fetch(api, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            return { status: res.status, json: await res.json().catch(() => null) };
        }, { api: API, body: commitReq.body });
        await shot("r2-09-idempotent");
        report.steps.push({
            name: "idempotent_replay",
            httpStatus: replay.status,
            ok: replay.json?.ok,
            programId: replay.json?.result?.programId,
            operationId: replay.json?.result?.operationId,
            idempotentReplay: replay.json?.result?.idempotentReplay,
            sameProgram: replay.json?.result?.programId === commit.programId,
        });
    }

    // Draft block deep link
    await page.goto(
        `${BASE}/organization/programs?programId=64adf957-537f-4ce9-b2b4-9f6def7ebf6a&section=assignment`,
        { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(3500);
    await shot("r2-05-draft-block");
    report.steps.push({
        name: "draft_block",
        unpublished: await page.locator('[data-testid="pla-flow-unpublished-block"]').isVisible().catch(() => false),
        flow: await page.locator('[data-testid="program-location-availability-flow"]').isVisible().catch(() => false),
    });

    // Org origin assign existing published (if commit created one)
    const pid = commit?.programId;
    if (pid && commit?.ok) {
        await page.goto(`${BASE}/organization/programs?programId=${pid}&section=assignment`, {
            waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(3000);
        if (await page.locator('[data-testid="pla-flow-continue-locations"]').isVisible().catch(() => false)) {
            await page.locator('[data-testid="pla-flow-continue-locations"]').click();
            await page.waitForTimeout(500);
        }
        await page.locator('[data-testid="pla-flow-clear-all"]').click().catch(() => {});
        const boxes = page.locator('input[type="checkbox"]:not([disabled])');
        if (await boxes.count()) await boxes.first().check().catch(() => {});
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.locator('[data-testid="pla-flow-review"]').waitFor({ timeout: 30000 });
        await shot("r2-01-org-preview");
        await page.locator('[data-testid="pla-flow-apply"]').click();
        await page.locator('[data-testid="pla-flow-success"], [data-testid="pla-flow-commit-error"]').waitFor({
            timeout: 90000,
        });
        await shot("r2-01-org-commit");
        const c2 = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
        report.steps.push({
            name: "org_origin_existing",
            ok: c2?.ok,
            resultStatus: c2?.resultStatus,
            associated: c2?.associated,
        });
    }

    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(EVIDENCE, "recert-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ steps: report.steps }, null, 2));
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
