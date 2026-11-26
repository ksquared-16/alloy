/**
 * D10-A2 race program — logic proof over a SIMULATED database. This is not the race proof: that needs real Postgres
 * sessions on an isolated certenv (Host Capacity fixture `processing_atomic_open_race`). What this shows is that the
 * program releases callers together, judges each round correctly, and FAILS on the legacy non-atomic sequence that
 * leaves an orphan case — i.e. it can detect the defect it exists to rule out.
 */
import { describe, expect, it } from "vitest";

import {
    RACE_NAMESPACE,
    RACE_PLAN,
    RACE_PROGRAMS,
    judgeRound,
    raceLockKey,
    raceSourceId,
    resetRace,
    runProcessingAtomicOpenRace,
    runRace,
} from "../../scripts/qa/processingAtomicOpenRace.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const tick = () => new Promise((r) => setImmediate(r));

/** A tiny database: cases, primary sources with the unique (org, kind, source) rule, advisory gate locks. */
function simDb(mode: "atomic" | "legacy") {
    const cases: { id: string; created_at: number }[] = [];
    const sources: { case_id: string; source_id: string }[] = [];
    const gates = new Map<string, Promise<void>>();
    let n = 0;
    const newId = () => `c0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const find = (src: string) => sources.find((s) => s.source_id === src)?.case_id ?? null;

    async function open(src: string): Promise<{ id: string; created: boolean }> {
        const hit = find(src);
        if (hit) return { id: hit, created: false };
        await tick();
        const id = newId();
        cases.push({ id, created_at: Date.now() });
        await tick();
        if (find(src)) {
            // unique violation on the primary source
            if (mode === "atomic") {
                cases.splice(cases.findIndex((c) => c.id === id), 1); // the savepoint undoes the case
                return { id: find(src)!, created: false };
            }
            throw new Error("23505"); // legacy: the case stays behind — an orphan
        }
        sources.push({ case_id: id, source_id: src });
        return { id, created: true };
    }

    const session = async (text: string): Promise<string> => {
        const key = /pg_advisory_lock(?:_shared)?\((\d+)\)/.exec(text)?.[1];
        if (text.includes("pg_sleep")) {
            let release!: () => void;
            gates.set(key!, new Promise<void>((r) => { release = r; }));
            await new Promise((r) => setTimeout(r, 5));
            release();
            return "";
        }
        if (text.includes("open_processing_case_with_primary_source")) {
            await gates.get(key!);
            const src = /'upload', '([0-9a-f-]{36})'/.exec(text)![1];
            const r = await open(src);
            return `RESULT|${r.id}|${r.created}`;
        }
        if (text.includes("'CHECK|'")) {
            const src = /source_id = '([0-9a-f-]{36})'/.exec(text)![1];
            const prim = sources.filter((s) => s.source_id === src);
            const orphans = cases.filter((c) => !sources.some((s) => s.case_id === c.id)).length;
            return `CHECK|${prim.length}|${new Set(prim.map((p) => p.case_id)).size}|${orphans}`;
        }
        if (text.includes("'RESET|'")) {
            const ids = [...text.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((m) => m[1]).filter((x) => x !== ORG);
            const gone = sources.filter((s) => ids.includes(s.source_id));
            for (const g of gone) { sources.splice(sources.indexOf(g), 1); cases.splice(cases.findIndex((c) => c.id === g.case_id), 1); }
            return `RESET|${gone.length}|${gone.length}`;
        }
        throw new Error(`unexpected sql: ${text.slice(0, 40)}`);
    };
    return { session, cases, sources };
}

const fast = { gateHoldMs: 5, stagger: () => tick() };

describe("race program over a simulated database", () => {
    it("the atomic function passes every round: one case, one source, one creator, same id, no orphan", async () => {
        const db = simDb("atomic");
        const r = await runRace({ org: ORG, qaRunId: "qar_test1", session: db.session, ...fast });
        expect(r).toEqual({ passed: RACE_PLAN.length, failed: 0, failures: [] });
        expect(db.cases).toHaveLength(RACE_PLAN.length);
    });

    it("the legacy non-atomic sequence FAILS: orphan cases and caller errors are detected", async () => {
        const db = simDb("legacy");
        const r = await runRace({ org: ORG, qaRunId: "qar_test2", session: db.session, ...fast });
        expect(r.failed).toBeGreaterThan(0);
        const kinds = new Set(r.failures.flatMap((f: { failures: string[] }) => f.failures));
        expect(kinds.has("orphan_case")).toBe(true);
        expect(kinds.has("caller_failed")).toBe(true);
    });

    it("reset removes exactly what run wrote, by derived source ids", async () => {
        const db = simDb("atomic");
        await runRace({ org: ORG, qaRunId: "qar_test3", session: db.session, ...fast });
        const r = await resetRace({ org: ORG, qaRunId: "qar_test3", session: db.session });
        expect(r).toEqual({ ok: true, removed: RACE_PLAN.length * 2 });
        expect(db.cases).toHaveLength(0);
        expect(db.sources).toHaveLength(0);
    });

    it("judges a round strictly", () => {
        const a = { caseId: "c1".padEnd(36, "0"), created: true };
        const b = { caseId: "c1".padEnd(36, "0"), created: false };
        expect(judgeRound([a, b], { primarySources: 1, cases: 1, orphans: 0 })).toEqual([]);
        expect(judgeRound([a, { ...b, caseId: "c2".padEnd(36, "0") }], { primarySources: 1, cases: 1, orphans: 0 })).toContain("different_case_ids");
        expect(judgeRound([a, a], { primarySources: 1, cases: 1, orphans: 0 })).toContain("created_count");
        expect(judgeRound([a, b], { primarySources: 1, cases: 1, orphans: 1 })).toContain("orphan_case");
        expect(judgeRound([a, b], null)).toContain("check_failed");
    });

    it("source ids and lock keys are deterministic per run and round, and distinct", () => {
        expect(raceSourceId("qar_x", 0)).toBe(raceSourceId("qar_x", 0));
        expect(new Set(RACE_PLAN.map((_, i) => raceSourceId("qar_x", i))).size).toBe(RACE_PLAN.length);
        expect(raceSourceId("qar_x", 0)).not.toBe(raceSourceId("qar_y", 0));
        expect(/^[1-9][0-9]*$/.test(raceLockKey("qar_x", 0))).toBe(true);
        expect(RACE_PLAN.filter((n) => n === 2)).toHaveLength(20);
        expect(RACE_PLAN.filter((n) => n === 5)).toHaveLength(5);
    });
});

describe("authority before any connection", () => {
    it("a manual run (no executor authority) is refused before a client or session exists", async () => {
        let sessions = 0;
        const r = await runProcessingAtomicOpenRace("run", {
            env: { DATABASE_URL: "postgresql://postgres@127.0.0.1:54422/postgres" } as unknown as NodeJS.ProcessEnv,
            resolveClient: () => { throw new Error("must not resolve a client"); },
            makeSession: () => { sessions += 1; return async () => ""; },
        });
        expect(r.ok).toBe(false);
        expect(sessions).toBe(0);
    });

    it("unknown operations are refused; the registry bindings name the npm scripts in package.json", async () => {
        expect(await runProcessingAtomicOpenRace("drop")).toEqual({ ok: false, code: "operation_unregistered" });
        const fs = await import("node:fs");
        const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
        for (const p of Object.values(RACE_PROGRAMS)) expect(pkg.scripts[p.npm_script]).toBe(p.script_body);
        expect(RACE_NAMESPACE).toBe("processing-atomic-open-race");
    });
});
