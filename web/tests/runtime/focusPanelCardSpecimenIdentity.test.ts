/**
 * A CARD SET MUST BE MADE OF CARDS.
 *
 * The deployed performance specimen records an ORDERED CONFIGURED CARD SET so two runs of one code
 * SHA are never compared as equivalent across different published configuration. It was doing that
 * by asking each card for `closest("[data-alloy-section-id]")` — which is the enclosing WORK UNIT
 * SECTION. All seven cards live inside WU-09, so the specimen recorded:
 *
 *     WU-09|WU-09|WU-09|WU-09|WU-09|WU-09|WU-09
 *
 * A value that looks like a card set, has the right cardinality, and is IDENTICAL for every
 * possible configuration. It could not have detected a card being added, removed or reordered,
 * which is the only reason the field exists. Deployed evidence after the fix reads:
 *
 *     business_process|financials|children|household|attendance|health_safety|assignment_tuition
 *
 * `data-universal-card-key` is the product's own per-card identity (UniversalCard,
 * FocusPanelCardRenderer and the card components all emit it), so nothing new was invented.
 *
 * These gates run against the SPEC SOURCE because the selector is the defect: a fixture exercising
 * the extraction would pass with either implementation unless it reproduced the real DOM nesting,
 * so the gates below assert the extraction reads card identity and pin the exact regression.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC = readFileSync(
    join(process.cwd(), "playwright/tests/zz-p076-visible-critical-path.spec.ts"),
    "utf8",
);
/** Comments stripped, so a negative assertion reads code rather than the prose explaining it. */
const CODE = SPEC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The `configIdentity` probe body — bounded forward from its own declaration. */
const IDENTITY = (() => {
    const start = CODE.indexOf("const configIdentity");
    expect(start).toBeGreaterThan(-1);
    const end = CODE.indexOf("const dataProbe", start);
    return CODE.slice(start, end > start ? end : undefined);
})();

describe("the ordered card set records card identity", () => {
    it("reads the product's canonical per-card key", () => {
        expect(IDENTITY).toContain("data-universal-card-key");
    });

    it("does NOT identify a card by its enclosing work-unit section", () => {
        // The exact regression: `closest("[data-alloy-section-id]")` inside the card mapping.
        expect(IDENTITY).not.toMatch(/closest\(\s*["'`]\[data-alloy-section-id\]/);
        expect(IDENTITY).not.toContain("data-alloy-section-name");
    });

    it("still collects one entry per rendered card, in document order", () => {
        expect(IDENTITY).toContain("article.alloy-os-ucard");
        expect(IDENTITY).toContain("configuredCardSet");
    });

    it("invents no new DOM identity — the attribute is one the product already emits", () => {
        const renderer = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/FocusPanelCardRenderer.tsx"),
            "utf8",
        );
        const universal = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/UniversalCard.tsx"),
            "utf8",
        );
        expect(renderer).toContain("data-universal-card-key");
        expect(universal).toContain("data-universal-card-key");
    });
});

describe("the captured tail covers the section under investigation", () => {
    const PROBE = readFileSync(join(process.cwd(), "playwright/support/visibleCompletionProbe.ts"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    it("opens the mutation window before WU-09's first authoritative paint", () => {
        // WU-09 first paints ~2,092-3,825ms measured. A window opening at 4,000ms missed the
        // first ~1.5s of the very tail being attributed.
        const m = PROBE.match(/if \(t > (\d+)\) \{/);
        expect(m).not.toBeNull();
        expect(Number(m![1])).toBeLessThanOrEqual(2000);
    });

    it("holds enough records that the ring does not discard the tail", () => {
        const m = PROBE.match(/__p076late as unknown\[\]\)\.length >= (\d+)/);
        expect(m).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThanOrEqual(1000);
    });
});
