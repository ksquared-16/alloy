/** create_lead contract, asked of the action itself rather than inferred from its source. */
import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("probe", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async () => {
        const post = async (b: unknown) => {
            const x = await fetch("/api/admin/actions/execute", {
                method: "POST", headers: { "content-type": "application/json" },
                credentials: "include", body: JSON.stringify(b),
            });
            const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; }
        };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; } };

        const scheduleTypes = await get("/api/admin/option-sets/childcare_schedule_type");
        const preview = await post({
            action_key: "create_lead",
            entity_type: "opportunity",
            entity_id: "",
            mode: "preview",
            confirmation: { confirmed: false },
            payload: {
                first_name: "PBCert", last_name: "Automation",
                email: "pbcert.automation@periodic-billing-cert.invalid",
                phone: "555-0199",
                children: [{ first_name: "Pbchild", last_name: "Automation", dob: "2020-04-01" }],
            },
        });
        return { scheduleTypes: JSON.stringify(scheduleTypes.j).slice(0, 700), preview: JSON.stringify(preview.j).slice(0, 2200) };
    });
    log(JSON.stringify(r, null, 1).slice(0, 4000));
});
