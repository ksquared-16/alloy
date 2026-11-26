/**
 * THE SUBSIDY DOC SAYS WHAT THE CODE SAYS.
 *
 * Subsidy was implemented and undocumented: seven tables, ten production commands, and no mention in the
 * canonical four-layer financial lifecycle. The certification added §0.1 to
 * `financials-canonical-authorities.md`, and these are the claims most expensive to get wrong — because a
 * reader who believes subsidy is a payment, or that an authorization suppresses collection, will
 * mis-state what a family owes.
 *
 * Filesystem-only so it runs in CI with no database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const WEB = join(ROOT, "web");
const DOC = join(ROOT, "docs/platform/modules/financials-canonical-authorities.md");
const COLLECTIBLE = join(WEB, "lib/financials/subsidy/resolveFamilyCollectible.ts");
const ACTIONS = join(WEB, "lib/adminV2/actions/definitions/financialSubsidyActions.ts");

const SUBSIDY_TABLES = [
    "financial_subsidy_programs",
    "financial_subsidy_authorizations",
    "financial_subsidy_claims",
    "financial_subsidy_claim_lines",
    "financial_subsidy_remittances",
    "financial_subsidy_remittance_lines",
    "financial_subsidy_variances",
];

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e === "node_modules" || e.startsWith(".")) continue;
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(full)) out.push(full);
    }
    return out;
}

/** Comments stripped, so a table named in prose is not counted as a writer. */
function codeOnly(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

const doc = readFileSync(DOC, "utf8");

describe("Subsidy certification claims are bound to the implementation", () => {
    it("is not vacuous: the doc section and both source anchors exist", () => {
        expect(doc).toContain("## 0.1 Subsidy");
        expect(readFileSync(COLLECTIBLE, "utf8").length).toBeGreaterThan(500);
        expect(readFileSync(ACTIONS, "utf8").length).toBeGreaterThan(500);
    });

    it("every subsidy command is gated on the single capability the doc names", () => {
        const src = readFileSync(ACTIONS, "utf8");
        expect(src).toMatch(/SUBSIDY_PERMISSION\s*=\s*"fin\.subsidy"/);
        expect(doc).toContain("`fin.subsidy`");
        // One shared permission is the claim; a second key here would make the doc's "every one" false.
        const keys = [...src.matchAll(/"fin\.[a-z_.]+"/g)].map((m) => m[0]);
        expect([...new Set(keys)]).toEqual(['"fin.subsidy"']);
    });

    it("collectibility is DERIVED — no subsidy service writes a stored collectible balance", () => {
        const src = codeOnly(readFileSync(COLLECTIBLE, "utf8"));
        // The resolver must not persist anything: a materialised copy is a second balance.
        expect(
            /\.(insert|update|upsert|delete)\s*\(/.test(src),
            "resolveFamilyCollectible started writing. The certified claim is that suppression is "
                + "recomputed every time and never stored, so it cannot drift and disappears when a claim "
                + "is voided. A stored copy is a second balance wearing a different hat.",
        ).toBe(false);
    });

    it("only a SUBMITTED claim suppresses collection, and the doc says so", () => {
        const src = readFileSync(COLLECTIBLE, "utf8");
        expect(src.toLowerCase()).toContain("submitted");
        expect(doc).toMatch(/An authorization does not suppress collection/);
        expect(doc).toMatch(/only a \*\*SUBMITTED\*\* claim suppresses|Only a \*\*SUBMITTED\*\*/i);
    });

    it("subsidy has exactly three durable writer services, and no others", () => {
        const offenders: string[] = [];
        for (const root of ["lib", "app", "scripts"]) {
            for (const file of walk(join(WEB, root))) {
                const code = codeOnly(readFileSync(file, "utf8"));
                for (const table of SUBSIDY_TABLES) {
                    const re = new RegExp(
                        `from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\s*\\(`,
                    );
                    if (re.test(code)) {
                        const rel = file.slice(WEB.length + 1);
                        if (
                            rel !== "lib/financials/subsidy/subsidyService.ts"
                            && rel !== "lib/financials/subsidy/remittanceService.ts"
                            && rel !== "lib/financials/responsibility/expectedFundingService.ts"
                        ) {
                            offenders.push(`${rel} writes ${table}`);
                        }
                    }
                }
            }
        }
        expect(
            [...new Set(offenders)],
            "a new writer of durable subsidy truth appeared. Subsidy is command-dispatched with three "
                + "writer services; a fourth needs classifying, and if it bypasses the fin.subsidy gate it "
                + "is an authority hole rather than a new feature.",
        ).toEqual([]);
    });

    it("the doc does not describe subsidy as a payment", () => {
        const section = doc.slice(doc.indexOf("## 0.1 Subsidy"), doc.indexOf("## 1. The five identities"));
        expect(section).toMatch(/Subsidy is not a payment/i);
        // It must keep saying what subsidy DOES change, or the distinction is just a denial.
        expect(section).toMatch(/suppress/i);
    });
});
