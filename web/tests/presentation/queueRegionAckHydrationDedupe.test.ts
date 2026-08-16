/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QUEUE REGION — the personal-seen ack must be keyed by its KEYS, not by row identity.
 *
 * The hydration effect depended on `queue.rows`, whose array identity changes on every queue
 * re-resolution even when the rows are identical. The result was a byte-identical
 * `GET /api/admin/queues/stage-membership-ack?keys=...` issued twice — measured on Firefly at
 * two per Work Unit entry on both the All and Waitlist views.
 *
 * After deriving the key string and depending on THAT: All 5 -> 3 requests, Waitlist 4 -> 2,
 * with no identical duplicates and latest-click-wins unchanged.
 */
const src = readFileSync(
    join(__dirname, "..", "..", "components/presentation/workUnit/QueueRegion.tsx"),
    "utf8",
);
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("queue region — ack hydration", () => {
    it("derives the occurrence keys as a value, not an array identity", () => {
        expect(code).toContain("const ackOccurrenceKeys = useMemo(");
    });

    it("the fetch effect depends on the key string, never on queue.rows", () => {
        const idx = code.indexOf("stage-membership-ack");
        expect(idx).toBeGreaterThan(-1);
        const deps = code.slice(idx, code.indexOf("]);", idx) + 3);
        expect(deps).toContain("[ackOccurrenceKeys]");
        expect(deps).not.toContain("queue.rows");
    });

    it("still sends the keys it derived", () => {
        expect(code).toContain("encodeURIComponent(ackOccurrenceKeys)");
    });
});
