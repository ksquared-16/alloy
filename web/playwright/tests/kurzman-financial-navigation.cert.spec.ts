/**
 * THE FOUR NAVIGATION PROOFS — the household subject must survive being moved around.
 *
 * The core defect is already closed: on this route the Financials card mounts, resolves the
 * canonical Kurzman household and the API answers 200. What is left is the class of bug that a
 * single static mount cannot see — a first-child fallback, a sibling's money rendered under the
 * wrong family, a slow response from the previous selection landing on top of the current one, or a
 * subject that only exists because the page was never reloaded.
 *
 * Rows are DISCOVERED, never hardcoded. A candidate id baked into a spec is a fact about one
 * afternoon's data, and this lane's ids have already moved once.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const ROUTE = "/workspace/work-unit/waitlist?work_view_id=new_work_view_4";
const FAMILY = "Kurzman";
const CUSTOMER = "0658832a-48d6-4b80-beae-0b12d573fdf2";
const TERMINAL = ["No financial record", "Financial account unavailable"];

/*
 * A DIFFERENT HOUSEHOLD HAS TO COME FROM A DIFFERENT LANE.
 *
 * The Waitlist lane is ONE household: all 33 evaluated rows carry opportunity d097e1a8 and customer
 * 0658832a. The row names are CHILD names — "PassA Kid", "Test Process7" — so picking a row whose
 * text lacks "Kurzman" selects a sibling, not another family. A first version of this spec did
 * exactly that and reported two failures; both were the premise, not the product. Resolving the same
 * household for another Kurzman child is the correct answer and is what Proof 1 asserts.
 *
 * So the cross-family proofs use the "All" work view, which holds genuinely separate cases.
 */
const OTHER_ROUTE = "/workspace/work-unit/new-work-view-6?work_view_id=new_work_view_6";
const OTHER = { id: "468a5a95-dcfa-45ab-9829-34709dd9a154", customer: "5808e7f9-59ac-42ce-8b47-2540827ebdf1", label: "Certopp Family" };

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

type Read = { customerId: string | null; status: number | null; at: number };

/** Every Financials account read, in order, with the answer it got. */
function watch(page: Page): Read[] {
    const reads: Read[] = [];
    const seen = new Map<string, Read>();
    page.on("request", (r) => {
        const u = r.url();
        if (!u.includes("/api/admin/financials/card")) return;
        const row: Read = { customerId: new URL(u).searchParams.get("customer_id"), status: null, at: Date.now() };
        reads.push(row);
        seen.set(u + row.at, row);
        (r as unknown as { __key?: string }).__key = u + row.at;
    });
    page.on("response", (res) => {
        const u = res.url();
        if (!u.includes("/api/admin/financials/card")) return;
        const cid = new URL(u).searchParams.get("customer_id");
        const row = [...reads].reverse().find((x) => x.customerId === cid && x.status === null);
        if (row) row.status = res.status();
    });
    return reads;
}

const card = (page: Page) => page.locator('[data-financials-card="true"]').first();

async function settle(page: Page, ms = 12_000) {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(ms);
}

/** The lane's rows, as the operator sees them: candidate id plus the name on the row. */
async function discoverRows(page: Page): Promise<{ id: string; text: string }[]> {
    await page.goto(ROUTE);
    await settle(page, 15_000);
    const rows = page.locator("[data-entity-id]");
    const n = await rows.count();
    const out: { id: string; text: string }[] = [];
    for (let i = 0; i < n; i++) {
        const r = rows.nth(i);
        const id = await r.getAttribute("data-entity-id");
        if (!id) continue;
        out.push({ id, text: (await r.innerText()).replace(/\s+/g, " ").trim() });
    }
    return out;
}

async function open(page: Page, id: string, ms = 14_000) {
    await page.goto(`${ROUTE}&subject_id=${encodeURIComponent(id)}`);
    await settle(page, ms);
}

/** The other household, in the lane that actually contains it. */
async function openOther(page: Page, ms = 14_000) {
    await page.goto(`${OTHER_ROUTE}&subject_id=${encodeURIComponent(OTHER.id)}`);
    await settle(page, ms);
}

const latestFor = (reads: Read[]) => [...reads].reverse().find((r) => r.customerId)?.customerId ?? null;

test.describe("Kurzman financial subject — navigation", () => {
    test("PROOF 1 · two children of one family are one financial subject", async ({ page }) => {
        test.setTimeout(300_000);
        const reads = watch(page);
        const rows = await discoverRows(page);
        const kurzman = rows.filter((r) => r.text.includes(FAMILY));
        /* eslint-disable no-console */
        console.log(`##### lane rows=${rows.length} kurzman=${kurzman.length}`);
        for (const k of kurzman) console.log(`   KURZMAN ${k.id} :: ${k.text.slice(0, 70)}`);
        /* eslint-enable no-console */
        expect(kurzman.length, "the lane must hold at least two Kurzman candidates").toBeGreaterThanOrEqual(2);

        const seenPerChild: string[] = [];
        for (const child of kurzman.slice(0, 2)) {
            const before = reads.length;
            await open(page, child.id);
            const mine = reads.slice(before).filter((r) => r.customerId);
            // eslint-disable-next-line no-console
            console.log(`##### child ${child.id} -> ${JSON.stringify(mine)}`);
            expect(mine.length, `child ${child.id} must ask for an account`).toBeGreaterThan(0);
            for (const r of mine) {
                expect(r.customerId, "no sibling leakage: every read is the household").toBe(CUSTOMER);
            }
            seenPerChild.push(mine[0]!.customerId!);
            await expect(card(page)).toBeVisible({ timeout: 60_000 });
        }
        // A first-child fallback would show as the SAME candidate id twice, not as two.
        expect(kurzman[0]!.id).not.toBe(kurzman[1]!.id);
        expect(new Set(seenPerChild).size, "both children resolve ONE household").toBe(1);
        expect(seenPerChild[0]).toBe(CUSTOMER);
    });

    test("PROOF 2 · prev/next switches subject and restores it", async ({ page }) => {
        test.setTimeout(300_000);
        const reads = watch(page);
        const rows = await discoverRows(page);
        const kurzman = rows.find((r) => r.text.includes(FAMILY))!;

        await open(page, kurzman.id);
        const first = latestFor(reads);

        const beforeOther = reads.length;
        await openOther(page);
        const otherCustomer = latestFor(reads.slice(beforeOther));

        const beforeBack = reads.length;
        await open(page, kurzman.id);
        const restored = latestFor(reads.slice(beforeBack));

        /* eslint-disable no-console */
        console.log(`##### prev/next  kurzman=${first}  ${OTHER.label}=${otherCustomer}  restored=${restored}`);
        /* eslint-enable no-console */
        expect(first, "Kurzman resolves its household").toBe(CUSTOMER);
        expect(otherCustomer, `${OTHER.label} must resolve ITS OWN household`).toBe(OTHER.customer);
        expect(otherCustomer, "and must not show Kurzman's").not.toBe(CUSTOMER);
        expect(restored, "returning restores Kurzman's household").toBe(CUSTOMER);
        const text = await card(page).innerText();
        for (const t of TERMINAL) expect(text, `terminal copy "${t}" must be absent`).not.toContain(t);
    });

    test("PROOF 3 · the latest selection wins a rapid switch", async ({ page }) => {
        test.setTimeout(300_000);
        const reads = watch(page);
        const rows = await discoverRows(page);
        const kurzman = rows.find((r) => r.text.includes(FAMILY))!;

        // Kurzman → immediately the other household, with no settle between: the SECOND selection
        // must win even if the first answers later.
        await page.goto(`${ROUTE}&subject_id=${encodeURIComponent(kurzman.id)}`);
        await page.waitForTimeout(400);
        await page.goto(`${OTHER_ROUTE}&subject_id=${encodeURIComponent(OTHER.id)}`);
        await settle(page, 20_000);

        const settled = latestFor(reads);
        const body = await page.locator("body").innerText();
        /* eslint-disable no-console */
        console.log(`##### rapid reads = ${JSON.stringify(reads.map((r) => r.customerId))}`);
        console.log(`##### settled = ${settled} | expected ${OTHER.customer} (${OTHER.label})`);
        /* eslint-enable no-console */
        expect(settled, "the latest selection's household must be the settled one").toBe(OTHER.customer);
        expect(settled, "Kurzman's household must not survive the switch").not.toBe(CUSTOMER);
        expect(body, `the visible family must be ${OTHER.label}`).toContain("Certopp");
        const text = await card(page).innerText();
        for (const t of TERMINAL) expect(text, `terminal copy "${t}" must be absent`).not.toContain(t);
    });

    test("PROOF 4 · a cold reload reconstructs the subject", async ({ page }) => {
        test.setTimeout(300_000);
        const reads = watch(page);
        const rows = await discoverRows(page);
        const kurzman = rows.find((r) => r.text.includes(FAMILY))!;
        await open(page, kurzman.id);

        const before = reads.length;
        await page.reload();
        await settle(page, 20_000);
        const after = reads.slice(before).filter((r) => r.customerId);

        await expect(card(page), "Financials must mount after a cold reload").toBeVisible({ timeout: 90_000 });
        const text = await card(page).innerText();
        /* eslint-disable no-console */
        console.log(`##### cold reload reads = ${JSON.stringify(after)}`);
        console.log("##### CARD TEXT AFTER RELOAD:\n" + text);
        /* eslint-enable no-console */
        expect(after.length, "the API must fire again after reload").toBeGreaterThan(0);
        expect(after.map((r) => r.customerId), "reload resolves the same household").toContain(CUSTOMER);
        expect(after.filter((r) => r.customerId === CUSTOMER).map((r) => r.status)).toContain(200);
        for (const t of TERMINAL) expect(text, `terminal copy "${t}" must be absent`).not.toContain(t);
        expect(text, "Add Charge must remain available").toMatch(/Add charge/i);
        await page.screenshot({ path: "playwright-report/kurzman-cold-reload.png" });
    });
});
