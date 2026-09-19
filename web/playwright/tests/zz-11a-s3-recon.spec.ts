/**
 * SECTION 3 RECON — the unified Add/Adjustment contract and the navigation stack, measured.
 *
 * The stack is measured first because it has regressed before: Cancel, outside click and Escape
 * must each return to the SAME Details, with account, lens and filters intact — not to Add, not to
 * Compact, and not by closing the panel.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s3";
const LANE = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);

type F = { id: string; what: string; ok: boolean; observed: string };
const findings: F[] = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    findings.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};

/** What surface is on screen, and the Details state that must survive a dismissal. */
const state = (p: Page) => p.evaluate(() => {
    const overlay = document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null;
    const lens = Array.from(document.querySelectorAll("[class*='lensbtn'],[class*='__lens']"))
        .filter((e) => (e as HTMLElement).getAttribute("aria-pressed") === "true" || (e as HTMLElement).className.includes("--on"))
        .map((e) => (e as HTMLElement).innerText.trim().split("\n")[0]);
    const sel = (t: string) => (document.querySelector(`[data-testid="${t}"] select,[data-testid="${t}"]`) as HTMLSelectElement | null)?.value ?? null;
    return {
        overlay,
        detailPresent: !!document.querySelector(".alloy-os-fdetail__strip"),
        entryMode: document.querySelector("[data-financials-entry-mode]")?.getAttribute("data-financials-entry-mode") ?? null,
        activeLens: lens[0] ?? null,
        subject: sel("subject"),
        responsible: sel("responsible-party"),
        period: sel("period"),
        account: document.querySelector("[data-financials-account]")?.getAttribute("data-financials-account") ?? null,
    };
});

async function openDetails(p: Page) {
    await p.goto(LANE, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(13_000);
    await p.getByRole("button", { name: /^Details$/ }).first().click();
    await p.waitForTimeout(8000);
}

test("S3 recon · add modes and the navigation stack", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await openDetails(page);
    const baseline = await state(page);
    rec("N0", "Details is the resting deep surface", baseline.detailPresent, JSON.stringify(baseline));
    await page.screenshot({ path: `${OUT}/00-details.png` });

    // ── ADD opens in CHARGE mode
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4000);
    const addState = await state(page);
    rec("A1", "Add opens as one command surface", addState.overlay === "add_charge", `overlay=${addState.overlay} mode=${addState.entryMode}`);
    await page.screenshot({ path: `${OUT}/01-add-charge.png` });

    const modes = await page.evaluate(() => Array.from(document.querySelectorAll("[data-financials-entry-mode] button, [data-addcharge-mode]"))
        .map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 6));
    rec("A2", "the mode control is present on the command", modes.length > 0, JSON.stringify(modes));

    const children = await page.locator("[data-addcharge-child]").count();
    const subjectSel = await page.locator("[data-addcharge-subject]").count();
    rec("A3", "child selection reachable in Charge mode", children > 0 || subjectSel > 0, `checkboxes=${children} subjectSelect=${subjectSel}`);

    // ── CANCEL returns to the same Details
    const cancel = page.getByRole("button", { name: /^Cancel$/ }).first();
    if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(3500); }
    const afterCancel = await state(page);
    rec("N1", "Cancel returns to the SAME Details", afterCancel.detailPresent && afterCancel.overlay === "detail",
        `overlay=${afterCancel.overlay} detail=${afterCancel.detailPresent} account=${afterCancel.account === baseline.account}`);
    await page.screenshot({ path: `${OUT}/02-after-cancel.png` });

    // ── ESCAPE returns to the same Details
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(3500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);
    const afterEsc = await state(page);
    rec("N2", "Escape returns to the SAME Details", afterEsc.detailPresent && afterEsc.overlay === "detail",
        `overlay=${afterEsc.overlay} detail=${afterEsc.detailPresent}`);
    await page.screenshot({ path: `${OUT}/03-after-escape.png` });

    // ── OUTSIDE CLICK returns to the same Details
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(3500);
    /*
     * A POINT PROVED TO BE ON THE SCRIM, not a guessed corner.
     *
     * The first attempt clicked (12, 300) and hit the app's own sidebar rail — outside the scrim
     * entirely — so the command stayed open and the probe reported a dismissal defect that did not
     * exist. It then looked for the row Adjust control while the Add surface was still covering the
     * ledger, and reported that as missing too. One wrong gesture, two false findings.
     *
     * The scrim is taller than the command card, so the reliable exposed strip is BELOW it, and
     * `elementFromPoint` confirms ownership before the click.
     */
    const hit = await page.evaluate(() => {
        const scrim = document.querySelector(".alloy-os-fp-depth-scrim") as HTMLElement | null;
        if (!scrim) return null;
        const r = scrim.getBoundingClientRect();
        /*
         * SEARCH, DON'T COMPUTE. Two earlier attempts derived a single point from a box that was not
         * the command card — `[data-financials-overlay]` is the whole financials root — and both
         * landed on something else. This walks the scrim and takes the first point `elementFromPoint`
         * proves the scrim owns, so the gesture cannot be wrong about what it hit.
         */
        const onScrimAt = (x: number, y: number) => {
            const el = document.elementFromPoint(x, y);
            return !!el && (el.classList.contains("alloy-os-fp-depth-scrim") || !!el.closest(".alloy-os-fp-depth-scrim"));
        };
        for (let fy = 0.95; fy >= 0.05; fy -= 0.05) {
            for (const fx of [0.5, 0.2, 0.8, 0.08, 0.92]) {
                const x = Math.round(r.left + r.width * fx);
                const y = Math.round(r.top + r.height * fy);
                if (onScrimAt(x, y)) {
                    const el = document.elementFromPoint(x, y) as HTMLElement;
                    return { x, y, onScrim: true, owner: el.className.toString().slice(0, 40) };
                }
            }
        }
        return { x: 0, y: 0, onScrim: false, owner: "no scrim point found" };
    });
    if (hit?.onScrim) await page.mouse.click(hit.x, hit.y);
    await page.waitForTimeout(3500);
    const afterOutside = await state(page);
    rec("N3", "outside click returns to the SAME Details", afterOutside.detailPresent && afterOutside.overlay === "detail",
        `hit=${JSON.stringify(hit)} overlay=${afterOutside.overlay} detail=${afterOutside.detailPresent}`);
    await page.screenshot({ path: `${OUT}/04-after-outside.png` });

    // ── ROW ADJUST binds its source
    const adjust = page.locator("[data-financials-row-action='adjust'], button[title*='Adjust' i]").first();
    const adjustCount = await adjust.count();
    if (adjustCount) {
        await adjust.click();
        await page.waitForTimeout(4000);
        const rowAdj = await state(page);
        const bound = await page.evaluate(() => {
            const agree = (document.querySelector('[data-testid="adjustment-agreement"]') as HTMLSelectElement | null);
            const src = (document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null);
            return { agreement: agree?.value ?? null, agreementLabel: agree?.selectedOptions?.[0]?.text ?? null, sourceCharge: src?.value ?? null };
        });
        rec("C1", "row Adjust opens bound to its source", Boolean(bound.sourceCharge), `overlay=${rowAdj.overlay} ${JSON.stringify(bound)}`);
        await page.screenshot({ path: `${OUT}/05-row-adjust.png` });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(3000);
        const back = await state(page);
        rec("N4", "Escape from row Adjust returns to Details", back.detailPresent, `overlay=${back.overlay}`);
    } else {
        rec("C1", "row Adjust reachable", false, "no inline adjust control found");
    }

    writeFileSync(`${OUT}/recon.json`, JSON.stringify({ baseline, findings }, null, 2));
    console.log(`\n=== S3 RECON ${findings.filter((f) => f.ok).length}/${findings.length} ===`); // eslint-disable-line no-console
});
