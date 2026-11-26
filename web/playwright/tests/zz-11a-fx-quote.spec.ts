/**
 * The assignment reader, reached by a route that does its OWN lookup without the embed.
 *
 * `/api/admin/enrollment/assignment-quote` resolves the OCM by (org, opportunity, child), builds the
 * same view, and returns 404 `no_assignment_for_child` when either step fails, or 409 carrying the
 * WHOLE view when the view exists but no option applies. Both of those paths write nothing — the
 * snapshot write happens only after a recommendation is in hand, which is precisely the case the
 * opportunity read says cannot be happening.
 *
 * This is the one remaining way to see inside `buildAssignmentTuitionView` without a rebuild.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OPP = "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
const CHILD_A = "e408fa51-7261-43c4-8e60-555d17fc9888";
const CHILD_B = "46105cd4-6030-417d-a7cb-faf409071c0d";

test("what does the view say", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async ({ opp, a, b }) => {
        const quote = async (member: string) => {
            const r = await fetch("/api/admin/enrollment/assignment-quote", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ opportunity_id: opp, customer_member_id: member }),
            });
            return { member, status: r.status, body: await r.json().catch(() => null) };
        };
        return { a: await quote(a), b: await quote(b) };
    }, { opp: OPP, a: CHILD_A, b: CHILD_B });
    writeFileSync(`${OUT}/quote.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1).slice(0, 5000));
});
