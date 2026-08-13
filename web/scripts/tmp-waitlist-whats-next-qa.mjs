/**
 * Waitlist What's Next browser acceptance probe (Slot 5 / :3015).
 * Evidence → docs/audits/active/enrollment-e2e-waitlist-whats-next/
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const outDir =
    "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-waitlist-whats-next";
fs.mkdirSync(outDir, { recursive: true });
const storage = path.join(
    process.env.HOME,
    ".local/state/alloy-dev/auth/slot5/storage-state.json",
);
const base = process.env.ALLOY_QA_BASE || "http://127.0.0.1:3015";

const browser = await chromium.launch({ headless: true });
const page = await (
    await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 980 } })
).newPage();
page.setDefaultTimeout(30000);
const log = [];
const step = (m, extra) => {
    console.log("STEP", m, extra ? JSON.stringify(extra).slice(0, 500) : "");
    log.push({ step: m, ...(extra || {}) });
};

try {
    await page.goto(`${base}/workspace/work-unit/waitlist`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
    });
    await page.waitForSelector("[data-entity-id]", { timeout: 90000 });
    const rows = page.locator("[data-entity-id]");
    const count = await rows.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
        const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
        if (/Lennon/i.test(t)) {
            await rows.nth(i).click();
            clicked = true;
            step("row", { i, t: t.slice(0, 140) });
            break;
        }
    }
    if (!clicked) {
        await rows.first().click();
        step("row-fallback", { count });
    }
    await page.waitForTimeout(5000);

    const summary = await page.evaluate(() => {
        const card = document.querySelector(
            "[data-current-work-surface='true'], [data-work-card='true']",
        );
        return {
            insight: card?.querySelector(".alloy-os-ucard__insight")?.textContent?.trim() || null,
            status: card?.querySelector(".alloy-os-ucard__status")?.textContent?.trim() || null,
            progress: !!document.querySelector("[data-work-progress='true']"),
            progressLabels: [
                ...document.querySelectorAll(
                    "[data-work-progress] .alloy-os-currentwork__progress-item-label",
                ),
            ]
                .map((el) => el.textContent?.trim())
                .filter(Boolean),
            currentWork:
                document.querySelector("[data-work-current-label]")?.textContent?.trim() || null,
            facts: [...document.querySelectorAll("[data-work-context-fact]")].map((el) => ({
                key: el.getAttribute("data-work-context-fact"),
                text: el.textContent?.replace(/\s+/g, " ").trim(),
            })),
            perspective: document
                .querySelector("[data-work-card]")
                ?.getAttribute("data-work-card-perspective"),
            slice: (card?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 550),
        };
    });
    step("summary", summary);
    await page.screenshot({ path: path.join(outDir, "01-waitlist-whats-next-summary.png") });

    let sendForm = page.locator(".alloy-os-currentwork button").filter({ hasText: /Send form/i }).first();
    if (!(await sendForm.count())) {
        const header = page
            .locator(
                "[data-current-work-surface='true'] .alloy-os-ucard__header, [data-work-card='true'] .alloy-os-ucard__header",
            )
            .first();
        if (await header.count()) await header.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1500);
        sendForm = page.locator(".alloy-os-currentwork button").filter({ hasText: /Send form/i }).first();
    }

    if (await sendForm.count()) {
        await sendForm.click();
        await page.waitForTimeout(3000);
        step("opened-send-form", {
            perspective: await page.locator("[data-work-card]").first().getAttribute("data-work-card-perspective"),
            capability: await page.locator("[data-work-card]").first().getAttribute("data-capability-active"),
            elevated: await page.locator("[data-fp-elevated='true']").count(),
        });
        await page.screenshot({ path: path.join(outDir, "02-send-form-open.png") });
        const closeBtn = page.locator(
                "button[aria-label='Return to work surface'][data-fp-scrim-armed='true']",
            ).first();
        await closeBtn.click({ timeout: 10000 });
        await page.waitForTimeout(1800);
        const afterClose = await page.evaluate(() => ({
            perspective: document
                .querySelector("[data-work-card]")
                ?.getAttribute("data-work-card-perspective"),
            capability: document
                .querySelector("[data-work-card]")
                ?.getAttribute("data-capability-active"),
            elevated: !!document.querySelector("[data-fp-elevated='true']"),
            panel: !!document.querySelector("[data-work-action-surface]"),
            focusedClose: !!document.querySelector("[data-work-action='close-focused']"),
        }));
        step("after-close", afterClose);
        await page.screenshot({ path: path.join(outDir, "03-after-close-focus-panel.png") });
    } else {
        step("no-send-form");
    }

    const tour = page
        .locator(
            ".alloy-os-currentwork button[data-work-tour-menu-trigger='true'], .alloy-os-currentwork button",
        )
        .filter({ hasText: /^Tour/ })
        .first();
    if (await tour.count()) {
        await tour.click();
        await page.waitForTimeout(700);
        const menu = await page.evaluate(() => {
            const m = document.querySelector("[data-work-tour-menu='true'], [role='menu']");
            if (!m) return null;
            const cs = getComputedStyle(m);
            return {
                items: [...m.querySelectorAll("[role='menuitem']")].map((el) =>
                    el.textContent?.trim(),
                ),
                bg: cs.backgroundColor,
                border: cs.borderTopColor,
                radius: cs.borderRadius,
            };
        });
        step("tour-menu", menu);
        await page.screenshot({ path: path.join(outDir, "04-tour-menu.png") });
    } else {
        step("no-tour");
    }
} catch (e) {
    step("ERROR", { message: String(e.message || e) });
    await page.screenshot({ path: path.join(outDir, "error.png") }).catch(() => {});
} finally {
    fs.writeFileSync(path.join(outDir, "browser-qa.json"), JSON.stringify(log, null, 2));
    await browser.close();
}
