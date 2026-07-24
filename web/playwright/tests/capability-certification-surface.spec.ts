/**
 * Capability Certification — the focused What's Next surface.
 *
 * Read-only. Establishes what the remaining scoped capabilities actually resolve to on the live
 * tenant: requirement handoffs ("Still needed"), configured lifecycle transitions, and whether
 * Add Child / Add Family Member are exposed through What's Next at all.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/capability-certification");

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("surface — requirement handoffs, transitions, and what is NOT exposed", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1100 });

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(3500);

    const summaryText = (await card.innerText().catch(() => "")) as string;
    await page.screenshot({ path: path.join(OUT, "surface-summary.png") });

    // Drill into the focused surface, where requirement owners and transitions render.
    await card.locator('[data-work-action="open-focused"]').first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, "surface-focused.png"), fullPage: true });

    const focused = await page.evaluate(() => {
        const q = (sel: string) =>
            Array.from(document.querySelectorAll(sel)).map((n) => ({
                attrs: Object.fromEntries(
                    Array.from(n.attributes)
                        .filter((a) => a.name.startsWith("data-"))
                        .map((a) => [a.name, a.value]),
                ),
                label: (n.textContent ?? "").trim().slice(0, 80),
            }));
        return {
            all_work_actions: q("[data-work-action]"),
            primary_actions: q("[data-work-primary-action]"),
            supporting_actions: q("[data-work-supporting-action]"),
            requirement_owners: q("[data-work-readiness-owner], [data-work-readiness-owner-link]"),
            checklist_items: q("[data-work-checklist-item]"),
            transitions: q("[data-work-transition], [data-stage-transition]"),
            body_text: (document.body.innerText ?? "").slice(0, 4000),
        };
    });

    const exposed = new Set<string>([
        ...focused.primary_actions.map((a) => a.attrs["data-work-primary-action"]),
        ...focused.supporting_actions.map((a) => a.attrs["data-work-supporting-action"]),
    ]);

    const scopedButUnexposed = [
        "add_child",
        "add_family_member",
        "add_household_member",
        "update_enrollment_status",
        "mark_lost",
        "mark_won",
        "reschedule_tour",
    ].filter((k) => !exposed.has(k));

    fs.writeFileSync(
        path.join(OUT, "surface.json"),
        JSON.stringify(
            {
                summary_card_text: summaryText,
                exposed_capabilities: [...exposed],
                scoped_but_not_exposed: scopedButUnexposed,
                focused,
            },
            null,
            2,
        ),
    );

    expect(exposed.size).toBeGreaterThan(0);
});
