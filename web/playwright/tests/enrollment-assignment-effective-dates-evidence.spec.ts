/**
 * Sprint evidence — Enrollment Assignment & Effective Dates (slot 3).
 * Uses Vacilando storage-state; does not mutate shared sibling-sprint data beyond
 * reading Focus Panel Assignments card chrome on an existing opportunity when available.
 *
 * Run:
 *   cd web && npx playwright test playwright/tests/enrollment-assignment-effective-dates-evidence.spec.ts \
 *     --config=playwright.config.ts
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const STORAGE = path.join(
    process.env.HOME ?? "",
    ".local/state/alloy-dev/auth/slot3/storage-state.json",
);
const EVIDENCE_DIR = path.join(
    process.cwd(),
    "../.alloy-agent-evidence/enrollment-assignment-effective-dates/browser",
);

test.use({ storageState: STORAGE });

test.describe("Enrollment Assignment evidence (slot 3)", () => {
    test.beforeAll(() => {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    });

    test("authenticated home loads", async ({ page }) => {
        test.setTimeout(120_000);
        await page.goto("/workspace", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, "01-authenticated-workspace.png"),
            fullPage: true,
        });
        expect(page.url()).not.toMatch(/\/login/);
    });

    test("Assignments card section chrome when Focus Panel available", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto("/workspace", { waitUntil: "networkidle" });
        await page.getByText("Thinking...").waitFor({ state: "hidden", timeout: 90_000 }).catch(() => undefined);
        await page.waitForTimeout(2000);

        // Open first queue row if present — soft path; capture whatever Focus Panel shows.
        const row = page.locator("[data-queue-row], [data-work-unit-row], a[href*='opportunity']").first();
        if (await row.count()) {
            await row.click({ timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(2500);
        }

        const assignments = page.locator("[data-assignments-card='true'], [data-scheduling-card='true']");
        const sections = page.locator("[data-assignment-card-sections='true']");
        const makePrimary = page.locator("[data-household-make-primary-contact='true']");
        const primaryBadge = page.locator(".alloy-os-household__primary-badge");

        await page.screenshot({
            path: path.join(EVIDENCE_DIR, "02-focus-panel-or-workspace.png"),
            fullPage: true,
        });

        // Soft assertions — environment may lack seeded enrollment leads.
        const hasAssignments = (await assignments.count()) > 0;
        const hasSections = (await sections.count()) > 0;
        fs.writeFileSync(
            path.join(EVIDENCE_DIR, "evidence-notes.json"),
            JSON.stringify(
                {
                    url: page.url(),
                    hasAssignmentsCard: hasAssignments,
                    hasAssignmentSections: hasSections,
                    hasMakePrimaryControl: (await makePrimary.count()) > 0,
                    hasPrimaryBadge: (await primaryBadge.count()) > 0,
                    capturedAt: new Date().toISOString(),
                },
                null,
                2,
            ),
        );

        if (hasSections) {
            await sections.first().screenshot({
                path: path.join(EVIDENCE_DIR, "03-assignment-sections.png"),
            });
            for (const key of [
                "family_request",
                "proposed_assignment",
                "commercial_estimate",
                "committed_assignment",
                "readiness_gaps",
            ]) {
                await expect(page.locator(`[data-assignment-section='${key}']`).first()).toBeVisible({
                    timeout: 5000,
                });
            }
        }
    });
});
