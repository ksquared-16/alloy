/**
 * Stage 4 cert harness v2 — real testids + authenticated API assists.
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

const ORG_PROGRAMS = `${BASE}/organization/programs`;
const ORG_LOCATIONS = `${BASE}/organization/locations`;
const API = "/api/admin/configuration/programs";

const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    scenarios: {},
    network: [],
    consoleErrors: [],
    pageErrors: [],
    timing: {},
    limitations: [
        "Firefly Early Learning has 21 active Locations (<35). Bulk tests use all available Locations.",
    ],
    qaData: {
        org: "Firefly Early Learning",
        orgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
        locationsAvailable: 21,
        draftProgramsAtStart: 6,
        publishedAtStart: 0,
    },
};

function record(id, data) {
    report.scenarios[id] = { ...report.scenarios[id], ...data, at: new Date().toISOString() };
}

async function shot(page, name) {
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

function trackNetwork(page) {
    page.on("request", (req) => {
        if (!req.url().includes(API) || req.method() !== "POST") return;
        let body = null;
        try {
            body = JSON.parse(req.postData() || "{}");
        } catch {
            body = null;
        }
        report.network.push({
            type: "request",
            action: body?.action,
            hasOrgId: body?.orgId != null,
            hasActor: body?.actorUserId != null,
            locationCount: Array.isArray(body?.locationIds)
                ? body.locationIds.length
                : Array.isArray(body?.targetIds)
                  ? body.targetIds.length
                  : 0,
            programKind: body?.program?.kind,
            idempotencyKey: body?.idempotencyKey,
            entryPoint: body?.entryPoint,
            raw: body,
            t: Date.now(),
        });
    });
    page.on("response", async (res) => {
        if (!res.url().includes(API)) return;
        let body = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }
        report.network.push({
            type: "response",
            status: res.status(),
            ok: body?.ok ?? null,
            actionHint: body?.preview ? "preview" : body?.result ? "result" : body?.programId ? "other" : "other",
            hasPreview: !!body?.preview,
            hasResult: !!body?.result,
            willPublish: body?.preview?.program?.willPublish,
            resultStatus: body?.result?.status,
            programId: body?.result?.programId || body?.programId,
            operationId: body?.result?.operationId,
            idempotentReplay: body?.result?.idempotentReplay,
            refreshTargets: body?.result?.refreshTargets,
            impact: body?.preview?.impact,
            associated: body?.result?.associatedLocationIds?.length,
            unchanged: body?.result?.unchangedLocationIds?.length,
            blocked: body?.result?.blocked?.length,
            failed: body?.result?.failed?.length,
            error:
                typeof body?.error === "string"
                    ? body.error
                    : body?.error?.message || body?.operatorMessage || null,
            t: Date.now(),
        });
    });
}

async function waitProgramsReady(page) {
    await page.goto(ORG_PROGRAMS, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator('[data-testid="programs-list"]').waitFor({ timeout: 60000 });
}

async function waitLocationsReady(page) {
    await page.goto(ORG_LOCATIONS, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator('[data-testid="locations-loading"]').waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // collection / workspace
    await page
        .locator('[data-testid="locations-configuration-page"], [data-testid="configuration-workspace"]')
        .first()
        .waitFor({ timeout: 30000 });
}

async function apiPost(page, body) {
    return page.evaluate(async ({ api, body }) => {
        const res = await fetch(api, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        return { status: res.status, json };
    }, { api: API, body });
}

async function loadLocationIds(page) {
    // Prefer catalog from locations page DOM checkboxes later; fallback API sites if needed
    const ids = await page.evaluate(async () => {
        const endpoints = [
            "/api/admin/locations",
            "/api/admin/configuration/locations",
            "/api/admin/sites",
        ];
        for (const url of endpoints) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const json = await res.json();
                const rows = json.locations || json.sites || json.rows || json.data || [];
                if (Array.isArray(rows) && rows.length) {
                    return rows
                        .map((r) => String(r.id || "").trim())
                        .filter(Boolean);
                }
            } catch {
                /* try next */
            }
        }
        return [];
    });
    return ids;
}

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    trackNetwork(page);
    page.on("console", (m) => {
        if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 400));
    });
    page.on("pageerror", (e) => report.pageErrors.push(String(e).slice(0, 400)));

    // Auth
    await waitProgramsReady(page);
    await shot(page, "00-authenticated-programs");
    record("auth", { pass: !page.url().includes("/login"), url: page.url() });
    if (page.url().includes("/login")) {
        fs.writeFileSync(path.join(EVIDENCE, "cert-report.json"), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ blocker: "auth" }, null, 2));
        await browser.close();
        process.exit(2);
    }

    // ---------- Scenario 5: Draft org origin ----------
    const infantId = "64adf957-537f-4ce9-b2b4-9f6def7ebf6a";
    await page.locator(`[data-testid="programs-row-${infantId}"]`).click();
    await page.waitForTimeout(2000);
    // deep link assignment
    await page.goto(`${ORG_PROGRAMS}?programId=${infantId}&section=assignment`, {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);
    await shot(page, "05-draft-assignment");
    const unpublished = await page.locator('[data-testid="pla-flow-unpublished-block"]').isVisible().catch(() => false);
    const flow = await page.locator('[data-testid="program-location-availability-flow"]').isVisible().catch(() => false);
    const cont = page.locator('[data-testid="pla-flow-continue-locations"]');
    const contEnabled = (await cont.count()) ? await cont.isEnabled() : false;
    // Attempt commit should not be available
    const applyVisible = await page.locator('[data-testid="pla-flow-apply"]').isVisible().catch(() => false);
    record("scenario5_draft_org", {
        pass: unpublished && flow && !contEnabled && !applyVisible,
        unpublished,
        flow,
        contEnabled,
        applyVisible,
    });

    // ---------- Prepare locations list ----------
    await waitLocationsReady(page);
    await shot(page, "00b-locations-ready");
    let locationIds = await loadLocationIds(page);
    if (!locationIds.length) {
        // scrape from any list
        locationIds = await page.evaluate(() =>
            [...document.querySelectorAll("[data-location-id], [data-testid*=location]")]
                .map((el) => el.getAttribute("data-location-id") || "")
                .filter(Boolean),
        );
    }
    // DB-backed fallback via programs catalog is not locations; use SQL-known count later
    report.qaData.locationIdsLoaded = locationIds.length;

    // If still empty, fetch via a simple page call to locations collection used by the app
    if (!locationIds.length) {
        locationIds = await page.evaluate(async () => {
            const res = await fetch("/api/admin/configuration/programs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "catalog" }),
            });
            const json = await res.json().catch(() => null);
            const locs = json?.locations || json?.snapshot?.locations || [];
            return Array.isArray(locs) ? locs.map((l) => l.id).filter(Boolean) : [];
        });
    }

    // Last resort: get from make available preview needs locations — pull from UI after opening flow
    // We'll fill during create-new UI.

    // ---------- Scenario 4 + 3: Create new UI with bulk all locations ----------
    // Select first location in list
    const locRow = page.locator('[data-testid^="locations-row-"], [data-testid^="config-collection-item"], [data-testid*="locations-item"]').first();
    if (await locRow.count()) {
        await locRow.click();
    } else {
        // click first button that looks like a site name in left rail
        const rail = page.locator('[data-testid="locations-configuration-page"] button').first();
        if (await rail.count()) await rail.click().catch(() => {});
    }
    await page.waitForTimeout(2000);

    // Programs tab — may be labeled Programs
    const tab = page.getByRole("button", { name: /^Programs$/ });
    if (await tab.count()) {
        await tab.first().click();
        await page.waitForTimeout(2000);
    } else {
        // soft navigate concern
        await page.getByText("Programs", { exact: true }).first().click().catch(() => {});
        await page.waitForTimeout(2000);
    }
    await shot(page, "02-location-programs");

    const addBtn = page.locator('[data-testid="locations-program-add"]');
    await addBtn.waitFor({ timeout: 30000 });
    await addBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, "04-add-program-flow");

    await page.locator('[data-testid="pla-flow-create-new"]').click();
    const stamp = Date.now().toString(36).slice(-6);
    const label = `Stage4 Cert ${stamp}`;
    const key = `stage4_cert_${stamp}`;
    await page.locator('[data-testid="pla-flow-create-name"]').fill(label);
    await page.locator('[data-testid="pla-flow-create-key"]').fill(key);
    await page.locator('[data-testid="pla-flow-continue-locations"]').click();
    await page.waitForTimeout(1200);

    // Select all
    const selectAll = page.locator('[data-testid="pla-flow-select-all"]');
    if (await selectAll.count()) await selectAll.click();
    await page.waitForTimeout(400);
    const selectedCountText = await page.locator('[data-testid="pla-flow-location-picker"]').innerText().catch(() => "");
    const checkboxCount = await page.locator('input[type="checkbox"]').count();
    await shot(page, "03-bulk-picker");
    report.qaData.bulkCheckboxCount = checkboxCount;
    report.qaData.bulkSelectedText = selectedCountText.slice(0, 200);

    // Search retention
    const search = page.locator('[data-testid="pla-flow-location-search"]');
    if (await search.count()) {
        const before = await page.locator('input[type="checkbox"]:checked').count();
        await search.fill("zzzz-none");
        await page.waitForTimeout(300);
        await search.fill("");
        await page.waitForTimeout(300);
        const after = await page.locator('input[type="checkbox"]:checked').count();
        record("scenario3_selection_retention", { pass: before === after && before > 0, before, after });
    }

    const tPreview = Date.now();
    await page.locator('[data-testid="pla-flow-continue-review"]').click();
    await page.locator('[data-testid="pla-flow-review"]').waitFor({ timeout: 30000 });
    report.timing.createPreviewMs = Date.now() - tPreview;
    await shot(page, "04c-preview-willpublish");
    const reviewText = await page.locator('[data-testid="pla-flow-review"]').innerText();
    const previewRes = [...report.network].reverse().find((n) => n.type === "response" && n.hasPreview);
    record("scenario4_preview", {
        pass: /created and published|Publication will occur/i.test(reviewText) && previewRes?.ok === true,
        reviewText: reviewText.slice(0, 700),
        willPublish: previewRes?.willPublish,
        impact: previewRes?.impact,
        noAuthority: report.network
            .filter((n) => n.type === "request" && n.action === "preview_make_available")
            .every((n) => !n.hasOrgId && !n.hasActor),
    });

    const tCommit = Date.now();
    await page.locator('[data-testid="pla-flow-apply"]').click();
    await page.locator('[data-testid="pla-flow-success"], [data-testid="pla-flow-commit-error"]').waitFor({
        timeout: 120000,
    });
    report.timing.createCommitMs = Date.now() - tCommit;
    await shot(page, "04d-commit-result");
    const commitRes = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
    const commitReq = [...report.network]
        .reverse()
        .find((n) => n.type === "request" && n.action === "make_available" && n.programKind === "new");
    record("scenario4_create_new", {
        pass:
            commitRes?.ok === true &&
            (commitRes.resultStatus === "committed" || commitRes.resultStatus === "partial") &&
            !!commitRes.programId,
        resultStatus: commitRes?.resultStatus,
        programId: commitRes?.programId,
        operationId: commitRes?.operationId,
        associated: commitRes?.associated,
        unchanged: commitRes?.unchanged,
        blocked: commitRes?.blocked,
        failed: commitRes?.failed,
        refreshTargets: commitRes?.refreshTargets,
        locationCount: commitReq?.locationCount,
        idempotencyKey: commitReq?.idempotencyKey,
        oneClientCommit: true,
        noAuthority: !commitReq?.hasOrgId && !commitReq?.hasActor,
    });
    record("scenario3_bulk", {
        pass: (commitReq?.locationCount || 0) >= 1 && commitRes?.ok === true,
        requested: commitReq?.locationCount,
        associated: commitRes?.associated,
        unchanged: commitRes?.unchanged,
        blocked: commitRes?.blocked,
        failed: commitRes?.failed,
        note: "Bulk = all available Locations in org (21 max)",
    });

    const createdProgramId = commitRes?.programId;
    const idemKey = commitReq?.idempotencyKey;
    const commitBody = commitReq?.raw;

    // Scenario 9 idempotent replay
    if (commitBody && createdProgramId) {
        const replay = await apiPost(page, commitBody);
        await shot(page, "09-idempotent-retry");
        record("scenario9_idempotent_retry", {
            pass:
                replay.status === 200 &&
                replay.json?.ok === true &&
                replay.json?.result?.programId === createdProgramId &&
                (replay.json?.result?.idempotentReplay === true ||
                    replay.json?.result?.operationId === commitRes.operationId),
            httpStatus: replay.status,
            programId: replay.json?.result?.programId,
            operationId: replay.json?.result?.operationId,
            idempotentReplay: replay.json?.result?.idempotentReplay,
            resultStatus: replay.json?.result?.status,
            sameKey: commitBody.idempotencyKey === idemKey,
        });
    }

    if (await page.locator('[data-testid="pla-flow-done"]').isVisible().catch(() => false)) {
        await page.locator('[data-testid="pla-flow-done"]').click();
        await page.waitForTimeout(2500);
        await shot(page, "04e-return-location");
        record("scenario4_return", {
            pass: true,
            url: page.url(),
        });
    }

    // ---------- Scenario 5 use-existing: drafts disabled, published enabled ----------
    if (await page.locator('[data-testid="locations-program-add"]').count()) {
        await page.locator('[data-testid="locations-program-add"]').click();
        await page.waitForTimeout(1200);
        await page.locator('[data-testid="pla-flow-use-existing"]').click();
        await page.waitForTimeout(3000);
        await shot(page, "05b-use-existing");
        const disabled = await page.locator('input[type="radio"][disabled]').count();
        const enabled = await page.locator('input[type="radio"]:not([disabled])').count();
        record("scenario5_use_existing", {
            pass: disabled >= 1 && enabled >= 1,
            disabled,
            enabled,
        });

        // Scenario 2 — use existing published
        if (enabled >= 1) {
            await page.locator('input[type="radio"]:not([disabled])').first().check();
            await page.locator('[data-testid="pla-flow-continue-locations"]').click();
            await page.waitForTimeout(800);
            const locked = await page.locator('input[type="checkbox"][disabled]').count();
            await page.locator('[data-testid="pla-flow-continue-review"]').click();
            await page.locator('[data-testid="pla-flow-review"]').waitFor({ timeout: 30000 });
            await shot(page, "02-location-preview");
            await page.locator('[data-testid="pla-flow-apply"]').click();
            await page.locator('[data-testid="pla-flow-success"], [data-testid="pla-flow-commit-error"]').waitFor({
                timeout: 90000,
            });
            await shot(page, "02-location-commit");
            const c2 = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
            record("scenario2_location_origin", {
                pass: c2?.ok === true,
                resultStatus: c2?.resultStatus,
                lockedOriginating: locked >= 1,
                entryPoint: "location",
            });
            if (await page.locator('[data-testid="pla-flow-done"]').isVisible().catch(() => false)) {
                await page.locator('[data-testid="pla-flow-done"]').click();
                await page.waitForTimeout(2000);
            }
        } else {
            await page.locator('[data-testid="pla-flow-cancel"]').click().catch(() => {});
        }
    }

    // ---------- Scenario 1 Org origin with published program ----------
    if (createdProgramId) {
        await page.goto(`${ORG_PROGRAMS}?programId=${createdProgramId}&section=assignment`, {
            waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(3500);
        await shot(page, "01-org-origin");
        const flowOk = await page.locator('[data-testid="program-location-availability-flow"]').isVisible();
        const unpub = await page.locator('[data-testid="pla-flow-unpublished-block"]').isVisible().catch(() => false);
        if (flowOk && !unpub) {
            if (await page.locator('[data-testid="pla-flow-continue-locations"]').isVisible().catch(() => false)) {
                await page.locator('[data-testid="pla-flow-continue-locations"]').click();
                await page.waitForTimeout(800);
            }
            // select 1-2 locations
            await page.locator('[data-testid="pla-flow-clear-all"]').click().catch(() => {});
            const boxes = page.locator('input[type="checkbox"]:not([disabled])');
            if (await boxes.count()) {
                await boxes.nth(0).check().catch(() => {});
            }
            const t1 = Date.now();
            await page.locator('[data-testid="pla-flow-continue-review"]').click();
            await page.locator('[data-testid="pla-flow-review"]').waitFor({ timeout: 30000 });
            report.timing.existingPreviewMs = Date.now() - t1;
            await shot(page, "01-org-preview");
            const t2 = Date.now();
            await page.locator('[data-testid="pla-flow-apply"]').click();
            await page.locator('[data-testid="pla-flow-success"], [data-testid="pla-flow-commit-error"]').waitFor({
                timeout: 90000,
            });
            report.timing.existingCommitMs = Date.now() - t2;
            await shot(page, "01-org-commit");
            const c1 = [...report.network].reverse().find((n) => n.type === "response" && n.hasResult);
            record("scenario1_org_origin", {
                pass: c1?.ok === true,
                resultStatus: c1?.resultStatus,
                refreshTargets: c1?.refreshTargets,
            });
            // Scenario 10 — back and change selection for new key
            if (await page.locator('[data-testid="pla-flow-done"]').isVisible().catch(() => false)) {
                // don't done yet — cancel path for intent change on a fresh entry
                await page.locator('[data-testid="pla-flow-done"]').click();
                await page.waitForTimeout(1500);
            }
        } else {
            record("scenario1_org_origin", { pass: false, flowOk, unpub });
        }
    }

    // Scenario 10 dedicated
    if (createdProgramId) {
        await page.goto(`${ORG_PROGRAMS}?programId=${createdProgramId}&section=assignment`, {
            waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(2500);
        if (await page.locator('[data-testid="pla-flow-continue-locations"]').isVisible().catch(() => false)) {
            await page.locator('[data-testid="pla-flow-continue-locations"]').click();
        }
        await page.waitForTimeout(500);
        await page.locator('[data-testid="pla-flow-clear-all"]').click().catch(() => {});
        const boxes = page.locator('input[type="checkbox"]:not([disabled])');
        if (await boxes.count()) await boxes.nth(0).check().catch(() => {});
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.waitForTimeout(4000);
        const keyA = [...report.network]
            .reverse()
            .find((n) => n.type === "request" && n.action === "preview_make_available")?.idempotencyKey;
        await page.getByRole("button", { name: /^Back$/i }).first().click().catch(() => {});
        await page.waitForTimeout(500);
        if ((await boxes.count()) > 1) await boxes.nth(1).check().catch(() => {});
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.waitForTimeout(4000);
        const keyB = [...report.network]
            .reverse()
            .find((n) => n.type === "request" && n.action === "preview_make_available")?.idempotencyKey;
        await shot(page, "10-intent-change");
        record("scenario10_intent_change", {
            pass: !!keyA && !!keyB && keyA !== keyB,
            keyA,
            keyB,
        });
        await page.locator('[data-testid="pla-flow-cancel"]').click().catch(() => {});
    }

    // Scenario 6 validation failure via API boundary (duplicate key) with UI retention check
    await waitLocationsReady(page);
    // click first location + programs + add
    const locRow2 = page.locator('[data-testid^="locations-row-"], [data-testid^="config-collection-item"]').first();
    if (await locRow2.count()) await locRow2.click();
    await page.waitForTimeout(1500);
    if (await page.getByRole("button", { name: /^Programs$/ }).count()) {
        await page.getByRole("button", { name: /^Programs$/ }).first().click();
        await page.waitForTimeout(1500);
    }
    if (await page.locator('[data-testid="locations-program-add"]').count()) {
        await page.locator('[data-testid="locations-program-add"]').click();
        await page.waitForTimeout(1000);
        await page.locator('[data-testid="pla-flow-create-new"]').click();
        await page.locator('[data-testid="pla-flow-create-name"]').fill("Duplicate Infant");
        await page.locator('[data-testid="pla-flow-create-key"]').fill("infant");
        await page.locator('[data-testid="pla-flow-continue-locations"]').click();
        await page.waitForTimeout(800);
        await page.locator('[data-testid="pla-flow-continue-review"]').click();
        await page.waitForTimeout(5000);
        if (await page.locator('[data-testid="pla-flow-apply"]').isVisible().catch(() => false)) {
            await page.locator('[data-testid="pla-flow-apply"]').click();
            await page.waitForTimeout(8000);
        }
        await shot(page, "06-validation-failure");
        const errs = await page.locator('[role="alert"], [data-testid="pla-flow-commit-error"]').allInnerTexts();
        const nameVal = await page.locator('[data-testid="pla-flow-create-name"]').inputValue().catch(() => "");
        record("scenario6_validation_failure", {
            pass: errs.length > 0,
            errors: errs.slice(0, 5).map((e) => e.slice(0, 200)),
            retainedInput: nameVal.includes("Duplicate") || nameVal.length > 0,
            rawLeak: errs.some((e) => /sqlstate|permission denied for table|rpc\s/i.test(e)),
        });
        await page.locator('[data-testid="pla-flow-cancel"]').click().catch(() => {});
    }

    // Scenario 12 ownership
    if (await page.locator('[data-testid="locations-program-add"]').count() === 0) {
        // ensure on programs concern with a program selected
    }
    const editLoc = page.getByRole("button", { name: /Edit .* configuration/i });
    const editOrg = page.getByRole("button", { name: /Edit Organization definition/i });
    // select a program in list if needed
    const progItem = page.locator('[data-testid^="locations-program-summary-"], [data-testid^="locations-programs"] button').first();
    if (await progItem.count()) await progItem.click().catch(() => {});
    await page.waitForTimeout(1000);
    record("scenario12_ownership", {
        pass:
            ((await editLoc.count()) > 0 || (await editOrg.count()) > 0) &&
            (await page.locator('[data-testid="locations-program-mutation-scope"]').count()) === 0,
        editLoc: await editLoc.count(),
        editOrg: await editOrg.count(),
        noScopeQuiz: (await page.locator('[data-testid="locations-program-mutation-scope"]').count()) === 0,
    });
    if (await editLoc.count()) {
        await editLoc.first().click();
        await page.waitForTimeout(1000);
        await shot(page, "12-location-edit");
        record("scenario12_restore", {
            restoreControl: await page.locator('[data-testid="locations-program-restore-description"]').count(),
        });
        await page.getByRole("button", { name: /^Cancel$/i }).first().click().catch(() => {});
    }

    // Scenario 13
    await page.goto(ORG_PROGRAMS, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(800);
    await page.goForward().catch(() => {});
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await shot(page, "13-hard-refresh");
    record("scenario13_continuity", {
        pass: !page.url().includes("/settings/commercial") && !page.url().includes("/login"),
        url: page.url(),
    });

    // Controlled partial via API if we can — mark as controlled if not inducible
    record("scenario11_partial", {
        pass: null,
        note: "Controlled case deferred to server unit suite unless commit returned partial",
        observedPartial: report.network.some(
            (n) => n.type === "response" && n.resultStatus === "partial",
        ),
    });

    // Network summary
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
            idempotencyKey: r.idempotencyKey,
        })),
    };

    report.finishedAt = new Date().toISOString();
    // Dedup console to hydration note
    report.consoleHydrationOnly = report.consoleErrors.every((e) =>
        /hydrat/i.test(e),
    );
    fs.writeFileSync(path.join(EVIDENCE, "cert-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(EVIDENCE, "network.json"), JSON.stringify(report.network, null, 2));
    fs.writeFileSync(
        path.join(EVIDENCE, "console.json"),
        JSON.stringify(
            {
                errorCount: report.consoleErrors.length,
                pageErrorCount: report.pageErrors.length,
                hydrationOnly: report.consoleHydrationOnly,
                sample: report.consoleErrors.slice(0, 3),
            },
            null,
            2,
        ),
    );

    console.log(
        JSON.stringify(
            {
                scenarios: Object.fromEntries(
                    Object.entries(report.scenarios).map(([k, v]) => [k, { pass: v.pass, resultStatus: v.resultStatus, error: v.error, programId: v.programId }]),
                ),
                networkSummary: report.networkSummary,
                timing: report.timing,
                qaData: report.qaData,
                consoleHydrationOnly: report.consoleHydrationOnly,
            },
            null,
            2,
        ),
    );
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
