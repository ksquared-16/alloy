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

/*
 * ── WHY THIS RESOLVES CONSTANTS ──
 *
 * This scan matched only the STRING LITERAL `.from("process_instances")`. `lib/process/`
 * exports `PROCESS_INSTANCES_TABLE = "process_instances"` and the real write module uses it, so an
 * entire process-instance writer module — insert plus four lifecycle update shapes, including
 * `close_reason_key` — was invisible to every assertion below. The gate reported a single-writer
 * invariant that the source tree did not have, which is worse than no gate: Step 2's maintained
 * fact was about to be built on it.
 *
 * So the alias set is DERIVED from the tree, not listed. A new `const X = "process_instances"`
 * is picked up automatically; it cannot be used to slip past this file.
 */
function processInstanceTableAliases(): string[] {
    const aliases = new Set<string>();
    const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                if (!/node_modules/.test(e.name)) walk(p);
                continue;
            }
            if (!/\.tsx?$/.test(e.name)) continue;
            for (const m of readFileSync(p, "utf8")
                .matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*["']process_instances["']/g)) {
                aliases.add(m[1]!);
            }
        }
    };
    walk(join(process.cwd(), "lib"));
    walk(join(process.cwd(), "app"));
    return [...aliases];
}

function processInstanceWriters(): Array<{ file: string; chain: string; op: string }> {
    const out: Array<{ file: string; chain: string; op: string }> = [];
    const alternatives = ["[\"']process_instances[\"']", ...processInstanceTableAliases()].join("|");
    const from = new RegExp(`\\.from\\(\\s*(?:${alternatives})\\s*\\)`, "g");
    const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                if (!/node_modules/.test(e.name)) walk(p);
                continue;
            }
            if (!/\.tsx?$/.test(e.name) || /\.test\./.test(e.name)) continue;
            const src = readFileSync(p, "utf8");
            for (const m of src.matchAll(from)) {
                const at = m.index ?? 0;
                const forward = src.slice(at, at + 500).split(/;\s*\n/)[0]!;
                if (!WRITE.test(forward)) continue;
                /*
                 * A payload built ABOVE the call is still this module writing that field.
                 * `materializeEnrollmentFromProcessInstance` assembles `patch.state` / `patch.stage_key`
                 * and then passes `patch`, so a forward-only window read it as metadata-only and the
                 * enrollment materialization write — a real terminal lifecycle transition — went unseen.
                 */
                const payload = /\.(?:insert|update|upsert)\(\s*([A-Za-z_$][\w$]*)\s*[),]/.exec(forward)?.[1];
                const chain = payload
                    ? `${src.slice(Math.max(0, at - 1500), at)}${forward}`
                    : forward;
                out.push({ file: p.replace(`${process.cwd()}/`, ""), chain, op: WRITE.exec(forward)![1]! });
            }
        }
    };
    walk(join(process.cwd(), "lib"));
    walk(join(process.cwd(), "app"));
    return out;
}

/*
 * ── THE STEP 2 BLOCKER LEDGER ──
 *
 * These modules DO write process lifecycle truth outside the canonical owner. They are NOT exempt
 * and NOT sanctioned: this is a blocker ledger, enumerated so the violation is visible instead of
 * invisible. It exists because the scan above matched only the string literal, so these were never
 * reported, and "updateProcessParticipation is the single production lifecycle writer" was recorded
 * as an established fact that the source tree did not support.
 *
 * Why it blocks Step 2 specifically: the maintained EPP fact on `opportunities` is maintained INSIDE
 * `update_participation_and_maintain_facts`. A lifecycle write that does not go through that RPC
 * moves a participant's stage/state WITHOUT refreshing the opportunity's maintained facts. While the
 * first-order enrichment read still runs, navigation re-derives the truth every request and nothing
 * is wrong. The moment that read is retired, these writes become silent, durable, operator-visible
 * wrong truth — a child materialized as enrolled would show its pre-enrollment stage forever.
 *
 * Emptying this ledger (routing each writer through the command runtime) is the precondition for
 * retiring either first-order read. The gate below enforces exactly that, so it cannot be forgotten.
 */
const STEP_2_BLOCKING_UNROUTED_LIFECYCLE_WRITERS = new Map<string, number>([
    // EMPTY, and it must stay that way.
    //
    // Both entries were converged onto update_participation_and_maintain_facts:
    // processInstances.ts had five lifecycle writes (moveProcessInstanceStage, setProcessInstanceState
    // and their two *ByScope forms) and now calls the RPC through one private helper;
    // materializeEnrollmentFromProcessInstance combined provenance metadata with a lifecycle move in a
    // single bare UPDATE and now calls materialize_participation_and_stamp_provenance, which delegates
    // its lifecycle half to the same authority inside one transaction.
    //
    // What remains in processInstances.ts is CREATION (insert/upsert), which is a distinct authority
    // and is asserted as such below — not an exemption hiding a lifecycle mutation.
]);

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
            // CREATION is a separate authority with its own gate below. A row that does not exist yet
            // cannot have stale maintained facts, and Processing Identity deliberately does not create
            // a journey at intake — so insert/upsert is not a bypass, and is asserted as creation
            // rather than waved through as an exemption.
            .filter((w) => w.op === "update" || w.op === "delete")
            .filter((w) => w.file !== CANONICAL_OWNER)
            .filter((w) => !FIXTURE_TEARDOWN.has(w.file))
            .filter((w) => !STEP_2_BLOCKING_UNROUTED_LIFECYCLE_WRITERS.has(w.file))
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

    it("THE GATE: a ledgered file cannot quietly acquire MORE unrouted lifecycle writes", () => {
        /*
         * The ledger is per FILE, so without this the two ledgered modules would be a free pass: any
         * new lifecycle write added to them would inherit the exemption and never be reported. A
         * planted extra write proved exactly that before this assertion existed.
         *
         * The count may FALL as writers are routed (that is the work); it may never RISE.
         */
        const counts = new Map<string, number>();
        for (const w of processInstanceWriters()) {
            if (!STEP_2_BLOCKING_UNROUTED_LIFECYCLE_WRITERS.has(w.file)) continue;
            if (!LIFECYCLE_FIELDS.some((f) => w.chain.includes(f))) continue;
            counts.set(w.file, (counts.get(w.file) ?? 0) + 1);
        }
        for (const [file, allowed] of STEP_2_BLOCKING_UNROUTED_LIFECYCLE_WRITERS) {
            const actual = counts.get(file) ?? 0;
            expect(
                actual,
                `${file} now has ${actual} unrouted lifecycle writes, up from the ledgered ${allowed}. `
                + "A ledgered file is a known blocker, not an exemption — do not add lifecycle writes to it.",
            ).toBeLessThanOrEqual(allowed);
        }
    });

    it("THE GATE: neither first-order read may be retired while any lifecycle writer is unrouted", () => {
        /*
         * The Step 2 safety interlock, and the reason it is an assertion rather than a note.
         *
         * Retiring the enrichment reads is only safe if EVERY lifecycle write maintains the
         * opportunity's facts. Today two modules write lifecycle truth outside the RPC that does that
         * maintenance, so the reads are still load-bearing: they re-derive the truth each request and
         * hide the gap. Retiring them with the ledger non-empty converts a hidden gap into silent,
         * durable wrong truth on the operator's primary surface — and every functional test would
         * still pass, because the rows are correctly SHAPED, just stale.
         *
         * So the two facts are pinned together: the read may disappear only as the ledger empties.
         */
        const provisioning = readFileSync(
            join(process.cwd(), "lib", "runtime", "provisioning", "workUnitProvisioningAnswer.ts"),
            "utf8",
        );
        const eppRetired = !/await attachEffectiveEnrollmentStagesToOpportunityRows\(/.test(provisioning);
        const tourRetired = !/await attachActiveTourFactsToOpportunityRows\(/.test(provisioning);

        if (!eppRetired && !tourRetired) {
            // Pre-Step-2 state: the reads still run, so stale maintained facts cannot reach an operator.
            expect(STEP_2_BLOCKING_UNROUTED_LIFECYCLE_WRITERS.size).toBeGreaterThanOrEqual(0);
            return;
        }

        expect(
            [...STEP_2_BLOCKING_UNROUTED_LIFECYCLE_WRITERS],
            "a first-order enrichment read was retired from the evaluated-page path while these modules "
            + "still write process lifecycle truth outside update_participation_and_maintain_facts. Their "
            + "writes do not refresh the maintained opportunity facts, so navigation would serve stale "
            + "stage/state truth with no failing test anywhere. Route them through the command runtime "
            + "and empty this ledger BEFORE retiring the read.",
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
    /*
     * ── THE LIVE DEFINITION, NOT A FILE ──
     *
     * These gates named one migration by filename. A later migration DROPPED that function and created
     * a wider one (close_reason_key joined the contract), and every assertion here kept passing while
     * describing a definition the database no longer had — a gate that is green about the wrong object.
     *
     * So the definition is RESOLVED: the last migration that creates the function wins, exactly as it
     * does when the migrations are applied in order. Replacing the function again moves these gates
     * with it instead of leaving them behind.
     */
    const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

    function liveDefinitionOf(fn: string): { raw: string; file: string } {
        const marker = `CREATE OR REPLACE FUNCTION public.${fn}(`;
        const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
        let found: { raw: string; file: string } | null = null;
        for (const f of files) {
            const src = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
            const at = src.lastIndexOf(marker);
            if (at < 0) continue;
            const end = src.indexOf("$fn$;", at);
            found = { raw: src.slice(at, end + 5), file: f };
        }
        if (!found) throw new Error(`no migration defines ${fn}`);
        return found;
    }

    const LIVE = liveDefinitionOf("update_participation_and_maintain_facts");
    const MIGRATION_RAW = readFileSync(join(MIGRATIONS_DIR, LIVE.file), "utf8");
    /*
     * Code only. The file's prose names SECURITY DEFINER in order to explain why it is NOT used, and
     * a raw scan reads that explanation as the thing it forbids — the same comment-vs-code trap that
     * made an earlier gate assert against its own documentation.
     */
    const MIGRATION = MIGRATION_RAW.replace(/^\s*--.*$/gm, "");
    /** The live CREATE statement only — prose and neighbouring functions cannot satisfy a gate. */
    const LIVE_FN = LIVE.raw.replace(/^\s*--.*$/gm, "");

    it("THE GATE: the function is SECURITY INVOKER, never DEFINER", () => {
        // process_instances carries RLS org policies. A DEFINER function would bypass them and become
        // a privilege escalation for anyone who could reach it.
        expect(LIVE_FN).toContain("SECURITY INVOKER");
        expect(LIVE_FN, "SECURITY DEFINER would bypass the RLS org policies").not.toContain("SECURITY DEFINER");
    });

    it("THE GATE: it is the domain operation, not a table writer", () => {
        /*
         * Exactly two settable fields, each with a supplied-flag, because `null` means SET NULL and
         * absent means LEAVE ALONE. No column list, no JSON patch language, no reachable third column.
         */
        expect(LIVE_FN).toContain("p_set_stage_key boolean");
        expect(LIVE_FN).toContain("p_set_state boolean");
        expect(LIVE_FN, "close_reason_key is lifecycle truth and arrives with the same SUPPLY flag")
            .toContain("p_set_close_reason_key boolean");
        for (const forbidden of ["p_patch jsonb", "EXECUTE format", "quote_ident"]) {
            expect(LIVE_FN, `${forbidden} would make this generic CRUD`).not.toContain(forbidden);
        }
        /*
         * PLANTED DEFECT E. Provenance metadata must NOT become reachable through the generic
         * lifecycle patch: materialization keeps its own narrow transaction precisely so this
         * function never learns about metadata.
         */
        expect(LIVE_FN, "the lifecycle authority must never write metadata").not.toMatch(/metadata/);
    });

    it("THE GATE: the optimistic-concurrency predicate survives", () => {
        expect(LIVE_FN).toContain("p_expected_version IS NULL OR updated_at = p_expected_version");
        expect(LIVE_FN).toContain("'record_not_found_or_stale'");
    });

    it("THE GATE: stage entry stamps on SUPPLY, matching the port it replaced", () => {
        // Deliberately presence-based, not change-based: re-sending the same stage_key restamps today,
        // and this slice moves a transaction boundary without changing semantics.
        expect(LIVE_FN).toMatch(/stage_entered_at\s*=\s*CASE WHEN p_set_stage_key\s+THEN v_now\s+ELSE stage_entered_at END/);
    });

    it("THE GATE: the org predicate is present, so a row cannot be reached cross-tenant", () => {
        expect(LIVE_FN).toContain("AND org_id = p_org_id");
    });

    it("THE GATE: the LIVE transactional authority proves itself by execution", () => {
        /*
         * This gate listed the exact specimen strings of the slice that first created the function.
         * Step 2 legitimately REPLACED that function, so the live definition moved to a different
         * migration and every one of those strings vanished — the gate went red while nothing was
         * wrong, which is the same staleness as a gate that stays green while everything is.
         *
         * So it now asserts the invariant rather than a slice's vocabulary: whichever migration owns
         * the live definition must carry raise-on-mismatch proof for the behaviours the contract
         * actually promises. A future replacement inherits this instead of breaking it.
         */
        const selftest = MIGRATION_RAW.slice(MIGRATION_RAW.indexOf("DO $selftest$"));
        expect(selftest, "the live authority's migration carries no execution proof at all").not.toBe("");

        const required: Array<[string, RegExp]> = [
            ["a stale expected_version is refused", /SELFTEST:[^']*stale[^']*(accepted|refused|mutated)/i],
            ["a refusal leaves the row unchanged", /SELFTEST:[^']*(refused|stale|cross-org)[^']*(mutated|moved|unchanged)/i],
            ["a cross-org attempt is refused", /SELFTEST:[^']*cross-org/i],
            ["a forced failure rolls the write back", /SELFTEST:[^']*(survived a rolled-back|rolled-back transaction)/i],
            ["the rollback specimen proves the write landed first", /SELFTEST:[^']*rollback setup/i],
        ];
        for (const [what, re] of required) {
            expect(selftest, `the live authority has no execution proof that ${what}`).toMatch(re);
        }
        // And the fixtures must not survive the migration.
        expect(selftest).toContain("SELFTEST_CLEANUP");
    });

    it("THE GATE: the maintained-fact update lives INSIDE the lifecycle transaction", () => {
        /*
         * This asserted the seam was "named and still empty". Step 2 filled it, so an empty seam is
         * now the defect and the old assertion was pinning the pre-Step-2 world.
         *
         * The invariant it becomes is the one that always mattered: the maintained opportunity fact
         * is updated INSIDE the same function body as the process_instances mutation. A plpgsql body
         * is one transaction, so the lifecycle move cannot commit while the fact does not — and it
         * must sit AFTER the not-found/stale return, so a refused write maintains nothing.
         */
        expect(LIVE_FN, "the lifecycle authority no longer maintains the opportunity fact")
            .toContain("refresh_opportunity_maintained_facts");

        const guard = LIVE_FN.indexOf("record_not_found_or_stale");
        const maintain = LIVE_FN.indexOf("refresh_opportunity_maintained_facts");
        expect(guard, "the stale/not-found return is gone").toBeGreaterThan(0);
        expect(
            maintain,
            "the maintained-fact update runs BEFORE the not-found/stale return, so a refused write "
            + "would still maintain facts",
        ).toBeGreaterThan(guard);

        // It must be the function's own statement, not a call the caller could forget or reorder.
        expect(LIVE_FN).toMatch(/PERFORM\s+public\.refresh_opportunity_maintained_facts/);
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

describe("the certification fixture cannot silently prove nothing", () => {
    /**
     * Two fixture defects shipped as a green-looking self-test and were caught only by EXECUTION, not
     * by thirteen passing gates or by reading the SQL:
     *
     *   · `orgs.slug` is NOT NULL UNIQUE and the fixture supplied only `name` — the apply aborted
     *     before a single specimen ran;
     *   · every assertion used `<>`. `stage_key` and `state` are NULLABLE and a missing jsonb key
     *     extracts as NULL, so `NULL <> 'stale'` is NULL, which is not TRUE, so the IF never fires.
     *     The stale-version check was structurally unable to fail on the path it existed to catch.
     *
     * A third followed, from the repair itself: the stale specimen CAPTURED a version from an earlier
     * call and asserted it was OLDER than current. `now()` is `transaction_timestamp()` and a migration
     * is ONE transaction, so every call stamped the SAME value — the captured version was EQUAL to
     * current, which the equality guard ACCEPTS. The assertion also demanded an ordering the contract
     * never made.
     *
     * These gates exist so that class cannot come back.
     */
    const SELFTEST = (() => {
        const raw = readFileSync(
            join(process.cwd(), "..", "supabase", "migrations",
                 "20260918140000_participation_lifecycle_transaction_boundary.sql"), "utf8");
        const body = raw.slice(raw.indexOf("DO $selftest$"), raw.indexOf("$selftest$;"));
        return body.replace(/^\s*--.*$/gm, "");   // code only; the prose describes the traps
    })();

    it("THE GATE: no assertion can pass because a comparison evaluated NULL", () => {
        const unsafe = SELFTEST.split("\n").filter((l) => {
            if (!/^\s*IF .*THEN/.test(l)) return false;
            if (/IS DISTINCT FROM|IS NOT DISTINCT FROM|IS NULL|IS NOT NULL/.test(l)) return false;
            return /<>|[^<>!:]=[^=]/.test(l);
        });
        expect(
            unsafe,
            "these assertions compare with <> or = on a value that can be NULL, so they cannot fail "
            + "when it is. Use IS DISTINCT FROM.",
        ).toEqual([]);
    });

    it("THE GATE: the stale specimen carries a non-null version PROVEN distinct from current", () => {
        // Two ways this specimen can silently prove nothing, and both have happened:
        //   · a NULL expected_version means NO GUARD, so the write lands unguarded and reports success;
        //   · a version CAPTURED from an earlier call is EQUAL to the current one, because now() is
        //     transaction-stable — so the equality guard ACCEPTS it and the specimen proves the reverse.
        // The contract is equality, so the version under test must be CONSTRUCTED different and that
        // difference asserted — never captured, never ordered, never assumed.
        expect(SELFTEST).toContain("v_stale := v_current - interval '1 second';");
        expect(SELFTEST, "the current version is used in arithmetic before being asserted non-null")
            .toMatch(/IF v_current IS NULL THEN/);
        expect(SELFTEST, "the constructed version is not asserted non-null")
            .toMatch(/IF v_stale IS NULL THEN/);
        expect(SELFTEST, "distinctness is assumed rather than proven")
            .toMatch(/IF v_stale IS NOT DISTINCT FROM v_current THEN/);
        expect(SELFTEST, "the stale specimen must carry the constructed version")
            .toMatch(/update_participation_and_maintain_facts\(v_org, v_pi, v_stale,/);
        expect(SELFTEST, "ordering is not part of the equality contract, and cannot hold in one transaction")
            .not.toMatch(/v_\w+ < v_current/);
        expect(SELFTEST, "the INSERT-returned updated_at is NULL and must not be the version under test")
            .not.toMatch(/RETURNING id, updated_at INTO v_pi/);
    });

    it("THE GATE: the harness never bends production timestamp semantics to pass", () => {
        // The cheap way to make an ordering assertion pass is to switch the RPC to clock_timestamp(),
        // which advances inside a transaction. That changes the production contract to suit the test.
        // The version stamp is now(), and the fix belongs in the fixture.
        const MIGRATION = readFileSync(
            join(process.cwd(), "..", "supabase", "migrations",
                 "20260918140000_participation_lifecycle_transaction_boundary.sql"), "utf8");
        expect(MIGRATION, "production timestamp semantics were changed to make a test pass")
            .not.toContain("clock_timestamp");
        expect(MIGRATION).toContain("v_now timestamptz := now();");
    });

    it("THE GATE: fixture rows satisfy their NOT NULL constraints", () => {
        // orgs.slug is NOT NULL with a UNIQUE constraint.
        expect(SELFTEST).toMatch(/INSERT INTO public\.orgs \(name, slug\)/);
        expect(SELFTEST, "a fixed slug can collide with a prior run").toContain("gen_random_uuid()");
    });

    it("THE GATE: the rollback specimen proves the write landed before aborting", () => {
        // Otherwise "the row is unchanged after rollback" would also pass if the write never happened.
        expect(SELFTEST).toMatch(/rollback setup did not apply/);
        expect(SELFTEST).toContain("SELFTEST_FORCED_ROLLBACK");
    });

    it("fixture cleanup stays transactionally contained", () => {
        expect(SELFTEST).toContain("SELFTEST_CLEANUP");
        expect(SELFTEST, "a fixture must never be removed by an explicit DELETE that could outlive a failure")
            .not.toMatch(/DELETE FROM public\.(orgs|process_instances)/);
    });
});

describe("lifecycle writer convergence — the bypasses are gone, not merely wrapped", () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

    it("THE GATE: processInstances.ts holds NO lifecycle write and calls the authority", () => {
        /*
         * PLANTED DEFECT G. Convergence is not "old writer plus a new command call" — the old write
         * has to be UNREACHABLE. This module had five lifecycle UPDATEs; what is left must be creation
         * and reads only.
         */
        const src = read("lib/process/processInstances.ts");
        const writes = [...src.matchAll(/\.from\(PROCESS_INSTANCES_TABLE\)/g)].map((m) => {
            const fwd = src.slice(m.index ?? 0, (m.index ?? 0) + 300).split(/;\s*\n/)[0]!;
            return /\.(insert|update|upsert|delete)\(/.exec(fwd)?.[1] ?? "read";
        });
        expect(
            writes.filter((op) => op === "update" || op === "delete"),
            "a direct lifecycle UPDATE came back to processInstances.ts. Route it through "
            + "applyParticipationLifecycle, which calls update_participation_and_maintain_facts.",
        ).toEqual([]);
        expect(src, "the module no longer reaches the lifecycle authority at all")
            .toContain('supabase.rpc("update_participation_and_maintain_facts"');
    });

    it("THE GATE: creation is ONE authority, through the RPC, initializing atomically", () => {
        /*
         * This looked for a direct `.from(process_instances).insert`. Step 2 routed creation through
         * `insert_enrollment_participation_and_maintain_facts` so the row and its maintained facts are
         * created in ONE transaction — between two statements the journey would exist unmaintained,
         * and a retired enrichment read can no longer cover for that.
         *
         * So the gate moves to the semantic invariant. Restoring a direct INSERT to satisfy the old
         * wording would reintroduce exactly the gap Step 2 closed.
         */
        const CREATION_RPC = "insert_enrollment_participation_and_maintain_facts";
        const CREATION_OWNER = "lib/process/processInstances.ts";

        // 1 · zero direct creates anywhere — alias-aware, so a constant cannot hide one.
        const directCreates = processInstanceWriters()
            .filter((w) => w.op === "insert" || w.op === "upsert")
            .filter((w) => !FIXTURE_TEARDOWN.has(w.file))
            .map((w) => w.file);
        expect(
            [...new Set(directCreates)],
            "a direct process_instances create is back; creation must go through the RPC so the row "
            + "and its maintained facts commit together",
        ).toEqual([]);

        // 2 · exactly ONE production module calls the creation RPC.
        const callers: string[] = [];
        const walk = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                const p = join(dir, e.name);
                if (e.isDirectory()) { if (!/node_modules/.test(e.name)) walk(p); continue; }
                if (!/\.tsx?$/.test(e.name) || /\.test\./.test(e.name)) continue;
                if (readFileSync(p, "utf8").includes(CREATION_RPC)) {
                    callers.push(p.replace(`${process.cwd()}/`, ""));
                }
            }
        };
        walk(join(process.cwd(), "lib"));
        walk(join(process.cwd(), "app"));
        expect(
            [...new Set(callers)],
            "process-instance creation must stay in exactly one production module",
        ).toEqual([CREATION_OWNER]);

        // 3 · the creation transaction initializes the maintained fact itself.
        const dir = join(process.cwd(), "..", "supabase", "migrations");
        const marker = `CREATE OR REPLACE FUNCTION public.${CREATION_RPC}(`;
        let fn = "";
        for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
            const src = readFileSync(join(dir, f), "utf8");
            const at = src.lastIndexOf(marker);
            if (at >= 0) fn = src.slice(at, src.indexOf("$fn$;", at) + 5);
        }
        expect(fn, "the creation transaction is missing").not.toBe("");
        expect(
            fn.replace(/^\s*--.*$/gm, ""),
            "creation must initialize the maintained fact in the SAME transaction as the INSERT — a "
            + "post-create repair UPDATE would be a second writer",
        ).toContain("refresh_opportunity_maintained_facts");
    });

    it("THE GATE: materialization routes lifecycle through the authority, not its own UPDATE", () => {
        /*
         * PLANTED DEFECT D. This combined provenance metadata with a lifecycle move in one bare UPDATE,
         * which made it a second lifecycle writer and would have left a materialized child showing its
         * pre-enrollment stage forever once Step 2 retires the enrichment read.
         */
        const src = read("lib/childcareOperational/materializeEnrollmentFromProcessInstance.ts");
        const bypass = [...src.matchAll(/\.from\(PROCESS_INSTANCES_TABLE\)/g)].some((m) => {
            const fwd = src.slice(m.index ?? 0, (m.index ?? 0) + 300).split(/;\s*\n/)[0]!;
            return /\.(insert|update|upsert|delete)\(/.test(fwd);
        });
        expect(bypass, "materialization writes process_instances directly again").toBe(false);
        expect(src).toContain('supabase.rpc(\n        "materialize_participation_and_stamp_provenance"');
    });

    it("THE GATE: materialization stays ONE commit — lifecycle delegated, provenance aborting", () => {
        /*
         * Section 5: do not make the system less atomic in order to route through a command. The domain
         * transaction must (a) delegate its lifecycle half to the single authority rather than write the
         * columns, and (b) RAISE if the provenance stamp matches no row — a RETURN there would commit a
         * lifecycle move whose provenance never landed, which is the split commit this prevents.
         */
        const fn = (() => {
            const dir = join(process.cwd(), "..", "supabase", "migrations");
            const marker = "CREATE OR REPLACE FUNCTION public.materialize_participation_and_stamp_provenance(";
            const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
            let out = "";
            for (const f of files) {
                const src = readFileSync(join(dir, f), "utf8");
                const at = src.lastIndexOf(marker);
                if (at >= 0) out = src.slice(at, src.indexOf("$fn$;", at) + 5);
            }
            return out.replace(/^\s*--.*$/gm, "");
        })();
        expect(fn, "the materialization transaction is missing").not.toBe("");
        expect(fn, "it must delegate the lifecycle half, never write the columns itself")
            .toContain("public.update_participation_and_maintain_facts(");
        expect(fn, "it must not write lifecycle columns directly").not.toMatch(/SET[\s\S]{0,80}stage_key\s*=/);
        expect(fn, "a provenance miss after a successful lifecycle write must ABORT, not return")
            .toMatch(/RAISE EXCEPTION 'materialize_participation:/);
        expect(fn).toContain("SECURITY INVOKER");
    });
});
