/** @vitest-environment jsdom */
/**
 * WU-07 — the Work count must not render UNKNOWN as ZERO, and one response must commit once.
 *
 * Two proven defects, repaired together because they share the same state:
 *
 *   (a) `work` and `loading` were separate `useState`s set on either side of an await, so ONE
 *       response produced TWO renders ~1ms apart. Measured on deployed staging, the Work chip was
 *       appended twice — same parent id, same added node id, adjacent observer batches — and the
 *       metric scored the second as a post-complete authoritative structure change.
 *   (b) `work` initialised to 0, so "not yet known" and "authoritatively no work" were the same
 *       value. The chip is absent in both cases and the operator cannot tell them apart. This
 *       file's own header says the two must never look alike; its initial state said otherwise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const HOOK = codeOf(read("lib/adminV2/runtime/focusPanel/useRecordAttentionCounts.ts"));
const CHIPS = codeOf(read("lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels.ts"));

describe("(b) unknown is not zero", () => {
    it("the work count is nullable, and null means not yet known", () => {
        /*
         * Scoped to the EXPORTED TYPE. An unanchored match was satisfied by the `useState<{ work:
         * number | null }>` generic further down, so reverting the public type to `number` left
         * this gate green — the plant proved it.
         */
        const typeBlock = HOOK.slice(
            HOOK.indexOf("export type RecordAttentionCounts"),
            HOOK.indexOf("const EMPTY"),
        );
        expect(typeBlock.length).toBeGreaterThan(0);
        expect(typeBlock).toMatch(/work:\s*number\s*\|\s*null;/);
    });

    it("the initial state is unknown, not zero", () => {
        const init = HOOK.slice(HOOK.indexOf("useState<{ work: number | null; loading: boolean }>"), HOOK.indexOf("const { work, loading }"));
        expect(init).toContain("work: null");
        expect(init).not.toMatch(/work:\s*0/);
    });

    it("the empty (no record) value claims nothing", () => {
        expect(HOOK).toMatch(/const EMPTY: RecordAttentionCounts = \{ work: null/);
    });

    it("a failed or refused read keeps the last known value and never reports zero", () => {
        // Anchored FORWARD: `useEffect` also appears in the import line, so an unanchored indexOf
        // slices backwards and the assertions run against an empty string.
        const start = HOOK.indexOf("const loadWork");
        const load = HOOK.slice(start, HOOK.indexOf("useEffect(", start));
        expect(load).toContain("work: prev.work");
        /*
         * The only place a number is written is the listing decision, and that decision answers
         * null for anything that did not answer. The load used to count `json.tasks` directly,
         * which was truthful for a non-OK response but NOT for a successful one whose body carried
         * no array — `readJson` returns {} on a parse failure, so that path produced a confident
         * zero from a read that failed. The guard is now the thing this asserts.
         */
        expect(load).toMatch(/openWorkCountFromListing\(res\.ok, json\)/);
        expect(load).toMatch(/counted === null/);
        expect(load).not.toMatch(/work: countOpenWork\(/);
        expect(load).not.toMatch(/work:\s*0/);
    });
});

describe("(a) one response commits once", () => {
    it("work and loading live in ONE state cell", () => {
        expect(HOOK).toContain("useState<{ work: number | null; loading: boolean }>");
        // The separate cells that produced the second render are gone.
        expect(HOOK).not.toMatch(/const \[work, setWork\]/);
        expect(HOOK).not.toMatch(/const \[loading, setLoading\]/);
    });

    it("the load does not re-commit loading after the await", () => {
        // `.finally(() => setLoading(false))` across the await WAS the second render.
        expect(HOOK).not.toMatch(/\.finally\(\(\) => setLoading\(false\)\)/);
        expect(HOOK).not.toContain("setLoading(");
    });

    it("the authoritative response writes work and loading together", () => {
        expect(HOOK).toMatch(/setState\(\{ work: counted, loading: false \}\)/);
    });
});

describe("the chip contract still treats zero as absence, and unknown as absence too", () => {
    it("a chip exists only for a positive count", () => {
        // `work > 0` — so null (unknown) and 0 both yield no chip, which is correct: an unknown
        // count must not render a number, and an authoritative zero is the absence of a chip.
        expect(CHIPS).toMatch(/const work = typeof counts\.work === "number" && counts\.work > 0 \? counts\.work : 0;/);
        expect(CHIPS).toMatch(/if \(work > 0\) chips\.push/);
    });
});
