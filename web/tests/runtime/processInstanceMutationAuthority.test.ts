/**
 * ONE OWNER FOR PROCESS LIFECYCLE TRUTH (P0-7.6 · Step 2 prerequisite).
 *
 * ── WHY THIS GATE EXISTS ──
 *
 * Step 2 wants to maintain the EPP participant rollup when canonical truth changes, and then retire
 * its request-time read. That is only safe if the fields the rollup depends on have ONE mutation
 * owner with a trustworthy commit boundary.
 *
 * They do, and it is not the Operational Mutation Platform. `process_instances` lifecycle mutation is
 * owned by the Processing Identity command runtime, whose contracts require a stable idempotency key
 * per command and classify commands as `atomic` — "part of the identity group; must commit in one DB
 * transaction" — executed through the `execute_processing_identity_group` RPC.
 *
 * ── WHAT THIS GATE ACTUALLY PROTECTS ──
 *
 * Two other production modules write `process_instances`, and both write ONLY `metadata`: an
 * assignment quote snapshot, and an in-place participation correction. Neither carries process
 * lifecycle semantics, so neither is a second lifecycle authority — today.
 *
 * The danger is quiet drift: the day one of them adds `stage_key` to its patch, EPP truth acquires a
 * second writer with no idempotency key and no atomic group, Step 2's maintained fact silently goes
 * stale, and nothing fails. This gate is what makes that day loud.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The fields the EPP rollup reads. Changing any of them changes evaluated Work View truth. */
const LIFECYCLE_FIELDS = ["stage_key", "state", "close_reason_key"] as const;

/** The single sanctioned lifecycle writer. */
const CANONICAL_OWNER = "lib/pos/processingIdentity/commands/ports.ts";

const WRITE = /\.(insert|update|upsert|delete)\s*\(/;

function processInstanceWriters(): Array<{ file: string; chain: string }> {
    const out: Array<{ file: string; chain: string }> = [];
    const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                if (!/node_modules/.test(e.name)) walk(p);
                continue;
            }
            if (!/\.tsx?$/.test(e.name) || /\.test\./.test(e.name)) continue;
            const src = readFileSync(p, "utf8");
            for (const m of src.matchAll(/\.from\(\s*["']process_instances["']\s*\)/g)) {
                const chain = src.slice(m.index ?? 0, (m.index ?? 0) + 500).split(/;\s*\n/)[0]!;
                if (WRITE.test(chain)) out.push({ file: p.replace(`${process.cwd()}/`, ""), chain });
            }
        }
    };
    walk(join(process.cwd(), "lib"));
    walk(join(process.cwd(), "app"));
    return out;
}

/** Writers that legitimately touch `process_instances` WITHOUT carrying lifecycle semantics. */
const METADATA_ONLY_BY_DESIGN = new Set([
    // an assignment quote snapshot
    "app/api/admin/enrollment/assignment-quote/route.ts",
    // an in-place participation correction
    "lib/childcareOperational/applyChildParticipationEdit.ts",
]);

/** Fixture teardown, not production authority — see the fixture disposition in the evidence. */
const FIXTURE_TEARDOWN = new Set(["lib/certification/enrollmentCertificationFixture.ts"]);

describe("process lifecycle truth has exactly one mutation owner", () => {
    it("THE GATE: only the canonical owner writes stage_key / state / close_reason_key", () => {
        /*
         * The failure this catches is silent by construction: a second writer would still produce
         * correct rows, so every functional test would pass while Step 2's maintained EPP fact went
         * stale behind it.
         */
        const offenders = processInstanceWriters()
            .filter((w) => w.file !== CANONICAL_OWNER)
            .filter((w) => !FIXTURE_TEARDOWN.has(w.file))
            .filter((w) => LIFECYCLE_FIELDS.some((f) => w.chain.includes(f)))
            .map((w) => w.file);

        expect(
            [...new Set(offenders)],
            `these modules write process lifecycle fields (${LIFECYCLE_FIELDS.join(", ")}) outside `
            + `${CANONICAL_OWNER}. That table's lifecycle mutation is owned by the Processing Identity `
            + "command runtime, which supplies the idempotency key and the atomic group commit that "
            + "EPP maintenance will depend on. Route the mutation through updateProcessParticipation.",
        ).toEqual([]);
    });

    it("THE GATE: the known metadata-only writers stay metadata-only", () => {
        // They are retained deliberately: an in-place correction is not process lifecycle authority.
        // This is the assertion that keeps that true.
        for (const w of processInstanceWriters()) {
            if (!METADATA_ONLY_BY_DESIGN.has(w.file)) continue;
            for (const f of LIFECYCLE_FIELDS) {
                expect(
                    w.chain.includes(f),
                    `${w.file} acquired a lifecycle field (${f}). It is retained as a metadata-only `
                    + "corrector precisely because it carries no process lifecycle semantics.",
                ).toBe(false);
            }
        }
    });

    it("THE GATE: the canonical owner still stamps stage entry and holds optimistic concurrency", () => {
        /*
         * Scoped to the FUNCTION BODY, not the file. The optimistic-concurrency guard appears four
         * times in this module — once per update port — so a file-wide `toContain` passes happily
         * while the process-participation port loses its own. A plant proved exactly that: the guard
         * was deleted from `updateProcessParticipation` and the assertion still found one of the
         * other three. Asserting against the file was measuring nothing.
         */
        const owner = readFileSync(join(process.cwd(), CANONICAL_OWNER), "utf8");
        const start = owner.indexOf("async updateProcessParticipation");
        expect(start, "the canonical lifecycle port is gone").toBeGreaterThan(-1);
        const nextPort = owner.indexOf("async ", start + 10);
        const body = owner.slice(start, nextPort > start ? nextPort : undefined);

        expect(body).toContain('hasOwnProperty.call(input.patch, "stage_key")');
        expect(body, "stage entry is no longer stamped on a stage change").toContain("patch.stage_entered_at");
        expect(body, "optimistic concurrency was dropped from the lifecycle port")
            .toContain('q.eq("updated_at", input.expected_version)');
        expect(body).toContain("record_not_found_or_stale");
    });

    it("the canonical runtime keeps the commit boundary Step 2 will attach to", () => {
        const contracts = readFileSync(
            join(process.cwd(), "lib/pos/processingIdentity/commands/commandContracts.ts"), "utf8");
        expect(contracts).toContain("must commit in one DB transaction");
        expect(contracts).toMatch(/idempotencyKey/);
    });

    it("creation is deliberately NOT a process-instance operation", () => {
        /*
         * `createProcessParticipation` returns the OCM id and creates no journey: creating one at
         * intake put a CHILD journey into a FAMILY stage. Step 2 must not reintroduce a create path
         * in order to have something to maintain.
         */
        const owner = readFileSync(join(process.cwd(), CANONICAL_OWNER), "utf8");
        const create = owner.slice(owner.indexOf("async createProcessParticipation"), owner.indexOf("async updateProcessParticipation"));
        expect(create).not.toMatch(/\.from\(\s*["']process_instances["']\s*\)/);
        expect(create).toContain("ensureOpportunityCustomerMemberParticipation");
    });
});
