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

    it("THE GATE: the canonical owner routes through the transaction, holding no direct write", () => {
        /*
         * These semantics MOVED, deliberately and under authorization: the port used to issue a bare
         * UPDATE, which left the participation lifecycle write with no transaction for Step 2's
         * maintained fact to join. They now live in SQL, so this gate follows them there rather than
         * asserting against the file they left — and it asserts the port no longer writes the table
         * itself, which is the half that would otherwise regress silently.
         */
        const owner = readFileSync(join(process.cwd(), CANONICAL_OWNER), "utf8");
        const start = owner.indexOf("async updateProcessParticipation");
        const nextPort = owner.indexOf("async ", start + 10);
        const body = owner.slice(start, nextPort > start ? nextPort : undefined);

        expect(body, "the port writes process_instances directly again")
            .not.toMatch(/\.from\(\s*["']process_instances["']\s*\)/);
        expect(body).toContain('ctx.supabase.rpc("update_participation_and_maintain_facts"');
        expect(body, "the not-found/stale vocabulary was dropped").toContain("record_not_found_or_stale");
        expect(body, "the patch allowlist is gone — this would become a generic table writer")
            .toContain("ALLOWED_PATCH_FIELDS");
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

describe("the participation lifecycle write has ONE transaction", () => {
    /**
     * Step 2 needs somewhere to put the maintained opportunity fact such that it cannot commit while
     * the participation update rolls back, or vice versa. A plpgsql function body IS one transaction,
     * so the seam is real the moment the write lives inside it.
     *
     * The migration carries its own execution proof — it exercises success, stage stamping, stale
     * version, missing row, cross-org and a forced rollback against real rows and raises on any
     * mismatch. These gates guard the CONTRACT so it cannot be quietly widened or weakened.
     */
    const MIGRATION_RAW = readFileSync(
        join(process.cwd(), "..", "supabase", "migrations",
             "20260918140000_participation_lifecycle_transaction_boundary.sql"), "utf8");
    /*
     * Code only. The file's prose names SECURITY DEFINER in order to explain why it is NOT used, and
     * a raw scan reads that explanation as the thing it forbids — the same comment-vs-code trap that
     * made an earlier gate assert against its own documentation.
     */
    const MIGRATION = MIGRATION_RAW.replace(/^\s*--.*$/gm, "");

    it("THE GATE: the function is SECURITY INVOKER, never DEFINER", () => {
        // process_instances carries RLS org policies. A DEFINER function would bypass them and become
        // a privilege escalation for anyone who could reach it.
        expect(MIGRATION).toContain("SECURITY INVOKER");
        expect(MIGRATION, "SECURITY DEFINER would bypass the RLS org policies").not.toContain("SECURITY DEFINER");
    });

    it("THE GATE: it is the domain operation, not a table writer", () => {
        /*
         * Exactly two settable fields, each with a supplied-flag, because `null` means SET NULL and
         * absent means LEAVE ALONE. No column list, no JSON patch language, no reachable third column.
         */
        expect(MIGRATION).toContain("p_set_stage_key boolean");
        expect(MIGRATION).toContain("p_set_state boolean");
        for (const forbidden of ["p_patch jsonb", "EXECUTE format", "quote_ident"]) {
            expect(MIGRATION, `${forbidden} would make this generic CRUD`).not.toContain(forbidden);
        }
        expect(MIGRATION).not.toMatch(/SET\s+metadata\s*=/);
    });

    it("THE GATE: the optimistic-concurrency predicate survives", () => {
        expect(MIGRATION).toContain("p_expected_version IS NULL OR updated_at = p_expected_version");
        expect(MIGRATION).toContain("'record_not_found_or_stale'");
    });

    it("THE GATE: stage entry stamps on SUPPLY, matching the port it replaced", () => {
        // Deliberately presence-based, not change-based: re-sending the same stage_key restamps today,
        // and this slice moves a transaction boundary without changing semantics.
        expect(MIGRATION).toContain("stage_entered_at = CASE WHEN p_set_stage_key THEN v_now       ELSE stage_entered_at END");
    });

    it("THE GATE: the org predicate is present, so a row cannot be reached cross-tenant", () => {
        expect(MIGRATION).toContain("AND org_id = p_org_id");
    });

    it("THE GATE: the migration proves itself by execution, not by text", () => {
        // Every one of these is a raise-on-mismatch assertion against real rows.
        // Specimen strings live inside RAISE statements, which survive comment stripping.
        for (const specimen of [
            "SELFTEST: state update refused",
            "SELFTEST: stage_entered_at not stamped on a stage change",
            "SELFTEST: stale write was accepted",
            "SELFTEST: missing row not reported as stale",
            "SELFTEST: cross-org write succeeded",
            "survived a rolled-back transaction",
        ]) {
            expect(MIGRATION, `the ${specimen} specimen is gone`).toContain(specimen);
        }
        // And the fixtures must not survive the migration.
        expect(MIGRATION).toContain("SELFTEST_CLEANUP");
    });

    it("the Step 2 seam is named, and still empty", () => {
        // Step 2 adds its UPDATE here. Naming it is what stops it being added somewhere else.
        // The seam is a comment by nature, so this one reads the RAW file.
        expect(MIGRATION_RAW).toContain("STEP 2 SEAM");
        expect(MIGRATION, "a maintained-fact column was created before it was authorized")
            .not.toMatch(/ALTER TABLE\s+(public\.)?opportunities/i);
    });

    it("the command's `dependent` classification is unchanged", () => {
        // The RPC is an implementation detail of the existing command, not a new operator command.
        const handlers = readFileSync(join(process.cwd(), "lib/pos/processingIdentity/commands/handlers.ts"), "utf8");
        const cmd = handlers.slice(handlers.indexOf("const updateProcessParticipation"));
        const meta = cmd.slice(0, cmd.indexOf("async validate"));
        expect(meta).toContain('atomicity: "dependent"');
        expect(meta).toContain('idempotency: "operation_key"');
    });
});
