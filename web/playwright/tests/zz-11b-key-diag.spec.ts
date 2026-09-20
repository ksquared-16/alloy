import { test, expect } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const OCM = "79f8011d-a236-4054-bee7-af10f1dbc632";
const ORG_DEFAULT = "5532489d-eed3-4080-9477-f47a94fde1c6";
test("what key does the server compute", async ({ page }) => {
    let oppId = "";
    page.on("request", (r) => { const m = /financial-config\/opportunity\/([0-9a-f-]{36})/.exec(r.url()); if (m) oppId = m[1]; });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true });
    await page.waitForTimeout(12_000);
    const out = await page.evaluate(async ([oid, ocm, src]) => {
        const j = async (u: string, init?: RequestInit) => { const r = await fetch(u, { credentials: "include", cache: "no-store", ...(init ?? {}) }); return { status: r.status, body: await r.json().catch(() => null) }; };
        const cfg = await j(`/api/admin/financial-config/opportunity/${oid}`);
        const certa = ((cfg.body?.assignments ?? []) as Array<Record<string, any>>).find((v) => /Certa/.test(v.childLabel));
        const preview = await j("/api/admin/actions/execute", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_key: "enrollment.pricing.override", entity_type: "opportunity_customer_member",
                entity_id: ocm, mode: "preview", confirmation: { confirmed: false },
                payload: { opportunity_customer_member_id: ocm, resolution_key: certa?.resolutionKey, selected_source_id: src, cadence_key: "weekly", override_reason: "diagnostic", supersede: true },
            }),
        });
        return {
            viewKey: certa?.resolutionKey, viewConfigVersion: certa?.configVersion,
            viewAsOf: certa?.facts?.asOf, acceptedKey: certa?.accepted?.resolutionKey,
            previewStatus: preview.status, preview: JSON.stringify(preview.body).slice(0, 700),
        };
    }, [oppId, OCM, ORG_DEFAULT]);
    log(JSON.stringify(out, null, 1));
});
