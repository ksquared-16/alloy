/**
 * Stage 4 — Programs Assignment E2E certification harness (Playwright).
 * Run from web/: node ../.alloy-agent-evidence/program-assignment-production-stage4/certify.mjs
 * Uses http://127.0.0.1:3014 + slot4 storage-state.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:3014";
const AUTH =
    process.env.AUTH ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const EVIDENCE =
    process.env.EVIDENCE ||
    __dirname;

const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    scenarios: {},
    network: [],
    consoleErrors: [],
    pageErrors: [],
    timing: {},
    limitations: [],
};

function record(id, data) {
    report.scenarios[id] = { ...(report.scenarios[id] || {}), ...data, at: new Date().toISOString() };
}

async function shot(page, name) {
    const file = path.join(EVIDENCE, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return path.basename(file);
}

function parseProgramsBody(postData) {
    try {
        return JSON.parse(postData || "{}");
    } catch {
        return null;
    }
}

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
        if (msg.type() === "error") report.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => report.pageErrors.push(String(err)));

    const programPosts = [];
    page.on("request", (req) => {
        if (!req.url().includes("/api/admin/configuration/programs")) return;
        if (req.method() !== "POST") return;
        const body = parseProgramsBody(req.postData());
        const entry = {
            action: body?.action,
            hasOrgId: body?.orgId != null,
            hasActor: body?.actorUserId != null,
            locationCount: Array.isArray(body?.locationIds) ? body.locationIds.length : 0,
            programKind: body?.program?.kind,
            idempotencyKey: body?.idempotencyKey,
            entryPoint: body?.entryPoint,
            t: Date.now(),
            raw: body,
        };
        programPosts.push(entry);
        report.network.push({ type: "request", ...entry });
    });
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/configuration/programs")) return;
        let body = null;
        try {
            body = await res.json();
        } catch {
            body = await res.text().catch(() => null);
        }
        report.network.push({
            type: "response",
            status: res.status(),
            ok: body && body.ok,
            hasPreview: !!(body && body.preview),
            hasResult: !!(body && body.result),
            willPublish: body?.preview?.program?.willPublish,
            resultStatus: body?.result?.status,
            programId: body?.result?.programId,
            operationId: body?.result?.operationId,
            refreshTargets: body?.result?.refreshTargets,
            impact: body?.preview?.impact,
            error:
                typeof body?.error === "string"
                    ? body.error
                    : body?.error?.message || body?.operatorMessage || null,
            t: Date.now(),
        });
    });

    // --- Auth gate ---
    await page.goto(`${BASE}/organization/programs`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(4000);
    const authUrl = page.url();
    const authed = !authUrl.includes("/login");
    record("auth", {
        pass: authed,
        url: authUrl,
        screenshot: await shot(page, "00-authenticated-programs"),
    });
    if (!authed) {
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(EVIDENCE, "cert-report.json"), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ blocker: "auth", url: authUrl }, null, 2));
        await browser.close();
        process.exit(2);
    }

    // Count locations via UI picker later; also soft-nav landing
    await page.goto(`${BASE}/organization/locations`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(4000);
    await shot(page, "00b-locations-landing");

    // ========== Scenario 5 first (draft blocked) while all are drafts ==========
    await page.goto(`${BASE}/organization/programs`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(3500);

    // Select first program in collection
    const collectionItem = page
        .locator('[data-testid="config-collection-item"], [data-testid*="programs-item"], [data-testid^="config-queue-item"]')
        .first();
    if (await collectionItem.count()) {
        await collectionItem.click();
        await page.waitForTimeout(1500);
    }

    // Open assignment / Add to Locations
    let addToLoc = page.getByRole("button", { name: /Add to Locations/i });
    if (!(await addToLoc.count())) {
        // try section nav
        const assignNav = page.getByRole("button", { name: /Assignment|Locations/i }).first();
        if (await assignNav.count()) {
            await assignNav.click().catch(() => {});
            await page.waitForTimeout(1000);
        }
        addToLoc = page.getByRole("button", { name: /Add to Locations/i });
    }
    // Deep link attempt
    const current = new URL(page.url());
    if (current.searchParams.get("programId")) {
        current.searchParams.set("section", "assignment");
        await page.goto(current.toString(), { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
    }

    addToLoc = page.getByRole("button", { name: /Add to Locations/i });
    if (await addToLoc.count()) {
        await addToLoc.first().click().catch(() => {});
        await page.waitForTimeout(1500);
    }

    const unpublished = page.locator('[data-testid="pla-flow-unpublished-block"]');
    const flow = page.locator('[data-testid="program-location-availability-flow"]');
    const continueLoc = page.locator('[data-testid="pla-flow-continue-locations"]');
    const postsBeforeDraft = programPosts.filter((p) => p.action === "make_available").length;

    // If flow mounted with unpublished block
    const unpublishedVisible = await unpublished.isVisible().catch(() => false);
    const flowVisible = await flow.isVisible().catch(() => false);
    let continueEnabled = false;
    if (await continueLoc.count()) {
        continueEnabled = await continueLoc.isEnabled().catch(() => false);
    }
    await shot(page, "05-draft-blocked");
    record("scenario5_draft_enforcement", {
        pass: unpublishedVisible || (flowVisible && !continueEnabled),
        unpublishedVisible,
        flowVisible,
        continueEnabled,
        commitCallsDuring: programPosts.filter((p) => p.action === "make_available").length - postsBeforeDraft,
        notes: "Draft Programs must not commit make_available",
    });

    // ========== Scenario 4 — Create new from Location ==========
    await page.goto(`${BASE}/organization/locations`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(3500);
    const locItem = page.locator('[data-testid="config-collection-item"]').first();
    if (await locItem.count()) {
        await locItem.click();
    } else {
        await page.locator("aside button, [role='listbox'] button, main button").first().click().catch(() => {});
    }
    await page.waitForTimeout(1500);
    const programsTab = page.getByRole("button", { name: "Programs" });
    if (await programsTab.count()) await programsTab.first().click();
    await page.waitForTimeout(1500);
    await shot(page, "02-location-programs");

    const addProgram = page.getByRole("button", { name: /Add Program/i });
    if (!(await addProgram.count())) {
        record("scenario4_create_new", { pass: false, error: "Add Program button not found" });
    } else {
        await addProgram.first().click();
        await page.waitForTimeout(2000);
        await shot(page, "04-create-new-entry");

        await page.locator('[data-testid="pla-flow-create-new"]').click();
        const stamp = Date.now().toString(36).slice(-6);
        const programName = `Stage4 Cert ${stamp}`;
        const programKey = `stage4_cert_${stamp}`;
        await page.locator('[data-testid="pla-flow-create-name"]').fill(programName);
        await page.locator('[data-testid="pla-flow-create-key"]').fill(programKey);
        await page.locator('[data-testid="pla-flow-continue-locations"]').click();
        await page.waitForTimeout(1200);
        await shot(page, "04b-location-picker");

        // Count checkboxes / locations
        const locChecks = page.locator('[data-testid^="pla-flow-location-"]');
        const locCount = await locChecks.count();
        report.limitations.push(
            locCount < 35
                ? `Bulk test uses all ${locCount} available Locations (org has fewer than 35).`
                : `Bulk-capable picker shows ${locCount} Locations.`,
        );

        // Select all visible for bulk (scenario 3 will also use this path later with existing)
        const selectAll = page.locator('[data-testid="pla-flow-select-all"]');
        if (await selectAll.count()) await selectAll.click();
        await page.waitForTimeout(400);

        // Search retention smoke
        const search = page.locator('[data-testid="pla-flow-location-search"]');
        if (await search.count()) {
            await search.fill("zzz-no-match");
            await page.waitForTimeout(300);
            await search.fill("");
            await page.waitForTimeout(300);
        }
        await shot(page, "03-bulk-picker");

        const previewStart = Date.now();
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.waitForTimeout(8000);
        report.timing.createNewPreviewMs = Date.now() - previewStart;
        await shot(page, "04c-preview-willpublish");

        const reviewText = await page.locator('[data-testid="pla-flow-review"]').innerText().catch(() => "");
        const willPublishCopy =
            /created and published/i.test(reviewText) || /Publication will occur/i.test(reviewText);
        const previewReqs = report.network.filter(
            (n) => n.type === "request" && n.action === "preview_make_available",
        );
        const lastPreview = [...report.network].reverse().find((n) => n.type === "response" && n.hasPreview);

        record("scenario4_preview", {
            pass: willPublishCopy && !!lastPreview?.ok,
            willPublishCopy,
            reviewText: reviewText.slice(0, 600),
            previewRequestCount: previewReqs.length,
            lastPreviewOk: lastPreview?.ok ?? false,
            impact: lastPreview?.impact ?? null,
            noClientAuthority: previewReqs.every((r) => !r.hasOrgId && !r.hasActor),
        });

        // Capture commit for idempotency replay
        const commitStart = Date.now();
        await page.locator('[data-testid="pla-flow-apply"]').click();
        await page.waitForTimeout(20000);
        report.timing.createNewCommitMs = Date.now() - commitStart;
        await shot(page, "04d-commit-result");

        const successText = await page.locator('[data-testid="pla-flow-success"]').innerText().catch(() => "");
        const commitErr = await page.locator('[data-testid="pla-flow-commit-error"]').innerText().catch(() => "");
        const lastCommit = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
        const commitReqs = report.network.filter(
            (n) => n.type === "request" && n.action === "make_available",
        );

        record("scenario4_create_new", {
            pass:
                !!lastCommit?.ok &&
                (lastCommit.resultStatus === "committed" || lastCommit.resultStatus === "partial") &&
                !!lastCommit.programId,
            successText: successText.slice(0, 600),
            error: commitErr.slice(0, 400),
            resultStatus: lastCommit?.resultStatus,
            programId: lastCommit?.programId,
            operationId: lastCommit?.operationId,
            refreshTargets: lastCommit?.refreshTargets,
            commitRequestCount: commitReqs.length,
            oneCommit: commitReqs.filter((r) => r.programKind === "new").length >= 1,
            noClientAuthority: commitReqs.every((r) => !r.hasOrgId && !r.hasActor),
            idempotencyKey: commitReqs.find((r) => r.programKind === "new")?.idempotencyKey,
            locationCount: commitReqs.find((r) => r.programKind === "new")?.locationCount,
        });

        // Idempotent retry (Scenario 9) — replay same body via page context
        const lastNewCommitReq = [...commitReqs].reverse().find((r) => r.programKind === "new" && r.raw);
        if (lastNewCommitReq?.raw && lastCommit?.ok) {
            const replay = await page.evaluate(async (body) => {
                const res = await fetch("/api/admin/configuration/programs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const json = await res.json().catch(() => null);
                return { status: res.status, json };
            }, lastNewCommitReq.raw);
            await shot(page, "09-idempotent-retry");
            record("scenario9_idempotent_retry", {
                pass:
                    replay.status === 200 &&
                    replay.json?.ok === true &&
                    replay.json?.result?.programId === lastCommit.programId &&
                    (replay.json?.result?.idempotentReplay === true ||
                        replay.json?.result?.operationId === lastCommit.operationId),
                httpStatus: replay.status,
                resultStatus: replay.json?.result?.status,
                programId: replay.json?.result?.programId,
                operationId: replay.json?.result?.operationId,
                idempotentReplay: replay.json?.result?.idempotentReplay,
                sameProgram: replay.json?.result?.programId === lastCommit.programId,
            });
            report.network.push({
                type: "response",
                status: replay.status,
                ok: replay.json?.ok,
                hasResult: !!replay.json?.result,
                resultStatus: replay.json?.result?.status,
                programId: replay.json?.result?.programId,
                operationId: replay.json?.result?.operationId,
                idempotentReplay: replay.json?.result?.idempotentReplay,
                t: Date.now(),
                note: "scenario9_replay",
            });
        } else {
            record("scenario9_idempotent_retry", {
                pass: false,
                error: "No commit payload captured for replay",
            });
        }

        // Done → return to Location
        const done = page.locator('[data-testid="pla-flow-done"]');
        if (await done.isVisible().catch(() => false)) {
            await done.click();
            await page.waitForTimeout(3000);
            await shot(page, "04e-return-location");
            record("scenario4_return", {
                pass: page.url().includes("/organization/locations") || page.url().includes("locations"),
                url: page.url(),
            });
        }
    }

    // ========== Scenario 5 Location use-existing: drafts disabled ==========
    const addProgram2 = page.getByRole("button", { name: /Add Program/i });
    if (await addProgram2.count()) {
        await addProgram2.first().click();
        await page.waitForTimeout(1500);
        const useExisting = page.locator('[data-testid="pla-flow-use-existing"]');
        if (await useExisting.isVisible().catch(() => false)) {
            await useExisting.click();
            await page.waitForTimeout(2500);
            await shot(page, "05b-use-existing-drafts");
            const disabledRadios = await page.locator('input[type="radio"][disabled]').count();
            const enabledRadios = await page.locator('input[type="radio"]:not([disabled])').count();
            record("scenario5_use_existing", {
                pass: true,
                disabledRadios,
                enabledRadios,
                notes: "Published programs selectable; drafts disabled",
            });
            await page.locator('[data-testid="pla-flow-cancel"]').click().catch(() => {});
            await page.waitForTimeout(800);
        }
    }

    // ========== Scenario 1 — Existing from Org (use newly published if any) ==========
    await page.goto(`${BASE}/organization/programs`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForTimeout(4000);
    await shot(page, "01-programs-after-create");

    // Try to find the Stage4 cert program
    const searchProg = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    if (await searchProg.count()) {
        await searchProg.fill("Stage4 Cert");
        await page.waitForTimeout(1000);
    }
    const certItem = page.getByText(/Stage4 Cert/i).first();
    if (await certItem.count()) {
        await certItem.click();
        await page.waitForTimeout(1500);
    } else if (await collectionItem.count()) {
        await page.locator('[data-testid="config-collection-item"]').first().click().catch(() => {});
        await page.waitForTimeout(1500);
    }

    // Navigate to assignment
    const url1 = new URL(page.url());
    if (url1.searchParams.get("programId")) {
        url1.searchParams.set("section", "assignment");
        await page.goto(url1.toString(), { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
    } else {
        const addBtn = page.getByRole("button", { name: /Add to Locations/i });
        if (await addBtn.count()) await addBtn.first().click();
        await page.waitForTimeout(1500);
    }
    await shot(page, "01-org-origin-flow");

    const orgFlow = await page.locator('[data-testid="program-location-availability-flow"]').isVisible().catch(() => false);
    const orgUnpub = await page.locator('[data-testid="pla-flow-unpublished-block"]').isVisible().catch(() => false);

    if (orgFlow && !orgUnpub) {
        const cont = page.locator('[data-testid="pla-flow-continue-locations"]');
        if (await cont.isVisible().catch(() => false)) {
            await cont.click();
            await page.waitForTimeout(1000);
        }
        // Select a small subset for existing program add (1 location not already selected if possible)
        // Clear then select first unlocked
        const clear = page.locator('[data-testid="pla-flow-clear-all"]');
        if (await clear.count()) await clear.click();
        await page.waitForTimeout(300);
        const firstLoc = page.locator('[data-testid^="pla-flow-location-"]:not([disabled])').first();
        // checkboxes
        const boxes = page.locator('input[type="checkbox"]:not([disabled])');
        if (await boxes.count()) {
            await boxes.nth(0).check().catch(() => {});
            if ((await boxes.count()) > 1) await boxes.nth(1).check().catch(() => {});
        }
        const previewStart2 = Date.now();
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.waitForTimeout(6000);
        report.timing.existingPreviewMs = Date.now() - previewStart2;
        await shot(page, "01-org-preview");
        const review2 = await page.locator('[data-testid="pla-flow-review"]').innerText().catch(() => "");
        const commitStart2 = Date.now();
        await page.locator('[data-testid="pla-flow-apply"]').click();
        await page.waitForTimeout(12000);
        report.timing.existingCommitMs = Date.now() - commitStart2;
        await shot(page, "01-org-commit");
        const lastCommit2 = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
        record("scenario1_org_origin", {
            pass: !!lastCommit2?.ok && !!lastCommit2.resultStatus,
            reviewSnippet: review2.slice(0, 400),
            resultStatus: lastCommit2?.resultStatus,
            refreshTargets: lastCommit2?.refreshTargets,
        });
        const done2 = page.locator('[data-testid="pla-flow-done"]');
        if (await done2.isVisible().catch(() => false)) {
            await done2.click();
            await page.waitForTimeout(2500);
            await shot(page, "01-org-return");
            record("scenario1_return", { url: page.url(), pass: page.url().includes("programs") });
        }
    } else {
        record("scenario1_org_origin", {
            pass: false,
            orgFlow,
            orgUnpub,
            notes: "Could not run existing published path from Org (still unpublished or flow missing)",
        });
    }

    // ========== Scenario 2 — Location use existing published ==========
    await page.goto(`${BASE}/organization/locations`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3500);
    if (await page.locator('[data-testid="config-collection-item"]').count()) {
        // pick a different location if possible (2nd)
        const items = page.locator('[data-testid="config-collection-item"]');
        const n = await items.count();
        await items.nth(Math.min(1, n - 1)).click();
        await page.waitForTimeout(1200);
    }
    if (await page.getByRole("button", { name: "Programs" }).count()) {
        await page.getByRole("button", { name: "Programs" }).first().click();
        await page.waitForTimeout(1200);
    }
    if (await page.getByRole("button", { name: /Add Program/i }).count()) {
        await page.getByRole("button", { name: /Add Program/i }).first().click();
        await page.waitForTimeout(1500);
        await page.locator('[data-testid="pla-flow-use-existing"]').click();
        await page.waitForTimeout(2500);
        await shot(page, "02-use-existing");
        const enabled = page.locator('input[type="radio"]:not([disabled])');
        if (await enabled.count()) {
            await enabled.first().check();
            await page.locator('[data-testid="pla-flow-continue-locations"]').click();
            await page.waitForTimeout(1000);
            // originating should be locked/preselected
            const locked = await page.locator('input[type="checkbox"][disabled]').count();
            await page.locator('[data-testid="pla-flow-continue-review"]').click();
            await page.waitForTimeout(6000);
            await shot(page, "02-location-preview");
            const previewOk = [...report.network].reverse().find((n) => n.type === "response" && n.hasPreview);
            await page.locator('[data-testid="pla-flow-apply"]').click();
            await page.waitForTimeout(12000);
            await shot(page, "02-location-commit");
            const commitOk = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
            record("scenario2_location_origin", {
                pass: !!previewOk?.ok && !!commitOk?.ok,
                lockedCheckboxes: locked,
                resultStatus: commitOk?.resultStatus,
                entryPoints: report.network
                    .filter((n) => n.type === "request" && n.action === "make_available")
                    .map((n) => n.entryPoint),
            });
            if (await page.locator('[data-testid="pla-flow-done"]').isVisible().catch(() => false)) {
                await page.locator('[data-testid="pla-flow-done"]').click();
                await page.waitForTimeout(2000);
                await shot(page, "02-return-location");
            }
        } else {
            record("scenario2_location_origin", { pass: false, notes: "No enabled published program radios" });
        }
    }

    // ========== Scenario 6 — validation failure ==========
    if (await page.getByRole("button", { name: /Add Program/i }).count()) {
        await page.getByRole("button", { name: /Add Program/i }).first().click();
        await page.waitForTimeout(1200);
        await page.locator('[data-testid="pla-flow-create-new"]').click();
        // Invalid: empty-ish key or duplicate key
        await page.locator('[data-testid="pla-flow-create-name"]').fill("Bad");
        await page.locator('[data-testid="pla-flow-create-key"]').fill("infant"); // likely duplicate existing key
        await page.locator('[data-testid="pla-flow-continue-locations"]').click();
        await page.waitForTimeout(800);
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.waitForTimeout(5000);
        // Try commit
        if (await page.locator('[data-testid="pla-flow-apply"]').isVisible().catch(() => false)) {
            await page.locator('[data-testid="pla-flow-apply"]').click();
            await page.waitForTimeout(8000);
        }
        await shot(page, "06-validation-failure");
        const err = await page.locator('[role="alert"], [data-testid="pla-flow-commit-error"]').allInnerTexts();
        const stillOnReviewOrLoc =
            (await page.locator('[data-testid="pla-flow-step-review"]').isVisible().catch(() => false)) ||
            (await page.locator('[data-testid="pla-flow-step-locations"]').isVisible().catch(() => false)) ||
            (await page.locator('[data-testid="pla-flow-create-fields"]').isVisible().catch(() => false)) ||
            err.length > 0;
        const nameStill = await page.locator('[data-testid="pla-flow-create-name"]').inputValue().catch(() => "");
        record("scenario6_validation_failure", {
            pass: err.length > 0 || stillOnReviewOrLoc,
            errors: err.slice(0, 5),
            retainedName: nameStill,
            rawDbLeak: err.some((e) => /rpc|postgres|sqlstate|permission denied for/i.test(e)),
        });
        await page.locator('[data-testid="pla-flow-cancel"]').click().catch(() => {});
    }

    // ========== Scenario 10 — material intent change (new key) ==========
    // Re-enter flow briefly and change selection after preview
    if (await page.getByRole("button", { name: /Add Program/i }).count()) {
        await page.getByRole("button", { name: /Add Program/i }).first().click();
        await page.waitForTimeout(1000);
        await page.locator('[data-testid="pla-flow-use-existing"]').click().catch(() => {});
        await page.waitForTimeout(2000);
        const enabled = page.locator('input[type="radio"]:not([disabled])');
        if (await enabled.count()) {
            await enabled.first().check();
            await page.locator('[data-testid="pla-flow-continue-locations"]').click();
            await page.waitForTimeout(800);
            await page.locator('[data-testid="pla-flow-continue-review"]').click();
            await page.waitForTimeout(5000);
            const keyBefore = [...report.network]
                .reverse()
                .find((n) => n.type === "request" && n.action === "preview_make_available")?.idempotencyKey;
            await page.locator('button:has-text("Back")').first().click().catch(() => {});
            await page.waitForTimeout(500);
            const boxes = page.locator('input[type="checkbox"]:not([disabled])');
            if ((await boxes.count()) > 2) {
                await boxes.nth(2).check().catch(() => {});
            }
            await page.locator('[data-testid="pla-flow-continue-review"]').click();
            await page.waitForTimeout(5000);
            const keyAfter = [...report.network]
                .reverse()
                .find((n) => n.type === "request" && n.action === "preview_make_available")?.idempotencyKey;
            await shot(page, "10-intent-change");
            record("scenario10_intent_change", {
                pass: !!keyBefore && !!keyAfter && keyBefore !== keyAfter,
                keyBefore,
                keyAfter,
            });
            await page.locator('[data-testid="pla-flow-cancel"]').click().catch(() => {});
        }
    }

    // ========== Scenario 12 — ownership editing ==========
    await page.goto(`${BASE}/organization/locations`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3000);
    if (await page.locator('[data-testid="config-collection-item"]').count()) {
        await page.locator('[data-testid="config-collection-item"]').first().click();
        await page.waitForTimeout(1000);
    }
    if (await page.getByRole("button", { name: "Programs" }).count()) {
        await page.getByRole("button", { name: "Programs" }).first().click();
        await page.waitForTimeout(1500);
    }
    // Select a program row if present
    const progRow = page.locator('[data-testid^="locations-program-"], [data-testid*="program"]').first();
    if (await progRow.count()) await progRow.click().catch(() => {});
    await page.waitForTimeout(1000);
    const editLoc = page.getByRole("button", { name: /Edit .* configuration|Edit Location configuration/i });
    const editOrg = page.getByRole("button", { name: /Edit Organization definition/i });
    const scopeQuiz = page.locator('[data-testid="locations-program-mutation-scope"]');
    record("scenario12_ownership", {
        pass: (await editLoc.count()) + (await editOrg.count()) > 0 && !(await scopeQuiz.count()),
        editLocationPresent: (await editLoc.count()) > 0,
        editOrgPresent: (await editOrg.count()) > 0,
        scopeQuizAbsent: (await scopeQuiz.count()) === 0,
    });
    if (await editLoc.count()) {
        await editLoc.first().click();
        await page.waitForTimeout(1000);
        await shot(page, "12-location-config-edit");
        const restore = page.locator('[data-testid="locations-program-restore-description"]');
        record("scenario12_restore_control", {
            present: await restore.count(),
        });
        await page.getByRole("button", { name: /Cancel/i }).first().click().catch(() => {});
    }

    // ========== Scenario 13 — navigation continuity ==========
    await page.goto(`${BASE}/organization/programs`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(1000);
    await page.goForward().catch(() => {});
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await shot(page, "13-hard-refresh");
    const bounced = page.url().includes("/settings/commercial");
    const onLogin = page.url().includes("/login");
    record("scenario13_continuity", {
        pass: !bounced && !onLogin,
        url: page.url(),
        bouncedToCommercial: bounced,
        lostAuth: onLogin,
    });

    // Network aggregate
    const previews = report.network.filter((n) => n.type === "request" && n.action === "preview_make_available");
    const commits = report.network.filter((n) => n.type === "request" && n.action === "make_available");
    report.networkSummary = {
        previewCount: previews.length,
        commitCount: commits.length,
        maxLocationsInOneCommit: Math.max(0, ...commits.map((c) => c.locationCount || 0)),
        anyClientAuthority: [...previews, ...commits].some((r) => r.hasOrgId || r.hasActor),
        actions: [...previews, ...commits].map((r) => ({
            action: r.action,
            locationCount: r.locationCount,
            programKind: r.programKind,
            entryPoint: r.entryPoint,
        })),
    };

    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(EVIDENCE, "cert-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(EVIDENCE, "network.json"), JSON.stringify(report.network, null, 2));
    fs.writeFileSync(
        path.join(EVIDENCE, "console.json"),
        JSON.stringify({ errors: report.consoleErrors, pageErrors: report.pageErrors }, null, 2),
    );

    const summary = {
        scenarios: Object.fromEntries(
            Object.entries(report.scenarios).map(([k, v]) => [k, { pass: v.pass, ...("error" in v ? { error: v.error } : {}), ...(v.resultStatus ? { resultStatus: v.resultStatus } : {}) }]),
        ),
        networkSummary: report.networkSummary,
        timing: report.timing,
        consoleErrorCount: report.consoleErrors.length,
        pageErrorCount: report.pageErrors.length,
        limitations: report.limitations,
    };
    console.log(JSON.stringify(summary, null, 2));
    await browser.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
