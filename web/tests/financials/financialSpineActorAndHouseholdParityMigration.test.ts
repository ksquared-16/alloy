import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";

/**
 * THE GUARANTEES MUST QUANTIFY OVER THE SOURCE SET, not over one of its members.
 *
 * `20260827120000_household_billable_source` admitted `customer` so a family could be charged before
 * enrolling. It widened the CHECK constraints and stopped: posted-charge immutability and the
 * RESTRICTIVE role gate were both written against the `'enrollment_agreement'` literal, so a
 * household charge was representable without being protected — editable in place after posting, and
 * writable by any authenticated org member. This locks the fix to the vocabulary rather than to a
 * list repeated in SQL, so admitting a fourth childcare source cannot silently skip either rule.
 */
const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260902130000_financial_spine_actor_and_household_parity.sql",
);

describe("financial spine — actor attribution and household parity migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("records WHO created, updated and posted a charge", () => {
        for (const col of ["created_by", "updated_by", "posted_by"]) {
            expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${col} uuid`);
        }
    });

    it("freezes the posting stamp and the posting actor on a posted charge", () => {
        expect(sql).toContain("NEW.posted_at IS DISTINCT FROM OLD.posted_at");
        expect(sql).toContain("NEW.posted_by IS DISTINCT FROM OLD.posted_by");
    });

    it("applies immutability and the role gate to EVERY childcare billable source", () => {
        for (const source of CHILDCARE_BILLABLE_SOURCE_TYPES) {
            expect(sql, `immutability must cover '${source}'`).toContain(`'${source}'::text`);
        }
        // The trigger tests membership of the set, never one literal.
        expect(sql).toContain("OLD.billable_source_type = ANY (childcare_sources)");
        expect(sql).not.toMatch(/OLD\.billable_source_type\s*=\s*'enrollment_agreement'/);
        // The role gate covers the same set, on the same three substrate tables.
        expect(sql).toContain("_childcare_write_rolegate");
        for (const tbl of ["charges", "ledger_transactions", "gl_journal_lines"]) {
            expect(sql).toContain(`'${tbl}'`);
        }
        expect(sql).toContain("has_org_role");
    });

    it("leaves job billing alone — this spine does not govern job charges", () => {
        expect(sql).not.toContain("'job'::text");
    });
});
