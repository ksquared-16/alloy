import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";

/**
 * A POSTED CHARGE IS CORRECTED ONCE, and the rule lives where money rules are authoritative.
 *
 * `charge.reverse` shipped correctable posted money with no bound. Reversing a $1,300 charge twice
 * leaves the family credited $1,300 they were never charged, and a reversal — posted money itself —
 * could be reversed in turn, forever. A service check alone cannot state this: two concurrent
 * reversals each read zero siblings and each write. The unique index is what actually decides.
 */
const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260902140000_charge_correction_lineage.sql",
);

describe("charge correction lineage migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("bounds a charge to ONE live reversal, with an index rather than a read-then-write", () => {
        expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_charges_one_live_reversal_per_source");
        expect(sql).toContain("ON public.charges (source_charge_id)");
        // The predicate the service mirrors: a voided correction is not one that stands.
        expect(sql).toContain("AND status <> 'void'");
        expect(sql).toContain("AND metadata ->> 'correction_kind' = 'reversal'");
    });

    it("scopes the unique index to the SOURCE CHARGE, never to the org", () => {
        // `source_charge_id` is a charge primary key. Adding org_id would widen the rule to one
        // reversal per org, which is not a bound at all.
        const indexBlock = sql.slice(sql.indexOf("CREATE UNIQUE INDEX"));
        expect(indexBlock).not.toContain("org_id");
    });

    it("refuses a correction OF a correction, so the chain has a terminus", () => {
        expect(sql).toContain("parent_source_charge_id IS NOT NULL");
        expect(sql).toContain("is itself a correction and cannot be corrected");
    });

    it("refuses any further correction once a charge has been reversed", () => {
        expect(sql).toContain("has already been reversed and admits no further correction");
    });

    it("refuses a correction that points at no charge at all", () => {
        // `source_charge_id` carries no FK on this table, so the trigger is the only thing that says
        // a correction must have something to correct.
        expect(sql).toContain("which does not exist");
    });

    it("governs EVERY childcare billable source, and leaves job billing alone", () => {
        for (const source of CHILDCARE_BILLABLE_SOURCE_TYPES) {
            expect(sql, `correction lineage must cover '${source}'`).toContain(`'${source}'::text`);
        }
        expect(sql).toContain("NEW.billable_source_type = ANY (childcare_sources)");
        expect(sql).not.toContain("'job'::text");
    });

    it("fires before the write, on the column that carries the lineage", () => {
        expect(sql).toContain("BEFORE INSERT OR UPDATE OF source_charge_id ON public.charges");
    });
});
