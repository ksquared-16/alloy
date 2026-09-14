/**
 * OVERVIEW VS CHARGES — THE DETERMINISTIC RECHECK.
 *
 * Carried debt: the Overview tile once read 0 "Charges awaiting posting" beside a Charges list
 * showing 1. That was observed on a shared, moving tenant and was never reproduced deterministically.
 *
 * Both numbers come from ONE projection — `resolveFinancialWorkQueue` — the tile through
 * `resolveFinancialsChargesAwaitingPostCount` and the list through the work-queue route. So they
 * cannot disagree about which charges count. They CAN disagree about scope, because each caller
 * supplies its own, and the metric reports the scope it used. This drives one known draft charge
 * through both and compares them in the same session.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });

type Queue = { counts?: { actionable?: number }; rows?: unknown[]; scope?: Record<string, unknown> };

async function queue(request: APIRequestContext): Promise<Queue> {
    const res = await request.get("/api/admin/financials/work-queue");
    expect(res.ok(), `work queue ${res.status()}`).toBe(true);
    const body = (await res.json()) as { queue?: Queue } & Queue;
    return body.queue ?? body;
}

/** The tile's own number, with the scope the metric says it used. */
async function tile(request: APIRequestContext): Promise<{ value: number | null; meta: Record<string, unknown> }> {
    const res = await request.get("/api/admin/financials/overview-metrics");
    expect(res.ok(), `overview metrics ${res.status()}`).toBe(true);
    const body = await res.json() as Record<string, unknown>;
    const flat = JSON.stringify(body);
    const found = /"financials\.charges_awaiting_post_count"[^}]*?"value"\s*:\s*(-?\d+)/.exec(flat);
    return { value: found ? Number(found[1]) : null, meta: body };
}

test("the tile and the list count the same drafts", async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto("/workspace");

    const beforeQueue = await queue(page.request);
    const beforeTile = await tile(page.request);
    const listBefore = beforeQueue.rows?.length ?? beforeQueue.counts?.actionable ?? 0;
    const actionableBefore = beforeQueue.counts?.actionable ?? 0;

    expect(beforeTile.value, "the Overview tile must produce a number at all").not.toBeNull();
    expect(
        beforeTile.value,
        "the tile and the queue read one projection, so they start equal",
    ).toBe(actionableBefore);

    /*
     * MOVE THE COHORT BY EXACTLY ONE, and require both numbers to follow.
     *
     * Posting is used rather than adding because `charge.add` is idempotent per template and period:
     * on a rerun it legitimately creates nothing, and a test that only ever added would keep passing
     * while proving the two surfaces move together exactly never.
     */
    const draft = (beforeQueue.rows ?? [])[0] as Record<string, unknown> | undefined;
    expect(draft, "the cohort needs a draft to post").toBeTruthy();
    const chargeId = String((draft as Record<string, unknown>).chargeId ?? (draft as Record<string, unknown>).id ?? "");
    expect(chargeId, "the queue row must name its charge").not.toBe("");

    const posted = await page.request.post("/api/admin/actions/execute", {
        headers: { "content-type": "application/json" },
        data: {
            action_key: "charge.post",
            entity_type: "opportunity", entity_id: SUBJECT, mode: "execute",
            payload: { charge_id: chargeId },
        },
    });
    const postedJson = (await posted.json()) as Record<string, unknown>;
    expect(postedJson.ok, `charge.post ${JSON.stringify(postedJson).slice(0, 300)}`).toBe(true);

    const afterQueue = await queue(page.request);
    const afterTile = await tile(page.request);
    const actionableAfter = afterQueue.counts?.actionable ?? 0;

    expect(
        actionableAfter,
        "posting one draft removes exactly one from the cohort",
    ).toBe(actionableBefore - 1);
    expect(
        afterTile.value,
        "and the Overview tile follows the same projection, not a count of its own",
    ).toBe(actionableAfter);

    // eslint-disable-next-line no-console
    console.log(
        `[overview] posted ${chargeId.slice(0, 8)}: actionable ${actionableBefore}->${actionableAfter} `
        + `tile ${beforeTile.value}->${afterTile.value} scope=${JSON.stringify(beforeQueue.scope ?? null)}`,
    );
});
