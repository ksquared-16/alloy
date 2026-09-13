/**
 * THE SEAM THAT DECIDES WHETHER A FAILED READ CAN BECOME MONEY.
 *
 * Every per-identifier fact in the Accounts cohort — reductions, payment applications,
 * responsibility allocations, subsidy claim lines, the payments behind those applications, the
 * agreements a charge was billed from, and the household names — is read through one function.
 * That function exists because the alternative was measured in production behaviour twice:
 *
 *   a single `.in()` over the whole cohort built a request URI longer than the server accepts,
 *   PostgREST answered `URI too long`, the error was discarded, and `data: null` was then read as
 *   "there is nothing" rather than "we could not find out".
 *
 * For the payments read that meant every application lost its payment status, none of them
 * counted, and no account in the org could ever appear as settled. Gross was right; outstanding
 * was wrong by exactly the money that had been paid.
 *
 * These are hermetic: the "server" here is a function, so a failing batch is a certainty rather
 * than something that needs a large enough tenant to reproduce. The live suite proves the same
 * rule against real money; this proves it in the small, on every run, including the branch that a
 * healthy database will never take.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ID_BATCH, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";

type Row = { id: string };

/** A server that answers only for the ids it was actually asked about. */
function server(known: string[], opts: { failOnBatch?: number; message?: string } = {}) {
    const calls: string[][] = [];
    const set = new Set(known);
    const run = (batch: string[]) => {
        calls.push(batch);
        if (opts.failOnBatch !== undefined && calls.length === opts.failOnBatch) {
            return Promise.resolve({
                data: null,
                error: { message: opts.message ?? "URI too long\n" },
            });
        }
        return Promise.resolve({
            data: batch.filter((id) => set.has(id)).map((id) => ({ id })) as Row[],
            error: null,
        });
    };
    return { run, calls };
}

const ids = (n: number, prefix = "id") => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

describe("the fail-closed batched cohort read", () => {
    it("reads a small cohort in a single request", async () => {
        const wanted = ids(12);
        const s = server(wanted);
        const rows = await readInBatches<Row>("small", wanted, s.run);

        expect(s.calls.length, "a cohort inside one batch is not split").toBe(1);
        expect(rows.map((r) => r.id)).toEqual(wanted);
    });

    it("returns nothing, and asks nothing, for an empty cohort", async () => {
        const s = server([]);
        expect(await readInBatches<Row>("empty", [], s.run)).toEqual([]);
        expect(s.calls.length, "an empty cohort must not issue a request").toBe(0);
    });

    /*
     * THE CASE THE DEFECT LIVED IN. 392 payments is roughly what one certification tenant produced;
     * the point is only that it is comfortably more than a single URL-safe batch.
     */
    it("returns the complete union for a cohort far larger than one batch", async () => {
        const wanted = ids(392);
        const s = server(wanted);
        const rows = await readInBatches<Row>("payments backing applied money", wanted, s.run);

        expect(s.calls.length).toBe(Math.ceil(392 / ID_BATCH));
        expect(rows.length, "every row survives the union — this is the money that was lost").toBe(392);
        expect(new Set(rows.map((r) => r.id)).size).toBe(392);
        expect(rows.map((r) => r.id).sort()).toEqual([...wanted].sort());
    });

    it("never asks for an identifier it was not given, and never widens the scope", async () => {
        const wanted = ids(200);
        const s = server([...wanted, "id-not-asked-for"]);
        const rows = await readInBatches<Row>("scope", wanted, s.run);

        const asked = s.calls.flat();
        expect(new Set(asked)).toEqual(new Set(wanted));
        expect(asked.length, "no identifier is requested twice").toBe(wanted.length);
        expect(rows.some((r) => r.id === "id-not-asked-for"), "a batch may not widen the read").toBe(false);
    });

    /*
     * A REPEATED IDENTIFIER MUST NOT BECOME REPEATED MONEY. Duplicates that straddle a batch
     * boundary are the way a union silently double-counts, and in this file a duplicated payment
     * application is an amount applied twice.
     */
    it("de-duplicates identifiers so no row can cross a batch boundary twice", async () => {
        const distinct = ids(150);
        const withDupes = [...distinct, ...distinct.slice(0, 40), distinct[0]!];
        const s = server(distinct);
        const rows = await readInBatches<Row>("dupes", withDupes, s.run);

        expect(rows.length, "the union holds each row exactly once").toBe(150);
        expect(new Set(rows.map((r) => r.id)).size).toBe(150);
        expect(s.calls.flat().length, "duplicates are not even requested").toBe(150);
    });

    /*
     * NO SILENT PARTIAL SUCCESS. The first batch succeeding is precisely what made the original
     * defect plausible on screen: some money appeared, so nothing looked broken.
     */
    it("fails the whole logical read when any single batch fails", async () => {
        const wanted = ids(300);
        const s = server(wanted, { failOnBatch: 3, message: "URI too long\n" });

        await expect(
            readInBatches<Row>("payments backing applied money", wanted, s.run),
        ).rejects.toThrow(/payments backing applied money could not be read \(URI too long\)/);
    });

    it("fails on the very first batch too, rather than returning an empty cohort", async () => {
        const wanted = ids(300);
        const s = server(wanted, { failOnBatch: 1, message: "canceling statement due to statement timeout" });

        await expect(readInBatches<Row>("reductions", wanted, s.run)).rejects.toThrow(
            /reductions could not be read \(canceling statement due to statement timeout\)/,
        );
    });

    /*
     * THE EXACT SHAPE THAT WAS WRONG. `data: null` with no error is not an outcome this seam may
     * quietly translate into "nothing exists" for one batch while other batches return rows — a
     * partial answer presented as a whole one is the defect restated.
     */
    it("treats a null payload without an error as an empty batch, not as a whole empty read", async () => {
        const wanted = ids(160);
        let call = 0;
        const rows = await readInBatches<Row>("mixed", wanted, (batch) => {
            call += 1;
            return Promise.resolve(
                call === 1
                    ? { data: null, error: null }
                    : { data: batch.map((id) => ({ id })) as Row[], error: null },
            );
        });
        expect(rows.length, "later batches still contribute their rows").toBe(80);
    });
});

/*
 * ── THE CAP THAT IS NOT OURS ────────────────────────────────────────────────────────────────────
 *
 * The cohort asked for `limit(2000)`. PostgREST answered 1,000 — its own `db-max-rows` — with no
 * error and nothing on the response anyone read. The code treated that page as the entire cohort
 * and set `truncated: false`, because 1,000 is not >= 2,000.
 *
 * The consequence was not a slightly short list. With 1,228 posted charges in the certification
 * tenant, the four representative households — older service dates than the tuition another lane
 * had just generated — were absent from Accounts and from Charges entirely. A family who owed money
 * could not be looked up. Nothing said so.
 *
 * These are source-level pins rather than behavioural ones: the seam is inside
 * `resolveFinancialPositionCohort`, the behaviour needs a database with more than a thousand
 * charges in it, and the rule is simple enough to state exactly. A live tenant proves the effect;
 * this proves the rule survives the next edit.
 */
describe("the cohort's own charge read", () => {
    const source = readFileSync(
        resolve(__dirname, "../../lib/financials/workspace/resolveFinancialPosition.ts"),
        "utf8",
    );

    it("pages the read rather than trusting a single limit", () => {
        expect(source, "the cohort must request successive pages").toMatch(/\.range\(/);
        expect(source, "the server's page size is stated, not assumed away").toMatch(/const PAGE = 1000/);
    });

    it("stops on a short page instead of asking forever", () => {
        expect(source).toMatch(/batch\.length < want/);
    });

    /*
     * A SHORT READ MUST NOT BE REPORTED AS A COMPLETE ONE. `truncated` is what the surface would
     * use to tell an operator their view is partial; if it lies, the omission is undetectable.
     */
    it("reports truncation only when the cap was actually reached", () => {
        expect(source).toMatch(/const truncated = !reachedEnd && charges\.length >= scanCap/);
    });

    /*
     * PAGING BY RANGE OVER A NON-UNIQUE SORT KEY REPEATS AND SKIPS ROWS at the page boundary — and
     * a month of generated tuition is thousands of charges sharing one service date.
     */
    it("orders by a unique tiebreaker so pages cannot overlap or skip", () => {
        expect(source, "service_date alone is not a stable page key").toMatch(
            /\.order\("id", \{ ascending: true \}\)/,
        );
    });
});
