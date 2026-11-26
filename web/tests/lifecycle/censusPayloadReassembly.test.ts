/**
 * A TRUNCATED PAYLOAD IS THE DANGEROUS CASE, not a missing one.
 *
 * The deployed Business Process payload comes back in chunks because the trusted host parses one
 * line per row and the payload is a single long jsonb value. A missing chunk announces itself — the
 * JSON will not parse. But a payload short by one chunk at either END can still parse, still
 * validate, and still produce a confident Law 4 checksum over configuration the tenant does not
 * have. That revision would then be published as the tenant's truth.
 *
 * So the reconstruction is checked against what the DATABASE declared — `payload_length` and
 * `chunk_total` computed in the same query that produced the chunks — rather than against itself.
 * Every one of these tests is a way the payload could come back wrong while still looking usable.
 */

import { describe, expect, it } from "vitest";

import { reassembleCensusPayload } from "@/lib/businessProcesses/configuration/reassembleCensusPayload";

const DEPT = "dept-1";
const REV = "rev-1";

/** Build a census result in the trusted host's own labeled-question shape. */
function census(payloadText: string, opts: {
    chunkSize?: number;
    declaredLength?: number;
    declaredTotal?: number;
    drop?: number[];
    duplicate?: number[];
    reindex?: (i: number) => number;
} = {}) {
    const size = opts.chunkSize ?? 10;
    const chunks: { department_id: string; revision_id: string; i: number; text: string }[] = [];
    for (let i = 1; i * size - size < payloadText.length; i += 1) {
        chunks.push({
            department_id: DEPT,
            revision_id: REV,
            i: opts.reindex ? opts.reindex(i) : i,
            text: payloadText.slice((i - 1) * size, i * size),
        });
    }
    const total = chunks.length;
    let rows = chunks.filter((c) => !(opts.drop ?? []).includes(c.i));
    for (const dupe of opts.duplicate ?? []) {
        const found = chunks.find((c) => c.i === dupe);
        if (found) rows = [...rows, { ...found }];
    }
    return {
        results: {
            questions: {
                revision_identity: {
                    rows: [{
                        department_id: DEPT,
                        revision_id: REV,
                        revision_number: 12,
                        payload_checksum: "deadbeef",
                        payload_length: opts.declaredLength ?? payloadText.length,
                        chunk_total: opts.declaredTotal ?? total,
                    }],
                },
                payload_chunk: { rows },
            },
        },
    };
}

const REAL = JSON.stringify({ version: 1, processes: [{ key: "enrollment", stages: [{ key: "enrolling" }] }] });

describe("a complete reconstruction is accepted", () => {
    it("rebuilds the exact payload and reports what the database declared", () => {
        const result = reassembleCensusPayload(census(REAL));
        expect(result.failures).toEqual([]);
        expect(result.revisions).toHaveLength(1);
        const [revision] = result.revisions;
        expect(JSON.stringify(revision!.payload)).toBe(REAL);
        expect(revision!.payload_length).toBe(REAL.length);
        expect(revision!.revision_id).toBe(REV);
        expect(revision!.payload_checksum).toBe("deadbeef");
    });

    it("handles a payload that is not an exact multiple of the chunk size", () => {
        // The last chunk is short. An off-by-one here would drop the closing braces.
        const result = reassembleCensusPayload(census(REAL, { chunkSize: 7 }));
        expect(result.failures).toEqual([]);
        expect(JSON.stringify(result.revisions[0]!.payload)).toBe(REAL);
    });
});

describe("every way the payload could arrive incomplete is refused", () => {
    it("REFUSES a missing chunk, and names which", () => {
        const result = reassembleCensusPayload(census(REAL, { drop: [2] }));
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("missing chunk indexes 2");
    });

    it("REFUSES a repeated chunk rather than picking one", () => {
        /*
         * A duplicate is not harmless: taking either copy silently assumes they are identical, and
         * if the query ever emitted overlapping ranges the payload would be wrong in a way nothing
         * downstream could detect.
         */
        const result = reassembleCensusPayload(census(REAL, { duplicate: [1] }));
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("returned more than once: 1");
    });

    it("REFUSES a length that disagrees with what the database declared", () => {
        // THE TRUNCATION CASE. This payload parses as JSON perfectly well.
        const short = census(REAL, { declaredLength: REAL.length + 40 });
        const result = reassembleCensusPayload(short);
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("declared");
    });

    it("REFUSES 0-based indexes, so a base disagreement cannot silently drop a chunk", () => {
        /*
         * The artifact emits generate_series(1, chunk_total). If it were ever changed to 0-based
         * without this reader, index 0 would fall outside the expected range and the last chunk
         * would be reported missing — but the payload would already be short by one at the front.
         */
        const result = reassembleCensusPayload(census(REAL, { reindex: (i) => i - 1 }));
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toMatch(/missing chunk indexes|outside 1\.\./);
    });

    it("REFUSES chunks that do not reassemble into JSON", () => {
        const result = reassembleCensusPayload(census("{not json at all"));
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("not valid JSON");
    });

    it("REFUSES a JSON value that is not an object", () => {
        const result = reassembleCensusPayload(census(JSON.stringify([1, 2, 3])));
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("not a JSON object");
    });

    it("REFUSES a census that returned no identity row, rather than inferring one", () => {
        const result = reassembleCensusPayload({ results: { questions: { payload_chunk: { rows: [] } } } });
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("no revision_identity row");
    });

    it("REFUSES a nonsensical chunk_total instead of reading zero chunks as success", () => {
        const result = reassembleCensusPayload(census(REAL, { declaredTotal: 0 }));
        expect(result.revisions).toEqual([]);
        expect(result.failures[0]!.reason).toContain("chunk_total is 0");
    });
});

describe("several departments do not contaminate each other", () => {
    it("keeps each revision's chunks to itself", () => {
        /*
         * The org can have more than one department with its own published revision. Chunks are
         * matched on department AND revision, so one department's payload can never be assembled
         * out of another's bytes — which would parse, and would be entirely wrong.
         */
        const a = census(REAL);
        const other = JSON.stringify({ version: 1, processes: [] });
        const b = {
            department_id: "dept-2",
            revision_id: "rev-2",
            revision_number: 3,
            payload_checksum: "cafe",
            payload_length: other.length,
            chunk_total: 1,
        };
        const merged = {
            results: {
                questions: {
                    revision_identity: { rows: [...a.results.questions.revision_identity.rows, b] },
                    payload_chunk: {
                        rows: [
                            ...a.results.questions.payload_chunk.rows,
                            { department_id: "dept-2", revision_id: "rev-2", i: 1, text: other },
                        ],
                    },
                },
            },
        };
        const result = reassembleCensusPayload(merged);
        expect(result.failures).toEqual([]);
        expect(result.revisions).toHaveLength(2);
        expect(JSON.stringify(result.revisions.find((r) => r.department_id === DEPT)!.payload)).toBe(REAL);
        expect(JSON.stringify(result.revisions.find((r) => r.department_id === "dept-2")!.payload)).toBe(other);
    });

    it("reports one department's failure without discarding the other's good payload", () => {
        const a = census(REAL);
        const merged = {
            results: {
                questions: {
                    revision_identity: {
                        rows: [
                            ...a.results.questions.revision_identity.rows,
                            { department_id: "dept-2", revision_id: "rev-2", revision_number: 3, payload_checksum: "x", payload_length: 50, chunk_total: 2 },
                        ],
                    },
                    payload_chunk: { rows: a.results.questions.payload_chunk.rows },
                },
            },
        };
        const result = reassembleCensusPayload(merged);
        expect(result.revisions).toHaveLength(1);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]!.department_id).toBe("dept-2");
    });
});

describe("stale chunks from an earlier revision cannot contaminate the current one", () => {
    /*
     * THIS IS NOT HYPOTHETICAL. The trusted host MERGES into an existing evidence file: it reads
     * the prior `.results.json` and combines it with the new result. So a second census of the same
     * department, after a republish, can leave the previous revision's chunks sitting beside the
     * current ones under the same department id.
     *
     * Matching on department alone would then splice two revisions' bytes together. The result
     * would very likely still parse — both are valid JSON of the same shape — and would produce a
     * checksum for configuration that never existed.
     */
    const CURRENT = JSON.stringify({ version: 1, processes: [{ key: "enrollment", stages: [{ key: "enrolling" }] }] });
    const STALE = JSON.stringify({ version: 1, processes: [{ key: "enrollment", stages: [{ key: "enrollment" }] }] });

    function twoRevisionsOfOneDepartment() {
        return {
            results: {
                questions: {
                    revision_identity: {
                        rows: [{
                            department_id: DEPT,
                            revision_id: "rev-current",
                            revision_number: 13,
                            payload_checksum: "current",
                            payload_length: CURRENT.length,
                            chunk_total: 1,
                        }],
                    },
                    payload_chunk: {
                        rows: [
                            // Stale first, so a reader that takes "the chunks for this department"
                            // in arrival order picks up the wrong revision's bytes at index 1.
                            { department_id: DEPT, revision_id: "rev-stale", i: 1, text: STALE },
                            { department_id: DEPT, revision_id: "rev-current", i: 1, text: CURRENT },
                        ],
                    },
                },
            },
        };
    }

    it("assembles the CURRENT revision, not the stale one that shares its department", () => {
        const result = reassembleCensusPayload(twoRevisionsOfOneDepartment());
        expect(result.failures).toEqual([]);
        expect(result.revisions).toHaveLength(1);
        expect(JSON.stringify(result.revisions[0]!.payload)).toBe(CURRENT);
        // The stale payload names the ghost `enrollment` stage; the current one does not.
        expect(JSON.stringify(result.revisions[0]!.payload)).not.toContain('"enrollment"}');
    });

    it("does not see the two revisions' chunks as a duplicate index and refuse outright", () => {
        // Both carry index 1. Scoped correctly, that is not a duplicate — it is two revisions.
        const result = reassembleCensusPayload(twoRevisionsOfOneDepartment());
        expect(result.failures.map((f) => f.reason).join()).not.toContain("more than once");
    });
});
