/**
 * The catalog live suite's proof contract, checked on its SOURCE TEXT — the live suite is read as a file, never
 * imported or run here (no database, no credential, no client).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FINANCIALS_ISOLATED_SUITE } from "../../scripts/qa/financialsIsolatedTests.mjs";
import { CATALOG_PROOF_SCHEMA, OWNED_AFTER_EXPECTED, OWNED_TABLES, RETAINED_BILLING_PERIODS, judgeCatalogProof } from "../../scripts/qa/financialsIsolatedProof.mjs";

const src = readFileSync(join(process.cwd(), FINANCIALS_ISOLATED_SUITE[0]), "utf8");

describe("the live suite, as written", () => {
    it("verifies the executor's v2 authority before its client exists, and takes target and org from the verdict", () => {
        const verify = src.indexOf("verifyFinancialsFixtureAuthority(process.env");
        const gate = src.indexOf("runAttestedFinancialsConnection(process.env");
        const client = src.indexOf("createClient(String(c.apiOrigin)");
        expect(verify).toBeGreaterThan(0);
        expect(gate).toBeGreaterThan(verify);
        /* The client is built inside the gate's connect, from the frozen attested origin — and nowhere else. */
        expect(client).toBeGreaterThan(gate);
        expect(src.match(/createClient\(/g)).toHaveLength(1);
        expect(src).toContain("connection: { url: process.env.DATABASE_URL, clientEnv: process.env, apiOrigin: url }");
        expect(src).toContain("url: process.env.DATABASE_URL, clientEnv: process.env, apiOrigin: env!.url");
        expect(src).toContain("url !== auth.authority.api_url || orgId !== auth.authority.org_id");
        expect(src).not.toMatch(/describe\.skip\s*\(\s*"catalog/);
    });

    it("counts exactly the tables the proof contract names, in its order", () => {
        const block = src.slice(src.indexOf("const counts: Record<string, number> = {"), src.indexOf("if (Object.keys(counts).join() !== OWNED_TABLES.join())"));
        const keys = [...block.matchAll(/^\s{8}([a-z_]+): await exact\(/gm)].map((m) => m[1]);
        expect(keys).toEqual([...OWNED_TABLES]);
    });

    it("deletes only by owned identity: drafts on its own agreements, its own products, its own template", () => {
        const deletes = src.split("\n").filter((l) => l.includes(".delete()"));
        expect(deletes).toHaveLength(3);
        for (const l of deletes) expect(l).toContain('.eq("org_id", ORG)');
        expect(deletes[0]).toMatch(/from\("charges"\)\.delete\(\).*\.in\("billable_source_id", AGREEMENTS\)\.eq\("status", "draft"\)/);
        expect(deletes[1]).toMatch(/from\("commercial_products"\)\.delete\(\).*\.in\("id", Object\.values\(PRODUCT\)\)/);
        expect(deletes[2]).toMatch(/from\("financial_charge_templates"\)\.delete\(\).*\.eq\("id", TEMPLATE\)/);
        expect(src).not.toMatch(/\.delete\(\)[^\n]*\.(ilike|like|neq)\(/);
    });

    it("creates and posts charges only through the canonical services — no raw SQL, no direct charge insert", () => {
        expect(src).not.toMatch(/\.rpc\(|\bsql`|pg\.|from\("charges"\)\.(insert|upsert|update)\(|from\("financial_journal_entries"\)\.(insert|upsert|update|delete)\(/);
        for (const call of ["writeTemplateDraftCharge(", "previewTemplateCharge(", "postChildcareCharge(", "loadCatalogChargeOptions(", "chargeActions.executeMultiChildAdd("]) {
            expect(src).toContain(call);
        }
    });

    it("every seeded row has a fixed per-run id (no anonymous row escapes the count)", () => {
        const seeded = [...src.matchAll(/seed\("([a-z_]+)",\s*\{\s*id(?:: ([^,]+))?,/g)].map((m) => [m[1], m[2] ?? "id"]);
        expect(seeded.length).toBeGreaterThan(5);
        for (const [, id] of seeded) expect(id).not.toMatch(/randomUUID/);
        expect(src).not.toMatch(/id: randomUUID\(\)/);
        expect(src.match(/randomUUID\(\)/g)).toHaveLength(1); // the run id itself
    });
});

describe("the proof contract", () => {
    it("retains exactly the posted charges and their journal entries, and removes drafts, products and the template", () => {
        expect(CATALOG_PROOF_SCHEMA).toBe("financials.catalog_live_proof.v2");
        expect(OWNED_AFTER_EXPECTED).toMatchObject({ charges_nondraft: 3, financial_journal_entries: 3, charges_draft: 0, commercial_products: 0, financial_charge_templates: 0 });
    });

    it("reports the run customer's commercial periods: measured before the first write and after cleanup, never deleted", () => {
        expect(RETAINED_BILLING_PERIODS).toEqual({ min: 2, max: 4, status: "open" });
        const census = src.slice(src.indexOf("async function measureBillingPeriods"), src.indexOf("/** The posted charges this run leaves"));
        expect(census).toContain('.from("financial_billing_periods").select("id, period_key, status").eq("org_id", ORG).eq("customer_id", CUSTOMER)');
        expect(src.indexOf("billingPeriodsBefore = (await measureBillingPeriods(db)).length")).toBeGreaterThan(src.indexOf("ownedBefore = await countOwned(db)"));
        expect(src.indexOf("billingPeriodsBefore = (await measureBillingPeriods(db)).length")).toBeLessThan(src.indexOf('await seed("customers"'));
        expect(src).toContain("billing_periods: { before: billingPeriodsBefore, after: await measureBillingPeriods(db) }");
        expect(src).not.toMatch(/from\("financial_billing_periods"\)\.(delete|insert|upsert|update)\(/);
    });

    it("is judged whole: a value outside the contract is never echoed", () => {
        const r = judgeCatalogProof({ schema: CATALOG_PROOF_SCHEMA, run_prefix: "ca7a0b1c; rm -rf", owned_before: {}, owned_after: {}, retained: [], accounting_period_created: false });
        expect(r).toEqual({ ok: false, checks: [], problems: ["proof_report_invalid"] });
        expect(judgeCatalogProof(null)).toEqual({ ok: false, checks: [], problems: ["proof_report_absent"] });
    });
});
