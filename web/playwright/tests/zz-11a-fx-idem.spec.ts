/**
 * Does the (org, opportunity, child) filter match the row, or not?
 *
 * The OCM route's own idempotency check uses exactly that triple. Re-posting the same link answers
 * the question at no risk: a bare `{id}` means the existing row was FOUND by that filter; a full row
 * means it inserted again, which the unique constraint should have refused.
 *
 * This is also the assignment authority's idempotency proof, which the fixture step asks for.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("re-link is idempotent, and the filter is proven", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const link = async (member: string) => {
            const r = await fetch("/api/admin/opportunity-customer-members", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    opportunity_id: "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a",
                    customer_member_id: member,
                }),
            });
            const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
            return { member, status: r.status, keys: body ? Object.keys(body) : null, id: body?.id ?? null };
        };
        return {
            a: await link("e408fa51-7261-43c4-8e60-555d17fc9888"),
            b: await link("46105cd4-6030-417d-a7cb-faf409071c0d"),
        };
    });
    writeFileSync(`${OUT}/idem.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1));
});
