/**
 * Capability Certification — RECON pass.
 *
 * Read-only. Establishes what the live tenant actually exposes through What's Next, which
 * records the certification will need to diff, and whether executing the communication
 * capabilities would dispatch anything to a real person.
 *
 * Writes evidence to docs/sprints/active/assets/capability-certification/.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/capability-certification");

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("recon — what the live record exposes, and what executing it would touch", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const api: Array<{ url: string; status: number; ms: number }> = [];
    const bodies: Record<string, unknown> = {};
    page.on("response", async (res) => {
        const url = res.url();
        if (!url.includes("/api/")) return;
        api.push({ url, status: res.status(), ms: 0 });
        if (/stage-work|delivery-subjects|drawer-recipients|bookings|action-placements/.test(url)) {
            const text = await res.text().catch(() => "");
            try {
                bodies[url] = JSON.parse(text);
            } catch {
                bodies[url] = text.slice(0, 400);
            }
        }
    });

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // What the operator can actually click, straight off the rendered card.
    const actions = await page.evaluate(() => {
        const nodes = Array.from(
            document.querySelectorAll(
                "[data-work-primary-action], [data-work-supporting-action], [data-work-action]",
            ),
        );
        return nodes.map((n) => ({
            primary: n.getAttribute("data-work-primary-action"),
            supporting: n.getAttribute("data-work-supporting-action"),
            action: n.getAttribute("data-work-action"),
            label: (n.textContent ?? "").trim().slice(0, 60),
            disabled: (n as HTMLButtonElement).disabled ?? false,
        }));
    });

    const url = page.url();
    const oppMatch = /\/opportunit(?:y|ies)\/([0-9a-f-]{36})/i.exec(url);
    const anyOppId =
        oppMatch?.[1]
        ?? Object.keys(bodies)
            .map((u) => /opportunity\/([0-9a-f-]{36})/.exec(u)?.[1])
            .find(Boolean)
        ?? null;

    await page.screenshot({ path: path.join(OUT, "recon-whats-next.png"), fullPage: false });

    fs.writeFileSync(
        path.join(OUT, "recon.json"),
        JSON.stringify(
            {
                page_url: url,
                opportunity_id: anyOppId,
                rendered_actions: actions,
                api_calls: api.map((a) => a.url).sort(),
                captured_bodies: bodies,
            },
            null,
            2,
        ),
    );

    expect(actions.length).toBeGreaterThan(0);
});
