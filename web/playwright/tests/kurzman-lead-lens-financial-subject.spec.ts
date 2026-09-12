/**
 * THE FINANCIAL SUBJECT, THROUGH THE LENS THAT ACTUALLY CONTAINS THE CASE.
 *
 * The Waitlist lens never held this case. Census tha_304b3057ff4b51:
 *
 *     stage_key     waitlist
 *     status_key    new            <- membership is evaluated on status, not stage
 *     work_unit_id  587de5bc-...   = lifecycle_wu_lead
 *
 * and no case in the tenant carries `waitlisted`, the only status the Waitlist lens filters on. So
 * the case is operationally a Lead, and this drives it there. The subject is NOT mutated to fit the
 * old test plan -- the product is certified as it actually operates.
 *
 * The load-bearing assertion is the request: a card can render from cache, and only
 * /api/admin/financials/card carrying THIS customer proves THIS subject resolved THIS household now.
 * That request firing at all is what the whole repair was about, because the defect was that the
 * household never reached the resolver and Financials settled with nothing to ask about.
 *
 * HTTP status is recorded, not asserted: the slot-2 QA identity is still missing `fin.read`
 * (governed grant gar_1b184648796da6, awaiting operator). Emission with the canonical customer is
 * provable now; 200 is not, and asserting it would only re-prove a permission gap already known.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OPPORTUNITY = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const CUSTOMER = "0658832a-48d6-4b80-beae-0b12d573fdf2";
/* The Waitlist WORK VIEW (new_work_view_4, stage-filtered), not the work-unit key route: that one
 * selects no view and falls back to the candidate queue, which filters status and is empty. */
const ROUTE = "/workspace/work-unit/waitlist?work_view_id=new_work_view_4";
const REFUSAL = "not present in this work unit";

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

type Read = { customerId: string | null; status: number | null };

function watch(page: Page): Read[] {
    const reads: Read[] = [];
    const seen = new Map<string, Read>();
    page.on("request", (r) => {
        const u = r.url();
        if (!u.includes("/api/admin/financials/card")) return;
        const row: Read = { customerId: new URL(u).searchParams.get("customer_id"), status: null };
        reads.push(row);
        seen.set(u, row);
    });
    page.on("response", (res) => {
        const row = seen.get(res.url());
        if (row && row.status === null) row.status = res.status();
    });
    return reads;
}

test("Kurzman mounts in the work view that contains it, and Financials asks for the canonical household", async ({
    page,
}) => {
    test.setTimeout(300_000);
    const reads = watch(page);

    await page.goto(`${ROUTE}&subject_id=${OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(25_000);

    const card = page.locator('[data-financials-card="true"]').first();
    const mounted = (await card.count()) > 0;
    const cardText = mounted ? await card.innerText() : "<card not mounted>";

    /* eslint-disable no-console */
    console.log("##### url            : " + page.url());
    console.log("##### card mounted   : " + mounted);
    console.log("##### card requests  : " + JSON.stringify(reads));
    console.log("##### asks canonical : " + reads.some((r) => r.customerId === CUSTOMER));
    console.log("##### CARD TEXT:\n" + cardText);
    /* eslint-enable no-console */

    await page.screenshot({ path: "playwright-report/kurzman-lead-financials.png" });

    /* Membership first: a refusal here would mean the census pointed at the wrong lens. */
    const body = await page.locator("body").innerText();
    const panel = page.locator('[data-focus-panel], [data-testid="focus-panel"]').first();
    const panelText = (await panel.count()) > 0 ? await panel.innerText() : body;
    expect(panelText.includes(REFUSAL), "the Waitlist work view must actually contain this case").toBe(false);

    /* The repair's own claim: the household reaches the runtime subject and the card asks for it. */
    expect(reads.length, "Financials must ask about an account at all").toBeGreaterThan(0);
    expect(
        reads.map((r) => r.customerId),
        "the card must ask for the canonical household the census proved this case carries",
    ).toContain(CUSTOMER);
});
