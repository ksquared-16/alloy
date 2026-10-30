/**
 * Processing — opening a case and its primary source atomically (no orphan case on a lost race).
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *   - The OPENER's logic and the PORT contract: with an atomic port it never issues the separate inserts; without one it
 *     keeps today's behaviour; the Supabase port calls the function with the right arguments, falls back ONLY when the
 *     function is missing, and surfaces every other error.
 *   - Under interleavings modelled by an in-memory transactional port (staged writes, a unique primary-source index,
 *     commit or roll back as one unit), concurrent opens and mid-transaction failures leave exactly one case and one
 *     source — and the legacy three-call sequence, under the SAME interleaving, leaves an orphan (the defect).
 *   - The migration's SQL has the shape the repair depends on (both inserts in one exception block, winner re-read,
 *     re-raise otherwise, client execute revoked).
 * NOT PROVEN HERE: that Postgres executes `open_processing_case_with_primary_source` atomically under real concurrent
 * sessions. That needs the migration applied to an isolated database and a two-session race
 * (certification/invariants/processing-open-case-atomic.sql covers the single-session half). Awaiting DB proof.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    AtomicProcessingOpenUnavailableError,
    openProcessingCaseFromSource,
} from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import { openNonFormProcessingCaseFromSource } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe";
import { isMissingFunctionError, makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";

const ROOT = resolve(__dirname, "../../..");
const ORG = "0a000000-0000-4000-8000-0000000000f1";
const OTHER = "0b000000-0000-4000-8000-0000000000f1";
const SRC = "d0000000-0000-4000-8000-0000000000f1";

type Case = { id: string; orgId: string };
type Source = { orgId: string; processingCaseId: string; sourceKind: string; sourceId: string; role: string };

/** A tiny database: committed tables, the unique primary-source index, and transactions that commit or roll back whole. */
function memoryDb() {
    const cases: Case[] = [];
    const sources: Source[] = [];
    let seq = 0;
    const primary = (s: Pick<Source, "orgId" | "sourceKind" | "sourceId">) =>
        sources.find((x) => x.orgId === s.orgId && x.sourceKind === s.sourceKind && x.sourceId === s.sourceId && x.role === "primary");
    const unique = () => Object.assign(new Error("duplicate key value violates unique constraint \"uq_pcs_primary_source_once\""), { code: "23505" });
    return {
        cases,
        sources,
        nextId: () => `ca5e0000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
        primary,
        /** Commit staged writes as one unit; the unique index is checked at commit. Throws (and writes nothing) on conflict. */
        commit(staged: { cases: Case[]; sources: Source[] }) {
            for (const s of staged.sources) if (s.role === "primary" && primary(s)) throw unique();
            cases.push(...staged.cases);
            sources.push(...staged.sources);
        },
        insertCaseNow(c: Case) {
            cases.push(c);
        },
        insertSourceNow(s: Source) {
            if (s.role === "primary" && primary(s)) throw unique();
            sources.push(s);
        },
    };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** The atomic port, modelled after the SQL function: find; else stage case + source in one savepoint; commit; on conflict roll back the savepoint and return the winner. */
function atomicPort(db: ReturnType<typeof memoryDb>, opts: { failSourceInsert?: boolean; beforeCommit?: () => Promise<void> } = {}): ProcessingCaseDeps {
    return {
        async openCaseWithPrimarySource({ orgId, sourceKind, sourceId }) {
            const hit = db.primary({ orgId, sourceKind, sourceId });
            if (hit) return { processingCaseId: hit.processingCaseId, created: false };
            await tick(); // a concurrent caller can run here — both may miss the find
            const id = db.nextId();
            const staged = { cases: [{ id, orgId }], sources: [] as Source[] };
            if (opts.failSourceInsert) throw new Error("check constraint violated"); // nothing staged is committed
            staged.sources.push({ orgId, processingCaseId: id, sourceKind, sourceId, role: "primary" });
            if (opts.beforeCommit) await opts.beforeCommit();
            try {
                db.commit(staged);
                return { processingCaseId: id, created: true };
            } catch (e) {
                const winner = db.primary({ orgId, sourceKind, sourceId });
                if (!winner) throw e;
                return { processingCaseId: winner.processingCaseId, created: false };
            }
        },
        async findCaseIdByPrimarySource() { throw new Error("legacy path must not run when the atomic port exists"); },
        async insertCase() { throw new Error("legacy path must not run when the atomic port exists"); },
        async insertSource() { throw new Error("legacy path must not run when the atomic port exists"); },
    };
}

/** Today's three separate calls, each committed on its own. */
function legacyPort(db: ReturnType<typeof memoryDb>): ProcessingCaseDeps {
    return {
        async findCaseIdByPrimarySource(a) {
            const hit = db.primary(a)?.processingCaseId ?? null;
            await tick();
            return hit;
        },
        async insertCase({ orgId }) {
            const id = db.nextId();
            db.insertCaseNow({ id, orgId });
            return { id };
        },
        async insertSource(s) {
            db.insertSourceNow({ ...s });
        },
    };
}

const orphans = (db: ReturnType<typeof memoryDb>) => db.cases.filter((c) => !db.sources.some((s) => s.processingCaseId === c.id));
const args = (orgId = ORG, sourceKind: "email_attachment" | "upload" | "form_submission" = "email_attachment") => ({ orgId, sourceKind, sourceId: SRC });

describe("the defect, reproduced on today's three-call sequence", () => {
    it("two concurrent opens of one source: one primary, but the loser's case is an orphan", async () => {
        const db = memoryDb();
        const results = await Promise.allSettled([openProcessingCaseFromSource(legacyPort(db), args()), openProcessingCaseFromSource(legacyPort(db), args())]);
        expect(db.sources.filter((s) => s.role === "primary")).toHaveLength(1);
        expect(db.cases).toHaveLength(2);
        expect(orphans(db)).toHaveLength(1);
        expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
});

describe("the repair: an atomic port", () => {
    for (const kind of ["email_attachment", "upload", "form_submission"] as const) {
        it(`${kind}: two concurrent opens → one case, one primary source, no orphan; both callers get the same case`, async () => {
            const db = memoryDb();
            const [a, b] = await Promise.all([openProcessingCaseFromSource(atomicPort(db), args(ORG, kind)), openProcessingCaseFromSource(atomicPort(db), args(ORG, kind))]);
            expect(db.cases).toHaveLength(1);
            expect(db.sources).toHaveLength(1);
            expect(orphans(db)).toEqual([]);
            expect(a.processingCaseId).toBe(b.processingCaseId);
            expect([a.created, b.created].sort()).toEqual([false, true]);
        });
    }

    it("five concurrent opens converge on one case", async () => {
        const db = memoryDb();
        const all = await Promise.all(Array.from({ length: 5 }, () => openProcessingCaseFromSource(atomicPort(db), args())));
        expect(new Set(all.map((r) => r.processingCaseId)).size).toBe(1);
        expect(all.filter((r) => r.created)).toHaveLength(1);
        expect(db.cases).toHaveLength(1);
        expect(orphans(db)).toEqual([]);
    });

    it("the loser commits after the winner (late interleaving) — still no orphan", async () => {
        const db = memoryDb();
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const slow = openProcessingCaseFromSource(atomicPort(db, { beforeCommit: () => gate }), args());
        const fast = await openProcessingCaseFromSource(atomicPort(db), args());
        release();
        const late = await slow;
        expect(late).toEqual({ processingCaseId: fast.processingCaseId, created: false });
        expect(db.cases).toHaveLength(1);
        expect(orphans(db)).toEqual([]);
    });

    it("a failure inside the transaction writes nothing: no case, no source, the error surfaces", async () => {
        const db = memoryDb();
        await expect(openProcessingCaseFromSource(atomicPort(db, { failSourceInsert: true }), args())).rejects.toThrow("check constraint violated");
        expect(db.cases).toEqual([]);
        expect(db.sources).toEqual([]);
    });

    it("idempotent: a later open returns the existing case without writing", async () => {
        const db = memoryDb();
        const first = await openProcessingCaseFromSource(atomicPort(db), args());
        const again = await openProcessingCaseFromSource(atomicPort(db), args());
        expect(again).toEqual({ processingCaseId: first.processingCaseId, created: false });
        expect(db.cases).toHaveLength(1);
    });

    it("tenancy: the same source id in another organization is a different case", async () => {
        const db = memoryDb();
        const a = await openProcessingCaseFromSource(atomicPort(db), args(ORG));
        const b = await openProcessingCaseFromSource(atomicPort(db), args(OTHER));
        expect(a.processingCaseId).not.toBe(b.processingCaseId);
        expect(db.cases.map((c) => c.orgId).sort()).toEqual([ORG, OTHER].sort());
        expect(db.sources.every((s) => db.cases.find((c) => c.id === s.processingCaseId)?.orgId === s.orgId)).toBe(true);
    });

    it("a port whose atomic path is unavailable (null) falls back to today's sequence, unchanged", async () => {
        const db = memoryDb();
        const deps: ProcessingCaseDeps = { ...legacyPort(db), openCaseWithPrimarySource: async () => null };
        const r = await openProcessingCaseFromSource(deps, args());
        expect(r.created).toBe(true);
        expect(db.cases).toHaveLength(1);
        expect(db.sources).toHaveLength(1);
    });

    it("requireAtomic: an unavailable atomic path (null, or no port) is refused with a typed error BEFORE any legacy call", async () => {
        const refuse = async () => { throw new Error("legacy sequence must not run when atomicity is required"); };
        const legacyRefusing = { findCaseIdByPrimarySource: refuse, insertCase: refuse, insertSource: refuse } as unknown as ProcessingCaseDeps;
        for (const deps of [{ ...legacyRefusing, openCaseWithPrimarySource: async () => null }, legacyRefusing]) {
            const err = await openProcessingCaseFromSource(deps, { ...args(), requireAtomic: true }).catch((e) => e);
            expect(err).toBeInstanceOf(AtomicProcessingOpenUnavailableError);
            expect(err.code).toBe("processing_atomic_open_unavailable");
            // The non-form on-ramp forwards the requirement.
            await expect(openNonFormProcessingCaseFromSource(deps, { ...args(), requireAtomic: true })).rejects.toBeInstanceOf(AtomicProcessingOpenUnavailableError);
        }
    });

    it("requireAtomic with the atomic path present: identical to the atomic open (two concurrent → one case, no orphan)", async () => {
        const db = memoryDb();
        const port = atomicPort(db);
        const [a, b] = await Promise.all([
            openProcessingCaseFromSource(port, { ...args(), requireAtomic: true }),
            openProcessingCaseFromSource(port, { ...args(), requireAtomic: true }),
        ]);
        expect(a.processingCaseId).toBe(b.processingCaseId);
        expect(db.cases).toHaveLength(1);
        expect(orphans(db)).toEqual([]);
    });
});

describe("the Supabase port", () => {
    function fakeClient(rpc: (fn: string, a: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null }) {
        const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
        const tableWrites: string[] = [];
        const tablesTouched: string[] = [];
        const client = {
            rpc: async (fn: string, a: Record<string, unknown>) => {
                calls.push({ fn, args: a });
                return rpc(fn, a);
            },
            from: (table: string) => {
                tablesTouched.push(table);
                const q = {
                    select: () => q, eq: () => q,
                    maybeSingle: async () => ({ data: null, error: null }),
                    insert: () => { tableWrites.push(table); return { select: () => ({ single: async () => ({ data: { id: "legacy-case" }, error: null }) }), then: (r: (v: unknown) => void) => r({ error: null }) }; },
                };
                return q;
            },
        };
        return { client, calls, tableWrites, tablesTouched };
    }

    it("calls the function with org, kind, source and case type, and maps its row", async () => {
        const f = fakeClient(() => ({ data: [{ processing_case_id: "case-1", created: true }], error: null }));
        const deps = makeProcessingCaseDbDeps(f.client as never);
        const r = await openProcessingCaseFromSource(deps, { orgId: ORG, sourceKind: "email_attachment", sourceId: SRC });
        expect(r).toEqual({ processingCaseId: "case-1", created: true });
        expect(f.calls).toEqual([{ fn: "open_processing_case_with_primary_source", args: { p_org_id: ORG, p_source_kind: "email_attachment", p_source_id: SRC, p_case_type: null } }]);
        expect(f.tableWrites).toEqual([]);
    });

    it("falls back to the three calls ONLY when the function does not exist yet", async () => {
        for (const code of ["PGRST202", "42883"]) {
            const f = fakeClient(() => ({ data: null, error: { code, message: "function not found" } }));
            const r = await openProcessingCaseFromSource(makeProcessingCaseDbDeps(f.client as never), { orgId: ORG, sourceKind: "upload", sourceId: SRC });
            expect(r).toEqual({ processingCaseId: "legacy-case", created: true });
            expect(f.tableWrites).toEqual(["processing_cases", "processing_case_sources"]);
        }
        expect(isMissingFunctionError({ code: "23505" })).toBe(false);
    });

    it("requireAtomic over a database WITHOUT the function (PGRST202 / 42883): typed refusal, zero legacy reads or writes", async () => {
        for (const code of ["PGRST202", "42883"]) {
            const f = fakeClient(() => ({ data: null, error: { code, message: "function not found" } }));
            const err = await openProcessingCaseFromSource(makeProcessingCaseDbDeps(f.client as never), { orgId: ORG, sourceKind: "email_attachment", sourceId: SRC, requireAtomic: true }).catch((e) => e);
            expect(err).toBeInstanceOf(AtomicProcessingOpenUnavailableError);
            expect(f.calls).toHaveLength(1);
            expect(f.tablesTouched).toEqual([]);
            expect(f.tableWrites).toEqual([]);
        }
    });

    it("any other error is a real failure: thrown, and no fallback writes", async () => {
        const f = fakeClient(() => ({ data: null, error: { code: "42501", message: "permission denied" } }));
        await expect(openProcessingCaseFromSource(makeProcessingCaseDbDeps(f.client as never), { orgId: ORG, sourceKind: "upload", sourceId: SRC })).rejects.toThrow("permission denied");
        expect(f.tableWrites).toEqual([]);
    });
});

describe("the migration has the shape the repair depends on", () => {
    const sql = readFileSync(resolve(ROOT, "supabase/migrations/20261215093000_processing_open_case_atomic.sql"), "utf8");
    const code = sql.replace(/--[^\n]*/g, "");

    it("both inserts sit inside ONE exception block that catches unique_violation, re-reads the winner and re-raises otherwise", () => {
        const block = code.slice(code.indexOf("    BEGIN\n        INSERT INTO public.processing_cases"), code.indexOf("END;\n$fn$"));
        expect(block).toMatch(/INSERT INTO public\.processing_cases[\s\S]*INSERT INTO public\.processing_case_sources[\s\S]*EXCEPTION WHEN unique_violation THEN/);
        expect(block).toMatch(/EXCEPTION WHEN unique_violation THEN[\s\S]*s\.role = 'primary'[\s\S]*RAISE;/);
        expect(code).not.toMatch(/DELETE FROM/i);
    });

    it("every read and write is bound to the organization parameter", () => {
        expect((code.match(/s\.org_id = p_org_id/g) ?? []).length).toBe(2);
        expect(code).toMatch(/VALUES \(p_org_id, 'received', p_case_type\)/);
        expect(code).toMatch(/VALUES \(p_org_id, v_case, p_source_kind, p_source_id, 'primary'\)/);
    });

    it("is not executable by clients: invoker rights, revoked from PUBLIC / anon / authenticated, granted to service_role", () => {
        expect(code).toMatch(/SECURITY INVOKER/);
        expect(code).not.toMatch(/SECURITY DEFINER/);
        expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.open_processing_case_with_primary_source\(uuid, text, uuid, text\) FROM PUBLIC;/);
        expect(code).toMatch(/FROM anon, authenticated;/);
        expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.open_processing_case_with_primary_source\(uuid, text, uuid, text\) TO service_role;/);
    });
});
