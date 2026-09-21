/**
 * §10 — the Policies visual before-state, measured as COMPUTED COLOR on the running product.
 *
 * The source audit of the Financials configuration tree finds no blue/navy ACTION chrome: the only
 * blue is a `read_only` status badge, which the instruction explicitly permits as semantic. Kelly
 * saw blue in a screenshot, so it comes from somewhere source-grep did not reach — a shared
 * primitive, a global stylesheet, or a browser default. This asks the browser.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice3";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Policies: what is actually blue, and is it an action or a status", async ({ page }) => {
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    const open = page.getByRole("button", { name: /open policies/i }).first();
    await expect(open, "the Policies tile opens from its own button").toHaveCount(1);
    await open.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);

    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${build.gitSha} ${build.nodeEnv}`);

    /* Every interactive element, with the colours the browser actually paints. */
    const measured = await page.evaluate(() => {
        const bluish = (rgb: string) => {
            const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
            if (!m) return false;
            const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
            /* Blue-dominant and not a neutral grey: b clearly ahead of r, and some saturation. */
            return b > r + 25 && b > g + 15 && Math.max(r, g, b) - Math.min(r, g, b) > 30;
        };
        const out: Record<string, unknown>[] = [];
        for (const el of Array.from(document.querySelectorAll("button, a, [role=tab], input, select, [role=button]"))) {
            const cs = getComputedStyle(el as HTMLElement);
            const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim().slice(0, 40) ?? "";
            const hit = bluish(cs.backgroundColor) || bluish(cs.color) || bluish(cs.borderTopColor);
            if (!hit) continue;
            out.push({
                tag: el.tagName,
                role: el.getAttribute("role"),
                text,
                background: cs.backgroundColor,
                color: cs.color,
                border: cs.borderTopColor,
                className: (el.getAttribute("class") ?? "").slice(0, 90),
            });
        }
        return {
            bluishInteractive: out,
            totalInteractive: document.querySelectorAll("button, a, [role=tab], input, select, [role=button]").length,
            /* Bend Pine is the canonical action treatment — how much of the screen already uses it? */
            bendPineElements: document.querySelectorAll("[class*='bend-pine']").length,
            nativeSelects: document.querySelectorAll("select").length,
            heading: document.querySelector("h1,h2")?.textContent?.trim() ?? null,
        };
    });
    log(`POLICIES heading=${JSON.stringify(measured.heading)} interactive=${measured.totalInteractive} bendPine=${measured.bendPineElements} nativeSelects=${measured.nativeSelects}`);
    log(`BLUISH INTERACTIVE (${(measured.bluishInteractive as unknown[]).length}):`);
    for (const e of measured.bluishInteractive as Record<string, unknown>[]) log(`   ${JSON.stringify(e)}`);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/policies-visual-before.json`, JSON.stringify({ build, measured }, null, 2));
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1050 });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/policies-${w}.png`, fullPage: true });
    }
});
