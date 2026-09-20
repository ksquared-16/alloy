/**
 * §2 — a second LEGITIMATE option for Certa, through the existing configuration authority.
 *
 * WHY BOTH ARE LEGITIMATE. The canonical resolver's own doctrine is "a location-scoped rate beats
 * the org default" — that is the documented scope mechanism, not a loophole. So the organisation
 * keeps its $185.00/weekly school-age default, and Certa's campus gets its own weekly rate. Both
 * price the same variant, payer and cadence the assignment already resolves under; both are
 * effective on the assignment's own `asOf`. Neither is fabricated and neither would normally be
 * rejected: the site rate wins the narrowing and the org default stays `applicable`, which is
 * exactly "one recommended, one other available".
 *
 * Authored through POST /api/admin/commercial/tuition-rates — the same route the configuration
 * surface uses. No direct insert, and the existing accepted term is not touched.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const CERTA = {
    variantId: "ee157cff-3546-4172-b591-984b96fbec10",
    locationId: "1a5644a7-45c4-413b-9021-5f556118b6e2",
    cadence: "weekly",
    payer: "private_pay",
    effectiveStart: "2026-09-01",
    siteRateCents: 19500,
};

test("author the site rate", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    expect(page.url()).not.toContain("/login");

    const result = await page.evaluate(async (c) => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        /* Idempotent: if this fixture already exists, do not author a second one. */
        const existing = await j(await fetch("/api/admin/commercial/tuition-rates", { credentials: "include" }));
        const rows = (existing.body as { rates?: Array<Record<string, unknown>> } | null)?.rates
            ?? (Array.isArray(existing.body) ? (existing.body as Array<Record<string, unknown>>) : []);
        const already = rows.find(
            (r) => String(r.variant_id) === c.variantId && String(r.location_id ?? "") === c.locationId
                && String(r.cadence_key) === c.cadence,
        );
        if (already) return { step: "already_authored", id: already.id, listStatus: existing.status };

        const created = await j(await fetch("/api/admin/commercial/tuition-rates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                variant_id: c.variantId,
                location_id: c.locationId,
                cadence_key: c.cadence,
                payer_type: c.payer,
                rate_cents: c.siteRateCents,
                is_active: true,
                effective_start: c.effectiveStart,
                metadata: { authored_for: "financials-11b-slice-a", note: "Site rate for the North Campus school-age weekly variant" },
            }),
        }));
        return { step: "created", created, listStatus: existing.status, listCount: rows.length };
    }, CERTA);
    log(`AUTHORING: ${JSON.stringify(result, null, 1).slice(0, 900)}`);
    writeFileSync(`${OUT}/site-rate-authoring.json`, JSON.stringify(result, null, 2));
});
