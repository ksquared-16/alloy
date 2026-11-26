/**
 * BOS Actionable Interface — Create Lead command-session smoke.
 *
 * Requires a pre-authenticated Playwright storage state (never embeds credentials):
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3012 \
 *   PLAYWRIGHT_STORAGE_STATE=$HOME/.local/state/alloy-dev/auth/slot2/storage-state.json \
 *   npx playwright test playwright/tests/bos-create-lead-command-session-smoke.spec.ts
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
const WU_SLUG = process.env.WU_SLUG_A || "new-leads";
const EVIDENCE_DIR =
    process.env.BOS_QA_EVIDENCE_DIR?.trim() ||
    path.resolve(__dirname, "../../../../docs/sprints/active/bos-actionable-interface/evidence");

test.beforeAll(() => {
    test.skip(!STORAGE_STATE, "Set PLAYWRIGHT_STORAGE_STATE to a slot auth storage-state.json");
    test.skip(!STORAGE_STATE || !fs.existsSync(STORAGE_STATE), `Missing storage state at ${STORAGE_STATE}`);
});

if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

test("Actions-style open starts BOS Create Lead session with Conversation/Form", async ({ page }) => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

    await page.goto(`/adminV2/workspace/work-unit/${WU_SLUG}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
    });

    // Resolve department from the live page when possible; fall back to event detail from host.
    const departmentId = await page.evaluate(() => {
        const el = document.querySelector("[data-department-id]");
        return el?.getAttribute("data-department-id")?.trim() || null;
    });

    await page.evaluate((deptId) => {
        window.dispatchEvent(
            new CustomEvent("adminv2:open-create-lead", {
                detail: {
                    department_id: deptId,
                    work_unit_id: null,
                },
            }),
        );
    }, departmentId);

    // If department was unknown, try again after reading common bootstrap attrs.
    const host = page.locator("[data-bos-command-session-host='true']");
    if (!(await host.isVisible().catch(() => false))) {
        const deptFromChrome = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll("[data-department-id], [data-dept-id]"));
            for (const node of candidates) {
                const v =
                    node.getAttribute("data-department-id") ||
                    node.getAttribute("data-dept-id");
                if (v?.trim()) return v.trim();
            }
            return null;
        });
        test.skip(!deptFromChrome, "Could not resolve department_id on the Work Unit page for Create Lead open");
        await page.evaluate((deptId) => {
            window.dispatchEvent(
                new CustomEvent("adminv2:open-create-lead", {
                    detail: { department_id: deptId, work_unit_id: null },
                }),
            );
        }, deptFromChrome);
    }

    await expect(host).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-bos-command-session-mode-tab='conversation']")).toBeVisible();
    await expect(page.locator("[data-bos-command-session-mode-tab='form']")).toBeVisible();
    await expect(page.locator("[data-create-lead-modal]")).toHaveCount(0);

    // Visual punch-list: Bend Pine header background on the BOS chrome (semantic token).
    const header = page.locator("[data-bos-header], [data-component='BosHeader'], header").first();
    if (await header.count()) {
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, "01-bos-session-open.png"),
            fullPage: false,
        });
    } else {
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, "01-bos-session-open.png"),
            fullPage: false,
        });
    }

    const sample = [
        "Parent: Jordan Lee, jordan.lee@example.com, 555-0100",
        "Child: Sam Lee, interested in Toddler program",
    ].join("\n");

    const composer = page.locator("[data-bos-command-session-composer='true']");
    await expect(composer).toBeVisible();
    await composer.fill(sample);
    await page.locator("[data-bos-command-session-analyze]").click();

    await page.locator("[data-bos-command-session-mode-tab='form']").click();
    await expect(page.locator("[data-bos-command-session-mode-body='form']")).toBeVisible({
        timeout: 15_000,
    });
    await page.screenshot({
        path: path.join(EVIDENCE_DIR, "02-form-mode-shared-draft.png"),
        fullPage: false,
    });

    await page.locator("[data-bos-command-session-mode-tab='conversation']").click();
    await expect(page.locator("[data-bos-command-session-mode-body='conversation']")).toBeVisible();
    await page.screenshot({
        path: path.join(EVIDENCE_DIR, "03-conversation-mode-return.png"),
        fullPage: false,
    });
});
