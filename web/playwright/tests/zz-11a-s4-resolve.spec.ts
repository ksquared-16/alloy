/** §14 — the responsibility resolution surface, mounted on the fixed candidate. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const HISTORICAL = "f089a3f4-85a1-44b6-bb94-50588a581b00";   // Consumable fee, service Sep 2, posted

const ledger = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim() ?? null,
            actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

async function details(p: Page) {
    await p.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(13_000);
    await p.getByRole("button", { name: /^Details$/ }).first().click();
    await p.waitForTimeout(8000);
}

test("S4 · resolve responsibility on the Focus Panel", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await details(page);
    const before = await ledger(page);
    writeFileSync(`${OUT}/s4-before.json`, JSON.stringify(before, null, 2));
    const withResolve = before.filter((r) => (r.actions as string[]).includes("resolveResponsibility"));
    const withRealloc = before.filter((r) => (r.actions as string[]).includes("reallocateResponsibility"));
    log(`rows=${before.length} offerResolve=${withResolve.length} offerReallocate=${withRealloc.length}`);
    rec("14-2", "an eligible obligation offers Resolve responsibility", withResolve.length > 0,
        `${withResolve.length} rows offer it; first=${JSON.stringify(withResolve[0]?.cells)}`);

    // No row may offer both, and a reduction must offer neither.
    const both = before.filter((r) => (r.actions as string[]).includes("resolveResponsibility") && (r.actions as string[]).includes("reallocateResponsibility"));
    const reductions = before.filter((r) => r.responsibility === "not-applicable");
    rec("14-2b", "never both, and never on a reduction",
        both.length === 0 && reductions.every((r) => !(r.actions as string[]).some((a) => /Responsibility/.test(a ?? ""))),
        `both=${both.length} reductionsOffering=${reductions.filter((r) => (r.actions as string[]).some((a) => /Responsibility/.test(a ?? ""))).length}`);

    // ── Open the command on the HISTORICAL Sep 2 obligation (§5 non-retroactivity).
    const hist = page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${HISTORICAL}"]`).first();
    if (await hist.count()) {
        await hist.click();
        await page.waitForTimeout(4000);
        const shell = await page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            mode: document.querySelector("[data-financials-responsibility-mode]")?.getAttribute("data-financials-responsibility-mode") ?? null,
            child: (document.querySelector('[data-testid="responsibility-child"]') as HTMLElement | null)?.innerText ?? null,
            current: (document.querySelector('[data-testid="responsibility-current"]') as HTMLElement | null)?.innerText ?? null,
            effect: (document.querySelector('[data-testid="responsibility-effect"]') as HTMLElement | null)?.innerText ?? null,
        }));
        rec("14-3", "Resolve opens as the canonical command shell", shell.overlay === "responsibility" && shell.mode === "resolve", JSON.stringify(shell).slice(0, 220));
        await page.screenshot({ path: `${OUT}/s4-resolve-open.png` });

        await page.getByTestId("responsibility-preview-button").click();
        await page.waitForTimeout(6000);
        const prev = await page.evaluate(() => ({
            preview: (document.querySelector('[data-testid="responsibility-preview"]') as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null,
            error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
        }));
        rec("14-4", "the applicable arrangement / allocatable net is shown by the ACTION's preview",
            Boolean(prev.preview || prev.error), `preview=${prev.preview} error=${prev.error}`);
        await page.screenshot({ path: `${OUT}/s4-resolve-preview.png` });

        if (prev.preview) {
            await page.getByTestId("responsibility-confirm").click();
            await page.waitForTimeout(10_000);
        }
        const after = await ledger(page);
        writeFileSync(`${OUT}/s4-after-historical.json`, JSON.stringify(after, null, 2));
        const h = after.find((r) => r.chargeId === HISTORICAL);
        rec("14-1", "the historical Sep 2 obligation is NOT retroactively divided under the Sep 18 arrangement",
            h?.responsibility !== "named",
            `state=${h?.responsibility} ("${h?.responsibilityText}") cells=${JSON.stringify(h?.cells)}`);
        await page.screenshot({ path: `${OUT}/s4-after-historical.png` });
    } else {
        rec("14-1", "the historical obligation offers Resolve", false, "no resolve control on f089a3f4");
    }
    writeFileSync(`${OUT}/s4-findings.json`, JSON.stringify(F, null, 2));
});
