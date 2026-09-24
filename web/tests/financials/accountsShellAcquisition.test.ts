/**
 * WHAT THE ACCOUNTS SHELL WAITS FOR.
 *
 * Measured on deployed staging, decomposed rather than treated as one event:
 *
 *   acknowledgement      34-52 ms
 *   first geometry       35-54 ms      <- the host itself is not slow
 *   interactive list  1,414-2,067 ms
 *   usable shell      2,340-3,129 ms
 *   shell -> ledger        3-6 ms      <- and the Financials data path is not the problem
 *
 * The wait is two serial data waves. `/api/admin/financials/subjects` returns 4.2 KB and took
 * 1,370 ms, gating the account list; the card cannot be asked for until an account is selected,
 * so it starts at +1,415 ms. And `responsibility-positions` and `family-discount-position` were
 * each issued TWICE — at +1,414 ms and again at +2,436 ms.
 *
 * These hold the two structural defects that were actually repaired.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveFinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";

const ROWS: Record<string, Array<Record<string, unknown>>> = {
    customers: [{ id: "cust-1", name: "H", status: "active" }],
    child_enrollment_agreements: [{ id: "agr-1", customer_id: "cust-1", customer_member_id: "mem-1", site_location_id: "site-1", status: "active" }],
    customer_members: [{ id: "mem-1", customer_id: "cust-1", first_name: "A", last_name: "B", display_name: "A B" }],
    customer_persons: [{ customer_id: "cust-1", person_id: "per-1", role_type: "parent", is_primary: true, status: "active", persons: { first_name: "R", last_name: "P" } }],
    persons: [{ id: "per-1", first_name: "R", last_name: "P", full_name: "R P" }],
};

/** Answers nothing until released; how many releases it takes is the depth of the cohort. */
function holdingClient() {
    const held: Array<{ table: string; keys: string[]; release: () => void }> = [];
    const builder = (table: string) => {
        const keys: string[] = [];
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "not", "gte", "lte", "lt", "gt", "or", "order", "limit", "range", "overlaps", "contains"]) {
            chain[k] = () => chain;
        }
        /* The COLUMN a read is keyed on: `customer_members` by customer_id and by id are two
           different questions, and a gate that only counts the table cannot tell them apart. */
        for (const k of ["eq", "in", "is", "neq"]) {
            chain[k] = (col: string) => { keys.push(String(col)); return chain; };
        }
        const answer = { data: ROWS[table] ?? [], error: null, count: (ROWS[table] ?? []).length };
        chain.maybeSingle = () => new Promise((res) => held.push({ table, keys, release: () => res({ data: (ROWS[table] ?? [])[0] ?? null, error: null }) }));
        chain.single = chain.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) => { held.push({ table, keys, release: () => resolve(answer) }); };
        return chain;
    };
    return { client: { from: (t: string) => builder(t) } as never, held };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

async function waves() {
    const { client, held } = holdingClient();
    let settled = false;
    const done = resolveFinancialSubjectCohort(client, { orgId: "org", siteLocationIds: [] } as never)
        .then((v) => { settled = true; return v; }, (e) => { settled = true; throw e; });
    const out: string[][] = [];
    const reads: Array<{ table: string; keys: string[] }> = [];
    await flush();
    while (held.length > 0 && out.length < 40) {
        const w = held.splice(0, held.length);
        out.push([...new Set(w.map((x) => x.table))]);
        reads.push(...w.map((x) => ({ table: x.table, keys: x.keys })));
        w.forEach((x) => x.release());
        await flush();
    }
    await done;
    expect(settled).toBe(true);
    return Object.assign(out, { reads });
}

describe("the account list's cohort does not queue reads that share an input", () => {
    it("four waves, not seven", async () => {
        const w = await waves();
        expect(w.length, `the cohort waited on ${w.length} round trips: ${w.map((x) => x.join("+")).join(" -> ")}`)
            .toBeLessThanOrEqual(4);
    });

    it("the facets go out with the agreement sites, not behind them", async () => {
        /*
         * `readChildNames`, `readContactNames` and `readCurrentPlacements` take the household ids
         * wave one produced and nothing else. Queuing them behind the three-deep site read was the
         * measured defect.
         */
        const w = await waves();
        const at = (t: string) => w.findIndex((x) => x.includes(t));
        expect(at("customer_persons"), "the contacts facet is not read at all").toBeGreaterThanOrEqual(0);
        expect(at("customer_persons"), "contacts must not wait for the site map")
            .toBeLessThanOrEqual(at("child_enrollment_agreements"));
    });

    it("the household's children are read ONCE, not once for names and once for rooms", async () => {
        /*
         * `readChildNames` and `readCurrentPlacements` both asked `customer_members` for the same
         * households — the first for names, the second only to learn which member belongs to which
         * household. Same table, same key, same batches, twice.
         *
         * Measured on deployed staging, the facet phase was 326.7 ms ON TOP of the agreement-site
         * reads it already overlaps, and the placement chain it sits in was members -> placements
         * -> process instances. One read feeds both now, which also removes the first hop.
         */
        const w = await waves();
        /*
         * Counted by KEY, not by table. `readAgreementSites` also reads `customer_members`, keyed
         * by ID for orphan agreements — a different question. The duplicate this removes is the
         * one keyed by `customer_id`: names asked for it, and the placement map asked again.
         */
        const byCustomer = w.reads.filter((r) => r.table === "customer_members" && r.keys.includes("customer_id"));
        expect(byCustomer.length,
            `the households' children were read ${byCustomer.length} times by customer_id: ${w.map((x) => x.join("+")).join(" -> ")}`)
            .toBe(1);
        const firstMembers = w.findIndex((x) => x.includes("customer_members"));
        const placements = w.findIndex((x) => x.includes("child_placements"));
        expect(placements, "the placements are read").toBeGreaterThanOrEqual(0);
        /*
         * The placements used to wait for their OWN members read. They now follow the one the
         * names already needed, so they sit in the very next wave. A second members read of the
         * same households would push them out again.
         *
         * `readAgreementSites` also reads `customer_members`, keyed by ID for orphan agreements —
         * a different question with a different key, which is why this measures the DISTANCE to
         * the placements rather than counting the table.
         */
        expect(placements - firstMembers,
            `placements sit ${placements - firstMembers} waves after the children: ${w.map((x) => x.join("+")).join(" -> ")}`)
            .toBeLessThanOrEqual(1);
    });

    it("nothing was dropped: every cohort source is still read", async () => {
        const tables = (await waves()).flat();
        for (const t of ["customers", "child_enrollment_agreements", "customer_members", "customer_persons"]) {
            expect(tables, `${t} is still read`).toContain(t);
        }
    });
});

describe("the relationship reads are issued once per account, not once per render", () => {
    const CARD = readFileSync(
        join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"),
        "utf8",
    );

    it("the fetch effect does not depend on the card's subjects", () => {
        /*
         * `vm?.subjects` in this dependency list is what made both requests fire a second time when
         * the card resolved. The re-label it existed for is a rendering concern over an answer
         * already in hand.
         */
        const at = CARD.indexOf("responsibility-positions?customer_id=");
        expect(at, "the paired read is findable").toBeGreaterThan(0);
        const deps = CARD.slice(at, CARD.indexOf("}, [", at) + 200);
        const list = deps.slice(deps.indexOf("}, ["));
        expect(list, "the acquisition must not re-fire when the subjects land").not.toContain("vm?.subjects");
        expect(list).toContain("customerId");
    });

    it("the re-label still happens, from the bodies already held", () => {
        expect(CARD, "the responsibility body is kept for re-derivation").toContain("setResponsibilityPositionBody");
        expect(CARD, "and the discount row is re-derived when the subjects arrive")
            .toMatch(/\[discountPositionBody, responsibilityPositionBody, vm\?\.subjects\]/);
    });
});

describe("the account list's own boundaries are published", () => {
    const ROUTE = readFileSync(join(process.cwd(), "app/api/admin/financials/subjects/route.ts"), "utf8");

    it("the subjects route reports where its time goes", () => {
        /*
         * This route gates the Accounts list and returns 4.2 KB in 1,634-2,664 ms on deployed
         * staging. Collapsing the cohort's facet chaining seven waves to four did not move that
         * number, so the pole is somewhere the code reading did not find — and the certification
         * tenant holds no households under this org, so it cannot be profiled locally.
         *
         * The Financials card was only tractable because its Server-Timing named the span that
         * was the cost. This asserts the same instrument exists here, so the next attempt measures
         * instead of guessing.
         */
        expect(ROUTE, "the response publishes Server-Timing").toContain('"server-timing"');
        for (const span of ["auth", "perm", "serialize"]) {
            expect(ROUTE, `${span} is a named boundary`).toContain(`mark("${span}")`);
        }
        /*
         * `cohort` is no longer one mark in the route. Measuring it as a single 645-717 ms label is
         * exactly what let a slice guess wrong about what was inside it, so the route hands the
         * mark to the resolver and the resolver names its phases.
         */
        expect(ROUTE, "the cohort reports its own interior").toMatch(/resolveFinancialSubjectCohort\([\s\S]{0,400}\}, mark\)/);
        const COHORT = readFileSync(join(process.cwd(), "lib/financials/workspace/resolveFinancialSubjects.ts"), "utf8");
        for (const span of ["households", "agreement_sites", "facets", "assemble"]) {
            expect(COHORT, `the cohort names its ${span} phase`).toContain(`phase("${span}")`);
        }
    });

    it("the position route reports where its time goes too", () => {
        /*
         * The pair gates the list together: neither it nor the card that follows can start until
         * both land. Instrumenting one and not the other leaves the decomposition with a hole in
         * exactly the place a 52.9 KB response sits.
         */
        const POSITION = readFileSync(join(process.cwd(), "app/api/admin/financials/position/route.ts"), "utf8");
        expect(POSITION, "the response publishes Server-Timing").toContain('"server-timing"');
        for (const span of ["auth", "perm", "cohort", "serialize"]) {
            expect(POSITION, `${span} is a named boundary`).toContain(`mark("${span}")`);
        }
    });

    it("it publishes completion offsets, not only deltas", () => {
        /* A delta alone misattributes the moment spans overlap; the offsets make that visible. */
        expect(ROUTE).toMatch(/marks\.push\(\[`\$\{name\}_at`/);
    });
});
