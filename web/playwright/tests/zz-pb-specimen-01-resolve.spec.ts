/**
 * §5–§7 step 1: what the certification specimen can be offered, read before anything is created.
 *
 * The specimen is Pathb Certopp — NOT the Certhouse family. Nothing is written by this spec; it
 * reads the assignment's tuition resolution so the accept that follows names a real option and a
 * real resolution key rather than guessing at either.
 */
import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OPP = "ebe6cb44-957b-48f0-9a6d-603670443ec2";   // Pathb Certopp's opportunity
const OCM = "e9965c7c-608e-4f68-a15b-2475374e2ecf";

test("resolve specimen tuition", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const out = await page.evaluate(async ({ opp, ocm }) => {
        const r = await fetch(`/api/admin/financial-config/opportunity/${opp}`, { credentials: "include" });
        const body = r.ok ? await r.json() : await r.text();
        const assignments = (body as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [];
        return {
            status: r.status,
            count: assignments.length,
            mine: assignments.filter((a) => a.opportunityCustomerMemberId === ocm),
            all: assignments.map((a) => ({
                ocm: a.opportunityCustomerMemberId, child: a.childLabel, state: a.state,
                accepted: a.accepted, resolutionKey: a.resolutionKey,
            })),
        };
    }, { opp: OPP, ocm: OCM });
    log(JSON.stringify(out, null, 1).slice(0, 4000));
});
