/** §18 — WHY does the Add target exist twice? Measured, not guessed. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("add host duplication", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-universal-card-key='financials']").getByRole("button", { name: /^Add$/ }).first()
        .click({ force: true });
    await page.waitForTimeout(10_000);

    const out = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll("[data-addcharge-child]"));
        const describe = (el: Element) => {
            const e = el as HTMLElement;
            const r = e.getBoundingClientRect();
            const card = e.closest("[data-universal-card-key]") as HTMLElement | null;
            const style = getComputedStyle(e);
            /* Walk up looking for anything that makes this subtree inert or invisible. */
            let hidden: string | null = null;
            for (let p: HTMLElement | null = e; p; p = p.parentElement) {
                const ps = getComputedStyle(p);
                if (p.hasAttribute("inert")) { hidden = `inert on ${p.tagName}.${p.className.slice(0, 40)}`; break; }
                if (p.getAttribute("aria-hidden") === "true") { hidden = `aria-hidden on ${p.tagName}`; break; }
                if (ps.display === "none") { hidden = `display:none on ${p.tagName}.${p.className.slice(0, 40)}`; break; }
                if (ps.visibility === "hidden") { hidden = `visibility:hidden on ${p.tagName}`; break; }
                if (ps.opacity === "0") { hidden = `opacity:0 on ${p.tagName}.${p.className.slice(0, 40)}`; break; }
            }
            return {
                child: e.getAttribute("data-addcharge-child"),
                card: card?.getAttribute("data-universal-card-key") ?? null,
                cardClass: card?.className.slice(0, 70) ?? null,
                rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
                offsetParentNull: (e as HTMLInputElement).offsetParent === null,
                pointerEvents: style.pointerEvents,
                disabled: (e as HTMLInputElement).disabled,
                hiddenBy: hidden,
                /* The ancestry that distinguishes the two hosts. */
                path: (() => {
                    const parts: string[] = [];
                    for (let p: HTMLElement | null = e.parentElement; p && parts.length < 8; p = p.parentElement) {
                        const id = p.getAttribute("data-financials-entry") ?? p.getAttribute("data-universal-card-key")
                            ?? p.getAttribute("data-focus-panel-area") ?? p.className.split(" ")[0];
                        if (id) parts.push(id);
                    }
                    return parts.join(" < ");
                })(),
            };
        };
        return {
            count: boxes.length,
            boxes: boxes.map(describe),
            addCards: Array.from(document.querySelectorAll("[data-universal-card-key='add_adjustment'], [data-universal-card-key='financials']")).length,
            commandHosts: Array.from(document.querySelectorAll("[data-addcharge-target]")).length,
        };
    });
    log(JSON.stringify(out, null, 1));
    writeFileSync(`${OUT}/add-host-diag.json`, JSON.stringify(out, null, 2));
});
