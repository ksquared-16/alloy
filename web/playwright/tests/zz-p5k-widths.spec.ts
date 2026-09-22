/**
 * PASS 5K — WHAT WIDTH DOES THE COMMAND CLUSTER ACTUALLY NEED?
 *
 * The containment fix removed the overflow and introduced a wrap, which costs card height and is
 * explicitly not wanted. Choosing between "shrink the controls" and "give the column more width"
 * on arithmetic alone would be guessing, so this measures the one thing that decides it: the
 * cluster's intrinsic single-line width against the column it has to live in.
 */
import { test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const measure = (p: Page) => p.evaluate(() => {
    const card = document.querySelector(".alloy-os-billing") as HTMLElement | null;
    const zones = document.querySelector(".alloy-os-billing__zones--two") as HTMLElement | null;
    const left = zones?.children[0] as HTMLElement | undefined;
    const right = zones?.children[1] as HTMLElement | undefined;
    const cluster = document.querySelector(".alloy-os-billing__commands") as HTMLElement | null;
    if (!cluster) return null;
    /* Intrinsic one-line width: what the cluster needs if it may not wrap. */
    const prevWrap = cluster.style.flexWrap;
    const prevW = cluster.style.width;
    cluster.style.flexWrap = "nowrap";
    cluster.style.width = "max-content";
    const intrinsic = Math.ceil(cluster.getBoundingClientRect().width);
    const parts = [...cluster.children].map((c) => ({
        label: (c as HTMLElement).innerText.trim(),
        w: Math.ceil(c.getBoundingClientRect().width),
    }));
    cluster.style.flexWrap = prevWrap;
    cluster.style.width = prevW;
    const amount = document.querySelector(".alloy-os-billing__amount") as HTMLElement | null;
    return {
        cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
        zonesWidth: zones ? Math.round(zones.getBoundingClientRect().width) : null,
        leftWidth: left ? Math.round(left.getBoundingClientRect().width) : null,
        rightWidth: right ? Math.round(right.getBoundingClientRect().width) : null,
        columnGap: zones ? getComputedStyle(zones).columnGap : null,
        clusterIntrinsic: intrinsic,
        parts,
        dueIntrinsic: amount ? Math.ceil(amount.scrollWidth) : null,
        dueBox: amount ? Math.round(amount.getBoundingClientRect().width) : null,
    };
});

test("what the cluster needs, against what it has", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    for (const w of [1680, 1440, 1280, 1040]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_000);
        log(`WIDTHS_${w} ` + JSON.stringify(await measure(page)));
    }
});
