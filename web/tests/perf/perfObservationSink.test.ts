/**
 * The sink exists so an INTERRUPTED admitted run is not a lost admitted run, and so nothing
 * identifying reaches the disk on the way. Both are pinned here because both have already gone
 * wrong once in this harness family: a run serialised only at the end reported nothing when it was
 * killed, and an earlier revision persisted operator emails and raw subject ids.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    assertObservationIsAnonymous,
    isAdmitted,
    openObservationSink,
    readObservations,
} from "../../scripts/lib/perfObservationSink.mjs";

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "obs-sink-"));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("durable per-observation collection", () => {
    it("each observation is on disk BEFORE the run ends — an interrupted run keeps its samples", () => {
        const path = join(dir, "run.jsonl");
        const sink = openObservationSink(path, { sha: "7bc3c7dd1", probe: "work-unit" });

        sink.append({ rows_final_ms: 812 });
        sink.append({ rows_final_ms: 903 });

        // Read the file WITHOUT calling close(): this is the interrupted-harness case.
        const persisted = readObservations(path).filter((r) => r.kind === "observation");
        expect(persisted).toHaveLength(2);
        expect(persisted.map((r) => r.rows_final_ms)).toEqual([812, 903]);
        expect(persisted.map((r) => r.seq)).toEqual([0, 1]);
    });

    it("the file names the code identity it was produced against", () => {
        // Pooling across builds is the error the protocol most wants to prevent.
        const path = join(dir, "run.jsonl");
        openObservationSink(path, { sha: "7bc3c7dd1" });
        const meta = readObservations(path).find((r) => r.kind === "run_meta");
        expect(meta.sha).toBe("7bc3c7dd1");
    });

    it("every observation carries the load it was taken under, and whether that was admitted", () => {
        const path = join(dir, "run.jsonl");
        const sink = openObservationSink(path, {});
        sink.append({ rows_final_ms: 800 });
        const obs = readObservations(path).find((r) => r.kind === "observation");
        expect(typeof obs.load_1m).toBe("number");
        expect(typeof obs.load_5m).toBe("number");
        expect(typeof obs.admitted).toBe("boolean");
    });

    it("admission uses the protocol's gate, at both ends of the run", () => {
        expect(isAdmitted({ load_1m: 5.99, load_5m: 7.99 })).toBe(true);
        expect(isAdmitted({ load_1m: 6.0, load_5m: 1.0 })).toBe(false);
        expect(isAdmitted({ load_1m: 1.0, load_5m: 8.0 })).toBe(false);

        const path = join(dir, "run.jsonl");
        const sink = openObservationSink(path, {});
        sink.append({ rows_final_ms: 800 });
        sink.close({ mode: "switch" });
        const end = readObservations(path).find((r) => r.kind === "run_end");
        expect(end.observations).toBe(1);
        expect(typeof end.admitted).toBe("boolean");
    });
});

describe("nothing identifying reaches the disk", () => {
    it("refuses a UUID, wherever it appears", () => {
        const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
        expect(() => assertObservationIsAnonymous({ subjectId: id })).toThrow(/UUID/);
        expect(() => assertObservationIsAnonymous({ rows: [{ id }] })).toThrow(/UUID/);
        expect(() => assertObservationIsAnonymous({ [id]: 1 })).toThrow(/UUID/);
    });

    it("refuses an email address", () => {
        expect(() => assertObservationIsAnonymous({ operator: "kelly@example.com" })).toThrow(/email/);
    });

    it("refuses free text long enough to be a name or an address", () => {
        expect(() => assertObservationIsAnonymous({ label: "x".repeat(65) })).toThrow(/free text/);
    });

    it("admits the timing facts a harness actually produces", () => {
        expect(() =>
            assertObservationIsAnonymous({
                seq: 4,
                row_index: 11,
                admissible: true,
                selected_row_ms: 41,
                cards: { business_process: { truthful_ms: null, blank_frames: 0 } },
                vm_count: 1,
            }),
        ).not.toThrow();
    });

    it("the guard runs on append, so a call site cannot bypass it", () => {
        const sink = openObservationSink(join(dir, "run.jsonl"), {});
        expect(() => sink.append({ subjectId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" })).toThrow(/UUID/);
    });
});
