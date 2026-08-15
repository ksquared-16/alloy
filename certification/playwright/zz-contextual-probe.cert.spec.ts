import { test, type Page } from "@playwright/test";

/** THROWAWAY DIAGNOSTIC — prints what the tenant offers and what the surface refuses. Not a gate. */
const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);

test.use({ storageState: undefined });

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
}

test("probe", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const raw = await page.evaluate(async () => {
        const res = await fetch("/api/admin/global-search?q=Testfamily", { credentials: "include" });
        return await res.json();
    });
    console.log("[PROBE search]", JSON.stringify(raw).slice(0, 4000));

    const results = (raw as { results?: Array<Record<string, unknown>> }).results ?? [];
    for (const r of results.slice(0, 3)) {
        const dests = (r.destinations ?? []) as Array<Record<string, unknown>>;
        for (const d of dests) {
            console.log(
                `[PROBE dest] key=${d.key} view=${d.host_work_view_id} unit=${d.host_work_unit_key} entity=${d.entity_id} item=${d.item_id} member=${d.operational_member_id}`,
            );
        }
    }

    const first = results[0];
    const dest = ((first?.destinations ?? []) as Array<Record<string, unknown>>)[0];
    if (dest) {
        const unit = String(dest.host_work_unit_key ?? "");
        const entity = String(dest.entity_id ?? "");
        await page.goto(
            `/workspace/work-unit/${unit}?cohort=none&subject_id=${encodeURIComponent(entity)}`,
        );
        await page.waitForTimeout(15_000);
        const state = await page.evaluate(() => {
            const surface = document.querySelector('[data-component="ProvisionedWorkUnitSurface"]');
            const alert = document.querySelector('[role="alert"]');
            return {
                terminal: surface?.getAttribute("data-terminal-outcome") ?? null,
                cohortSelected: surface?.getAttribute("data-cohort-selected") ?? null,
                errorKind: document.querySelector("[data-queue-error-kind]")?.getAttribute("data-queue-error-kind") ?? null,
                alertText: alert?.textContent?.trim() ?? null,
                url: window.location.href,
            };
        });
        console.log("[PROBE surface]", JSON.stringify(state));
    }
});
