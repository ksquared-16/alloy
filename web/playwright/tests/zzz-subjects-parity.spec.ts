/**
 * §15 — OLD vs NEW COHORT PARITY, on the real tenant.
 *
 * The acquisition changes; the shaping does not. So parity is the subjects endpoint's own answer,
 * captured from the deployed build before the cutover and compared with it after. Identities,
 * order, labels and facet vocabulary all have to survive, exactly.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/accounts-cohort";
const LABEL = process.env.PARITY_LABEL ?? "snapshot";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("capture the subjects cohort as the deployed build answers it", async ({ page }) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        if (await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().count()) break;
        if (attempt === 2) throw new Error(`workspace never mounted at ${page.url()}`);
    }
    const build = await page.evaluate(async () => (await fetch("/api/build-info")).json());
    const cohort = await page.evaluate(async () => {
        const res = await fetch("/api/admin/financials/subjects", { credentials: "include" });
        return { status: res.status, timing: res.headers.get("server-timing"), body: await res.json() };
    });
    expect(cohort.status, "the cohort must be readable").toBe(200);
    const subjects = (cohort.body?.subjects ?? []) as Array<Record<string, unknown>>;
    log(`BUILD ${String((build as { gitSha?: string }).gitSha).slice(0, 12)}  subjects=${subjects.length}`);
    log(`SERVER-TIMING ${cohort.timing}`);
    log(`IDENTITIES ${subjects.map((s) => s.customerId).join(",")}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/parity-${LABEL}.json`, JSON.stringify({
        gitSha: (build as { gitSha?: string }).gitSha,
        serverTiming: cohort.timing,
        truncated: cohort.body?.truncated,
        scanCap: cohort.body?.scanCap,
        scope: cohort.body?.scope,
        subjects,
    }, null, 2));
    expect(subjects.length, "the tenant must have a cohort to compare").toBeGreaterThan(0);
});
