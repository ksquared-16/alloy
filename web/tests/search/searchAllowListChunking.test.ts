import { describe, expect, it } from "vitest";

import {
    SEARCH_ALLOW_LIST_CHUNK_SIZE,
    chunkSearchAllowList,
    applySearchAllowList,
} from "@/lib/search/searchAccessEnvelope";

/**
 * Regression cover for a defect only the browser could find: a restricted
 * operator on a realistic tenant (~1200 customers) produced a PostgREST URI over
 * the server limit, so search answered "URI too long" and rendered nothing —
 * which silently made the permission-absence assertion pass vacuously.
 */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("allow-list chunking", () => {
    it("unrestricted yields exactly one unconstrained query", () => {
        expect(chunkSearchAllowList(null)).toEqual([null]);
    });

    it("an EMPTY allow-list still constrains — it must not widen to the whole org", () => {
        const chunks = chunkSearchAllowList([]);
        expect(chunks).toEqual([[]]);
        const captured: unknown[] = [];
        const fake = { in: (_c: string, v: unknown[]) => (captured.push(v), fake) };
        applySearchAllowList(fake, "id", chunks[0]);
        // A sentinel that cannot match, NOT an unconstrained query.
        expect(captured[0]).toEqual(["00000000-0000-0000-0000-000000000000"]);
    });

    it("splits a large allow-list into bounded chunks, losing no ids", () => {
        const ids = Array.from({ length: 1203 }, (_, i) => uuid(i));
        const chunks = chunkSearchAllowList(ids);
        expect(chunks.length).toBe(Math.ceil(1203 / SEARCH_ALLOW_LIST_CHUNK_SIZE));
        for (const c of chunks) expect((c as string[]).length).toBeLessThanOrEqual(SEARCH_ALLOW_LIST_CHUNK_SIZE);
        expect(chunks.flat()).toEqual(ids);
    });

    it("keeps each chunk's serialized length well under a typical URI limit", () => {
        const ids = Array.from({ length: 5000 }, (_, i) => uuid(i));
        for (const chunk of chunkSearchAllowList(ids)) {
            // PostgREST renders `.in()` into the query string.
            const serialized = encodeURIComponent((chunk as string[]).join(","));
            expect(serialized.length).toBeLessThan(8000);
        }
    });

    it("a single unchunked 1200-id list WOULD exceed it — proving the bound is real", () => {
        const ids = Array.from({ length: 1203 }, (_, i) => uuid(i));
        expect(encodeURIComponent(ids.join(",")).length).toBeGreaterThan(8000);
    });
});
