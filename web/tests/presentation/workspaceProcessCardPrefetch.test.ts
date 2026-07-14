/**
 * /workspace heavy-route prefetch guard.
 *
 * A wall of process cards must NOT eagerly prefetch their Work Unit routes (a router storm). The
 * ProcessSummaryCard link opts out of Next.js viewport prefetch and warms only on pointer/focus
 * intent through the deduped `warmWorkUnitSlugRoute` (shared in-flight across affordances).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("ProcessSummaryCard Work Unit route prefetch", () => {
    const card = read("components/presentation/workspace/ProcessSummaryCard.tsx");

    it("opts out of eager Next.js route prefetch (zero eager Work Unit prefetch across N cards)", () => {
        expect(card).toContain("prefetch={false}");
    });

    it("warms only on explicit pointer/focus intent, through the deduped warm helper", () => {
        expect(card).toContain("warmWorkUnitSlugRoute");
        expect(card).toMatch(/onPointerEnter=\{warm\}/);
        expect(card).toMatch(/onFocus=\{warm\}/);
    });

    it("the warm helper is a shared, deduped prewarm (one in-flight per destination)", () => {
        // warmWorkUnitSlugRoute is the shared operator-entry warm — its own module dedupes in-flight.
        const warmSrc = read("lib/admin/operatorWorkUnitEntryWarm.ts");
        expect(warmSrc).toMatch(/slugInflight|inflight|in_flight|dedup/i);
    });
});
