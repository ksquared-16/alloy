import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("certa pricing facts", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    /* Attach BEFORE navigating: the config resource caches, so a late listener sees nothing. */
    let oppId = "";
    page.on("request", (r) => { const m = /financial-config\/opportunity\/([0-9a-f-]{36})/.exec(r.url()); if (m) oppId = m[1]; });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true });
    await page.waitForTimeout(13_000);
    log(`opportunity seen: ${oppId || "(none)"}`);
    expect(oppId, "the config resource must have been asked").not.toBe("");
    const out = await page.evaluate(async (oid) => {
        const r = await fetch(`/api/admin/financial-config/opportunity/${oid}`, { credentials: "include" });
        const b = await r.json();
        return (b.assignments ?? []).map((v: Record<string, any>) => ({
            child: v.childLabel, ocm: v.opportunityCustomerMemberId, state: v.state,
            facts: v.facts, resolutionKey: v.resolutionKey,
            recommended: v.recommended ? { sourceId: v.recommended.sourceId, variantId: v.recommended.variantId, offeringId: v.recommended.offeringId, cadence: v.recommended.cadenceKey, amount: v.recommended.amountCents, scope: v.recommended.scope, effective: v.recommended.effectiveStart, label: v.recommended.amountLabel, variantLabel: v.recommended.variantLabel } : null,
            applicable: (v.applicable ?? []).map((o: Record<string, any>) => ({ id: o.sourceId, amount: o.amountCents, scope: o.scope, cadence: o.cadenceKey })),
            acceptedIsStale: v.acceptedIsStale,
            accepted: v.accepted ? { id: v.accepted.termId, amount: v.accepted.amountCents, cadence: v.accepted.cadenceKey, state: v.accepted.state, source: v.accepted.source } : null,
        }));
    }, oppId);
    log(`opportunity ${oppId}`);
    log(JSON.stringify(out, null, 1));
    writeFileSync(`${OUT}/certa-facts.json`, JSON.stringify({ oppId, assignments: out }, null, 2));
});
