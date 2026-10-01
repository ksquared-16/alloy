/**
 * The legacy public home-cleaning product stays retired.
 *
 * `ea3eaf377` (2026-07-31) retired the cleaning product and deleted its API — including
 * `/api/book-v2/quote-start` and `/api/book-v2/specialty-quote-start` — but left the public pages
 * that post to them mounted. This pins the two things that must stay true while the dead components
 * await a marketing-scoped deletion: nothing advertises the product, and nothing serves it.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

/**
 * Source with comments stripped.
 *
 * Three guards in this programme have now been fooled by their own explanatory prose — a comment that
 * NAMES the thing it says was removed reads identically to the thing itself. Asserting on code means
 * removing the commentary first, rather than writing ever-cleverer regexes around it.
 */
function codeOnly(rel: string): string {
    return read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
}

describe("the deleted cleaning API is not recreated", () => {
    it("has no /api/book-v2 route tree", () => {
        // The retirement deleted this deliberately. Restoring it would un-retire the product.
        expect(existsSync(path.join(repoRoot, "web/app/api/book-v2"))).toBe(false);
    });
});

describe("nothing advertises the retired product", () => {
    for (const [label, rel] of [
        ["navbar", "web/components/Navbar.tsx"],
        ["footer", "web/components/Footer.tsx"],
        ["service catalog", "web/lib/services.ts"],
    ] as const) {
        it(`${label} carries no Home Cleaning entry`, () => {
            expect(read(rel)).not.toMatch(/services\/cleaning/);
        });
    }
});

describe("nothing serves the retired product", () => {
    const config = () => read("web/next.config.ts");

    it("redirects the retired cleaning routes", () => {
        const t = config();
        for (const source of ['"/services/cleaning"', '"/services/cleaning/:path*"']) {
            expect(t, `missing redirect for ${source}`).toContain(source);
        }
    });

    it("redirects the cleaning quote chooser and its campaign landings", () => {
        const t = config();
        for (const source of ['"/quote"', '"/offers/firstfree4x120"', '"/offers/firstfree4x60"']) {
            expect(t, `missing redirect for ${source}`).toContain(source);
        }
    });

    /*
     * Phase 2 removed the surfaces rather than only unreaching them. Phase 1's containment case —
     * "a surviving form must stay unreachable behind a redirect" — is replaced by the stronger fact:
     * there are no surviving cleaning surfaces to contain.
     */
    it("the cleaning-only surfaces are gone, not merely unreachable", () => {
        for (const rel of [
            "web/app/services/cleaning",
            "web/components/cleaning",
            "web/app/quote",
            "web/app/offers",
            "web/components/offers",
            "web/lib/campaigns",
        ]) {
            expect(existsSync(path.join(repoRoot, rel)), `${rel} should be removed`).toBe(false);
        }
    });

    it("no mounted code fetches a deleted /api/book-v2 endpoint", () => {
        const offenders: string[] = [];
        const scan = (rel: string) => {
            const abs = path.join(repoRoot, rel);
            if (!existsSync(abs)) return;
            for (const entry of readdirSync(abs)) {
                const child = `${rel}/${entry}`;
                if (statSync(path.join(repoRoot, child)).isDirectory()) scan(child);
                else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
                    if (/["'`]\/api\/book-v2/.test(read(child))) offenders.push(child);
                }
            }
        };
        scan("web/app");
        scan("web/components");
        expect(offenders).toEqual([]);
    });

    it("the live gutters quote path is intact", () => {
        // The half that works, and the reason the shared modal was refactored rather than deleted.
        expect(read("web/components/gutters/GutterLeadForm.tsx")).toMatch(/\/api\/leads\/gutters/);
        expect(existsSync(path.join(repoRoot, "web/app/api/leads/gutters/route.ts"))).toBe(true);
        expect(read("web/components/QuoteModal.tsx")).toMatch(/GutterLeadForm/);
    });

    it("the quote modal carries no cleaning or campaign logic", () => {
        /*
         * Asserted against CODE, not the word. Both files explain in prose why the cleaning vertical
         * is gone, and a bare /cleaning/ match flagged that explanation — the third time a guard in
         * this programme has been fooled by its own comment. So: no import of a cleaning component,
         * and no "cleaning" used as a VALUE (a quoted literal or a type member).
         */
        const modal = codeOnly("web/components/QuoteModal.tsx");
        expect(modal).not.toMatch(/from "@\/components\/cleaning/);
        expect(modal).not.toMatch(/["']cleaning["']/);
        expect(modal).not.toMatch(/campaignQuoteFlow|CleaningQuickQuoteForm/);

        const provider = codeOnly("web/lib/quoteModal.tsx");
        expect(provider).not.toMatch(/["']cleaning["']/);
        expect(provider).not.toMatch(/CampaignQuoteFlowId|campaignQuoteFlow/);
    });

    it("internal quote and pricing substrate is preserved", () => {
        // The July retirement kept these deliberately; Alloy still uses them.
        for (const rel of ["web/lib/book-v2", "web/lib/pricing", "web/lib/quoteIntake"]) {
            expect(existsSync(path.join(repoRoot, rel)), `${rel} must be preserved`).toBe(true);
        }
    });
});
