/**
 * The catalog live suite's proof contract, checked on its SOURCE TEXT — the live suite is read as a file, never
 * imported or run here (no database, no credential, no client).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FINANCIALS_ISOLATED_SUITE } from "../../scripts/qa/financialsIsolatedTests.mjs";
import { CATALOG_PROOF_SCHEMA, OWNED_AFTER_EXPECTED, OWNED_TABLES, judgeCatalogProof } from "../../scripts/qa/financialsIsolatedProof.mjs";

const src = readFileSync(join(process.cwd(), FINANCIALS_ISOLATED_SUITE[0]), "utf8");

describe("the live suite, as written", () => {
    it("verifies the executor's v2 authority before its client exists, and takes target and org from the verdict", () => {
        const verify = src.indexOf("verifyFinancialsFixtureAuthority(process.env");
        const client = src.indexOf("createClient(env!.url");
        expect(verify).toBeGreaterThan(0);
        expect(client).toBeGreaterThan(verify);
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
        expect(CATALOG_PROOF_SCHEMA).toBe("financials.catalog_live_proof.v1");
        expect(OWNED_AFTER_EXPECTED).toMatchObject({ charges_nondraft: 3, financial_journal_entries: 3, charges_draft: 0, commercial_products: 0, financial_charge_templates: 0 });
    });

    it("is judged whole: a value outside the contract is never echoed", () => {
        const r = judgeCatalogProof({ schema: CATALOG_PROOF_SCHEMA, run_prefix: "ca7a0b1c; rm -rf", owned_before: {}, owned_after: {}, retained: [], accounting_period_created: false });
        expect(r).toEqual({ ok: false, checks: [], problems: ["proof_report_invalid"] });
        expect(judgeCatalogProof(null)).toEqual({ ok: false, checks: [], problems: ["proof_report_absent"] });
    });
});
