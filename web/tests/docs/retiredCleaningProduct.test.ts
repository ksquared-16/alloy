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
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

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
     * The forms are still in the tree. That is deliberate and temporary: they are reached only
     * through a QuoteModal that still serves the live gutters vertical, so deleting them is a
     * marketing-scoped change. This case states the contract that makes leaving them safe — if a
     * form that posts to a deleted endpoint is ever reachable again, the redirect went missing.
     */
    it("any surviving form posting to the deleted API is unreachable by redirect", () => {
        const posters = [
            "web/components/cleaning/CleaningQuickQuoteForm.tsx",
            "web/components/cleaning/SpecialtyCleaningQuoteForm.tsx",
        ].filter((rel) => existsSync(path.join(repoRoot, rel)));
        if (posters.length === 0) return; // deleted in the follow-up: nothing left to contain
        for (const rel of posters) {
            expect(read(rel), `${rel} should still name the deleted endpoint`).toMatch(/book-v2/);
        }
        // Their only entry points are /quote and the campaign landings, all redirected above.
        expect(config()).toContain('"/quote"');
    });
});
