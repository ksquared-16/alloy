/**
 * §1/§4 — the commercial catalog as the RESOLVER sees it, before any fixture is built.
 *
 * `resolveAssignmentPricingOptions` narrows offerings by (programKey, attendanceType, effective),
 * variants by days-a-week, and rates by payer/cadence/effective/site. Then, WITHIN A CADENCE, a
 * later effective start supersedes an earlier one, and only an exact tie survives as ambiguous.
 *
 * So the fixture's program/schedule facts have to be chosen from what the catalog actually offers,
 * not guessed — and the duplicate weekly rate has to be classified against that supersession rule
 * rather than against the word "duplicate".
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("catalog", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const j = async (u: string) => {
            const r = await fetch(u, { credentials: "include" });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const arr = (b: unknown, ...keys: string[]): Array<Record<string, unknown>> => {
            if (Array.isArray(b)) return b as Array<Record<string, unknown>>;
            for (const k of keys) {
                const v = (b as Record<string, unknown> | null)?.[k];
                if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
            }
            return [];
        };
        const products = await j("/api/admin/commercial/products");
        const rates = await j("/api/admin/commercial/tuition-rates");
        const cadences = await j("/api/admin/commercial/billing-cadences");
        const programs = await j("/api/admin/location-program-categories?include_inactive=true");
        const locations = await j("/api/admin/locations?hierarchy=1");
        return {
            productsStatus: products.status,
            productsKeys: products.body && typeof products.body === "object" ? Object.keys(products.body as object) : null,
            products: arr(products.body, "products", "offerings", "data").slice(0, 40),
            ratesCount: arr(rates.body, "rates", "data").length,
            rates: arr(rates.body, "rates", "data"),
            cadences: arr(cadences.body, "cadences", "data").map((c) => ({ id: c.id, key: c.key ?? c.cadence_key, label: c.label ?? c.name, active: c.is_active })),
            programs: arr(programs.body, "categories", "program_categories", "data").map((p) => ({ id: p.id, key: p.key, label: p.label ?? p.name, loc: p.location_id, active: p.is_active })),
            locationCount: arr(locations.body, "locations", "data").length,
            locations: arr(locations.body, "locations", "data").map((l) => ({ id: l.id, name: l.name, type: l.location_type ?? l.type })).slice(0, 12),
        };
    });
    writeFileSync(`${OUT}/catalog.json`, JSON.stringify(out, null, 2));
    log(`products status=${out.productsStatus} keys=${JSON.stringify(out.productsKeys)} n=${out.products.length}`);
    log(`rates=${out.ratesCount} cadences=${JSON.stringify(out.cadences)}`);
    log(`programs=${JSON.stringify(out.programs)}`);
    log(`locations=${JSON.stringify(out.locations)}`);
    log(`first product: ${JSON.stringify(out.products[0], null, 1).slice(0, 1500)}`);
});
