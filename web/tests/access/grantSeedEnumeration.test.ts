/**
 * RL-8 — no grant seed derives its key set from the catalog.
 *
 * W-12 (`docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §7),
 * closing G5. Migration M6 is `supabase/migrations/20260807170000_w12_seed_default_rbac_enumerated_grants.sql`.
 *
 * The invariant and why it is phrased in terms of the *key set* rather than the word `SELECT` is in
 * `grantSeedDiscovery.ts`. The short form: adding a catalog key must grant nothing implicitly.
 *
 * Four things are asserted, and the first is the one that matters:
 *
 *   1. The **end state** of `seed_default_rbac` — the definition that survives a replay of the whole
 *      migration tree in filename order — contains no blanket grant.
 *   2. The blanket statements that remain in the tree are *history*: superseded definitions in
 *      applied migrations, which cannot be edited. Their count is a **ratchet enforced in both
 *      directions**, because W-4 recorded the cost of a ceiling that only ever failed upward.
 *   3. The enumeration preserves behaviour: `admin` receives exactly the function's own catalog
 *      literal, `ops` receives that less the two keys the blanket withheld.
 *   4. The migration's own fail-closed guard is bound to the thing it guards — it slices the
 *      function by the sentinels the function actually carries. W-4 found four inaccurate citations
 *      in a register of ten because "nothing binds a citation to the line it names"; this binds it.
 */

import { describe, expect, it } from "vitest";
import {
    discoverGrantStatements,
    keyLiterals,
    liveFunctionDefinition,
    migrationFiles,
    readMigration,
    sentinelRegion,
    stripSqlComments,
} from "./grantSeedDiscovery";
import { discoverCatalog } from "./permissionCatalogDiscovery";

/**
 * W-12's migration — where the enumeration form came from, and still the file the fail-closed guard
 * assertions at the foot of this file are written against.
 */
const M6 = "20260807170000_w12_seed_default_rbac_enumerated_grants.sql";

/**
 * The migration that defines `seed_default_rbac` TODAY.
 *
 * W-12 froze the enumeration at the 57 keys the catalog held on 2026-08-07 and left a fail-closed
 * assertion to catch a thinner set — but that assertion runs once, at its own apply, and nine keys
 * were catalogued afterwards. Each arrived with a one-shot backfill over the orgs that existed at
 * that moment and none of them touched the function, so which capabilities an organization's
 * administrator held became a function of the date its `orgs` row was created. Meanwhile the local
 * seed's own comment still asserted the property W-12 was supposed to keep: *"that migration REFUSES
 * to install if its enumeration omits any active catalog key. So this stays correct as the catalog
 * grows."*
 *
 * The lock below is what actually keeps it correct as the catalog grows, and it is why the numbers
 * here are derived from the tree rather than restated: the tenth key fails this file, in the
 * repository, before a tenant is created without it.
 */
/*
 * The migration that currently DEFINES `seed_default_rbac`, not the one that first enumerated it.
 *
 * It moves whenever a program adds a capability, because a capability that is not in the seed is a
 * capability a NEW organization never receives — the cliff `20260910183000` was written to end.
 * Forms moved it here.
 */
const LIVE_SEED = "20260912114000_processing_capability_default_seed.sql";

/**
 * The migration that owns the COMPLETENESS contract — the admin-is-the-whole-catalog rule, the nine
 * ops exclusions and their reasons, and the repair of the organizations that predate it.
 *
 * Separate from {@link LIVE_SEED} because the two names answer different questions. `LIVE_SEED` is
 * *which definition survives a replay of the tree*; this is *where the contract is argued*. They
 * were the same file until W-13 added one key, and keeping them apart is what lets a later
 * amendment reproduce the enumeration without being asked to re-litigate the whole catalog against
 * a database it does not own.
 */
const COMPLETENESS_GUARD = "20260910183000_access_v2_default_role_package_completeness.sql";

/**
 * W-13 moved this constant for the first time since the lock was written, and the move is the lock
 * working rather than the lock being edited around.
 *
 * `20260910183000` is still where the enumeration's REASONING lives — the admin contract, the nine
 * ops exclusions, the two director roles. `20260911140000` reproduces it with one key added
 * (`portal.access`, to `admin` and `ops`), because a new organization whose administrator cannot
 * open the portal is the defect the completeness migration had just closed, one migration earlier.
 * The assertions below are stated over whichever definition SURVIVES a replay of the tree, so they
 * followed the redefinition without being told to; only this name had to move.
 */

/**
 * Blanket grants that predate W-12 and are frozen in applied migrations: the baseline's pair in
 * `20260329165048_remote_schema.sql`, and Phase 0's pair in
 * `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql`. Both pairs live in
 * definitions of `seed_default_rbac` that M6 supersedes.
 */
const HISTORICAL_BLANKET_FILES = [
    "20260329165048_remote_schema.sql",
    "20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql",
];
const HISTORICAL_BLANKET_CEILING = 4;

/**
 * What `ops` does not receive, and who decided each one.
 *
 * The first two are the exclusion the pre-W-12 blanket carried. The other seven are each a decision
 * the migration that introduced that key stated in its own words — D-H6 for health ("an operator who
 * already works Attendance or Financials must not acquire allergies, conditions and medications
 * merely because a Health card was placed on a Surface"), `20260901120000` for the enrollment
 * exception, and admin-only grants for the three financial mutation authorities and the pricing
 * override. None of them is a judgement invented by the seed; the seed now states the settled shape
 * instead of leaving it to the order in which migrations happened to run.
 */
const OPS_WITHHELD = [
    "admin.users.write",
    "admin.roles.write",
    "enrollment.pricing.override",
    "enrollment.requirement_exception.manage",
    "fin.adjust",
    "fin.responsibility",
    "fin.subsidy",
    "health.view",
    "health.manage",
    /*
     * Forms design and broad submission handling. Not a judgement invented by the seed: before the
     * Forms migration, `ops` could reach exactly one Forms write — confirming a linkage the system
     * proposed — and could not set one by hand. Withholding these two is what preserves that.
     * `forms.submissions.confirm` is deliberately NOT withheld, because ops already had it.
     */
    "forms.author",
    "forms.submissions",
    /*
     * Archive, destructive document management and the test-data reset. Also not a judgement
     * invented by the seed: `ops` was admitted by the Processing OPERATOR context and by nothing
     * else in that cluster — archive was admin-only, so were both document operations, and so was
     * the reset. Withholding these three is what preserves that.
     *
     * `processing.operate` is deliberately NOT withheld, because ops already had it. Folding any of
     * the three into it would have handed ops an authority it has never held, which is the whole
     * reason they are separate keys.
     */
    "processing.archive",
    "processing.documents.manage",
    "processing.dev_cleanup",
];

const statements = discoverGrantStatements();

describe("RL-8 — grant seeds enumerate their grants (W-12 / G5)", () => {
    describe("non-vacuity of the scan", () => {
        it("discovers grant-writing statements across many migrations", () => {
            // Guards against the failure mode that defeated RL-1 twice, RL-4 once and RL-3 once:
            // an instrument that asserts a property of an empty or truncated subject.
            expect(migrationFiles().length).toBeGreaterThan(300);
            expect(statements.length).toBeGreaterThanOrEqual(12);
            expect(new Set(statements.map((s) => s.file)).size).toBeGreaterThanOrEqual(8);
        });

        it("classifies the three bounded seeding syntaxes the tree actually uses", () => {
            const byFile = (file: string) => statements.filter((s) => s.file.startsWith(file));

            // (a) A bare literal in the SELECT list.
            expect(byFile("20260720000000").every((s) => s.binding === "literal")).toBe(true);

            // (b) A catalog join bounded by a literal `IN` list — reads the catalog, and is still
            //     bounded, which is why RL-8 is phrased about the key set and not about `SELECT`.
            const grid = byFile("20260505164000");
            expect(grid.length).toBeGreaterThan(0);
            expect(grid.every((s) => s.readsCatalog && s.binding === "literal")).toBe(true);
            expect(grid[0]!.boundingKeys).toContain("billing.read");

            // (c) A `FOR … IN VALUES` loop — the variable-driven form whose keys are invisible to a
            //     tuple-shaped parser, which is exactly how W-11 found the catalog under-counted.
            const waveC = byFile("20260722000000");
            expect(waveC.length).toBeGreaterThan(0);
            expect(waveC.every((s) => s.binding === "loop-values")).toBe(true);
            expect(waveC[0]!.boundingKeys).toContain("operational_expectations.authority.manage");
        });

        it("does not read a NOT IN exclusion as a bound", () => {
            // The baseline's `ops` blanket selects the whole catalog and then names two keys it
            // withholds. A "does the statement mention a key?" test reads that as enumerated.
            const baselineOps = statements.find(
                (s) => s.file.startsWith("20260329165048") && /'ops'/.test(s.text) && /not\s+in/i.test(s.text)
            );
            expect(baselineOps).toBeDefined();
            expect(baselineOps!.binding).toBe("blanket");
        });
    });

    describe("the end state", () => {
        const live = liveFunctionDefinition("seed_default_rbac");

        it("is defined by the completeness migration, not by the frozen one", () => {
            expect(live).not.toBeNull();
            expect(live!.file).toBe(LIVE_SEED);
        });

        it("contains no blanket grant", () => {
            /*
             * Three statements now, not two: `admin`, `ops`, and the pair of director roles the
             * function never mentioned at all. `20260909240000` gave `school_director` and
             * `regional_lead` their `fin.read` in a one-shot over the orgs that existed on
             * 2026-09-09 and did not touch the seed, so a NEW org's directors would have been born
             * without it and the same defect would have reappeared on the next tenant.
             *
             * The widths are asserted against the catalog two assertions below rather than restated
             * as constants here — a number typed in a test is a number that can be typed wrong.
             */
            const inLive = statements.filter((s) => s.file === LIVE_SEED && /seed_default_rbac|p_org_id/.test(s.text));
            expect(inLive.length).toBe(3);
            expect(inLive.every((s) => s.binding === "literal")).toBe(true);
        });

        it("reads the catalog only to narrow the enumeration, never to source it", () => {
            // The blanket carried `is_active = true`, and `is_active` shapes nothing else at
            // runtime — `resolveAdminAccessCore.fetchPermissionKeys` reads grant rows without
            // joining the catalog. Dropping it would widen. The distinction RL-8 draws is between
            // a catalog read that *decides* the key set and one that can only remove from a list
            // already fixed by literals.
            const inLive = statements.filter(
                (s) => s.file === LIVE_SEED && /select p_org_id, '(admin|ops)'/.test(s.text),
            );
            expect(inLive.length).toBe(2);
            expect(inLive.every((s) => s.readsCatalog)).toBe(true);
            for (const statement of inLive) {
                expect(statement.text).toMatch(
                    /where exists \(\s*select 1\s+from public\.permission_definitions pd\s+where pd\.key = enumerated\.permission_key\s+and pd\.is_active = true\s*\)/i
                );
            }
        });

        it("leaves only superseded, historical blankets in the tree — ratchet enforced in both directions", () => {
            const blankets = statements.filter((s) => s.binding === "blanket");
            const files = [...new Set(blankets.map((s) => s.file))].sort();

            expect(files).toEqual([...HISTORICAL_BLANKET_FILES].sort());
            // Over: a new blanket anywhere fails. Under: a shrunk count means the ceiling is stale
            // and must be re-stated deliberately — W-4's finding was a ratchet that could only ever
            // fail upward, so a breach sat latent for three days.
            expect(blankets.length).toBe(HISTORICAL_BLANKET_CEILING);
        });

        it("`parameter-bound` does not excuse a catalog blanket — the refinement did not weaken it", () => {
            // W-28 added a fourth binding for an INSERT whose keys come from an unnested caller
            // array. That must not become a hole: the same shape reading the CATALOG is still a
            // blanket, because then the key set is the catalog's contents and not the caller's.
            // Proved against the classifier's own inputs rather than asserted in prose.
            const parameterBound = statements.filter((s) => s.binding === "parameter-bound");
            expect(parameterBound.length).toBeGreaterThan(0);
            for (const s of parameterBound) {
                expect(s.readsCatalog, `${s.file}: a parameter-bound write must not read the catalog`).toBe(false);
            }
            // And every statement that DOES read the catalog is still classified blanket or literal —
            // never excused by the new binding.
            for (const s of statements.filter((s) => s.readsCatalog)) {
                expect(s.binding).not.toBe("parameter-bound");
            }
        });
    });

    describe("behaviour preservation", () => {
        const live = liveFunctionDefinition("seed_default_rbac")!;
        // The catalog statement alone — from its INSERT to its terminating semicolon — so the
        // comparison below cannot be satisfied by the grant lists further down the same body.
        const stripped = stripSqlComments(live.body);
        const catalogFrom = stripped.search(/insert\s+into\s+public\.permission_definitions/i);
        const catalogLiteral = keyLiterals(stripped.slice(catalogFrom, stripped.indexOf(";", catalogFrom)));
        const adminRegion = sentinelRegion(live.body, "W12:ADMIN-GRANTS:BEGIN", "W12:ADMIN-GRANTS:END");
        const opsRegion = sentinelRegion(live.body, "W12:OPS-GRANTS:BEGIN", "W12:OPS-GRANTS:END");

        it("carries the sentinels the migration's guard slices on", () => {
            expect(adminRegion).not.toBeNull();
            expect(opsRegion).not.toBeNull();
        });

        it("carries the historical catalog literal forward without narrowing it", () => {
            /*
             * The two lists inside the function are no longer the same list, and the change is the
             * point of the completeness migration.
             *
             * The catalog literal is a REPRODUCTION of what `permission_definitions` held on
             * 2026-07-29, carried unchanged through W-12 into the current definition. Narrowing it is
             * W-11/M5 and belongs to the operator review that owns the deletion list, so it must
             * survive here byte-for-byte rather than being trimmed to whatever the seed grants.
             *
             * The admin enumeration is the WHOLE catalog, including the keys later migrations added.
             * Requiring the two to be equal — which is what this assertion used to say — is what
             * froze the grant list at 57 while the catalog grew to 66, so the relationship asserted
             * now is containment in the one direction that can be true: every key the function seeds
             * into the catalog is a key it grants the administrator.
             */
            const admin = new Set(keyLiterals(adminRegion!));
            const catalog = [...new Set(catalogLiteral)].sort();
            expect(catalog.length).toBe(57);
            expect(admin.size).toBeGreaterThan(catalog.length);
            expect(catalog.filter((k) => !admin.has(k))).toEqual([]);
        });

        it("grants ops the same set less the two keys the blanket withheld", () => {
            const admin = new Set(keyLiterals(adminRegion!));
            const ops = keyLiterals(opsRegion!).sort();
            expect(ops.length).toBe(admin.size - OPS_WITHHELD.length);
            for (const withheld of OPS_WITHHELD) {
                expect(admin.has(withheld)).toBe(true);
                expect(ops).not.toContain(withheld);
            }
            expect([...admin].filter((k) => !ops.includes(k)).sort()).toEqual([...OPS_WITHHELD].sort());
        });

        it("grants the administrator every capability the tree catalogues — no exceptions", () => {
            /*
             * THE ONE ASSERTION THAT WOULD HAVE PREVENTED THE DEFECT, and it is stated with no
             * exception list on purpose.
             *
             * It used to carry one — `health.view` and `health.manage` were excused as "keys seeded
             * later by an approved decision", legitimately absent from a historical literal. That
             * excuse is what made the assertion unable to notice the next seven. An exception list on
             * a completeness check is a list of the failures it has agreed not to see, and this one
             * grew until an organization's administrator could not open Financials.
             *
             * Organization Administrator administers the tenant. That contract is not a comment
             * anywhere; it is this line. A key added to the catalog with no home in the admin
             * enumeration fails here, in the repository, on the commit that adds it — which is the
             * only place the failure is cheap. The alternative is what happened: nine one-shot
             * backfills, an administrator whose capabilities depend on the date their org row was
             * created, and an operator discovering it by being refused.
             *
             * Cross-instrument by construction: `discoverCatalog` reads the migration tree by region
             * and this reads the function's sentinelled enumeration. Two independent methods, one
             * answer.
             */
            const discovered = [...discoverCatalog().keys()].sort();
            expect(discovered.length).toBeGreaterThan(60);
            expect(keyLiterals(adminRegion!).sort()).toEqual(discovered);
        });
    });

    describe("the migration's fail-closed guard", () => {
        const migration = readMigration(M6);

        it("aborts on any active catalog key the admin enumeration does not name", () => {
            expect(migration).toMatch(/pg_get_functiondef\('public\.seed_default_rbac\(uuid\)'::regprocedure\)/);
            expect(migration).toMatch(/FROM public\.permission_definitions pd\s+WHERE pd\.is_active = true/);
            expect(migration).toMatch(/RAISE EXCEPTION\s+'W-12\/M6 ABORT: % of % active catalog key/);
        });

        it("slices the function by sentinels the function actually carries", () => {
            const live = liveFunctionDefinition("seed_default_rbac")!;
            for (const sentinel of [
                "W12:ADMIN-GRANTS:BEGIN",
                "W12:ADMIN-GRANTS:END",
                "W12:OPS-GRANTS:BEGIN",
                "W12:OPS-GRANTS:END",
            ]) {
                expect(migration).toContain(`strpos(v_src, '${sentinel}')`);
                expect(live.body).toContain(sentinel);
            }
        });

        it("refuses to leave an unsentinelled function installed", () => {
            expect(migration).toMatch(/does not carry the W-12 grant-enumeration sentinels/);
        });

        it("asserts the ops exclusion survives the rewrite", () => {
            // W-12's guard covers the pair the blanket withheld. The seven added since are asserted
            // by the migration that added them to the enumeration — checked separately below, so
            // neither guard can be quietly dropped in favour of the other.
            for (const withheld of ["admin.users.write", "admin.roles.write"]) {
                expect(migration).toContain(`'${withheld}'`);
            }
            expect(migration).toMatch(/the ops enumeration grants %, which the blanket it replaces explicitly withheld/);
        });

        it("the completeness migration re-runs the catalog check against the database it is applied to", () => {
            /*
             * W-12's guard was correct and it still could not prevent this: a check that runs once,
             * at its own apply, cannot notice a catalog that grows afterwards. So the property is
             * asserted in two places with different lifetimes — here, in the repository, on every
             * run; and inside the migration, against whichever database it lands on, at apply time.
             * Neither one alone was enough.
             *
             * It is asserted against `COMPLETENESS_GUARD` by name rather than against whatever
             * currently defines the function, and W-13 is why. A check that reads DATABASE state
             * aborts on state the repository does not produce: the shared certification database
             * carries `attendance.record.assigned_only`, active, granted to nobody, seeded by no
             * migration in this tree, because the attendance lane created it while exploring and
             * their merged migration (`20260911110000`) records that they deliberately did NOT put
             * it in the catalog. Requiring EVERY later redefinition to re-run that check makes one
             * lane's residue block every other lane's seed edit, and no edit to the blocked
             * migration can make the assertion true.
             *
             * So the two halves are split by what they read. The catalog-completeness check belongs
             * to the migration that owns the completeness contract, below. The guards that read the
             * FUNCTION — which every redefinition can satisfy, because every redefinition writes
             * it — are required of the live seed in the next test. The general property is not
             * weakened: it is asserted in this file, over the tree, on every commit.
             */
            const guard = readMigration(COMPLETENESS_GUARD);
            expect(guard).toMatch(/pg_get_functiondef\('public\.seed_default_rbac\(uuid\)'::regprocedure\)/);
            expect(guard).toMatch(/ACCESS-V2 ABORT: % of % active catalog key\(s\) are absent from the enumerated admin grant list/);
            // And the repair itself is asserted: no active system role may be left holding nothing.
            expect(guard).toMatch(/active system role\(s\) still hold no capability after the repair/);
        });

        it("and whichever migration defines the seed re-asserts the guards that read the function", () => {
            /*
             * These are the ones a redefinition cannot honestly skip. Reproducing a 66-key
             * enumeration in order to add one key to it is exactly the operation that drops a line
             * by accident, and an ops EXCLUSION is an absence — the kind of thing that comes back
             * silently. Both checks read `pg_get_functiondef`, so they are statements about the text
             * this migration itself installs, and they hold on any database.
             */
            const live = readMigration(LIVE_SEED);
            expect(live).toMatch(/pg_get_functiondef\('public\.seed_default_rbac\(uuid\)'::regprocedure\)/);
            expect(live).toMatch(/does not carry the grant-enumeration sentinels/);
            for (const withheld of OPS_WITHHELD) {
                expect(live, `${withheld} is withheld from ops but the migration does not assert it`).toContain(
                    `'${withheld}'`,
                );
            }
            expect(live).toMatch(/the ops enumeration grants %, which the migration that introduced each of those keys explicitly withheld from ops/);
        });

        it("wires the grant half to the org, the way the role half already was", () => {
            /*
             * The initiating defect in one line. `orgs_seed_default_role_definitions` has been an
             * AFTER INSERT trigger on `public.orgs` since Phase 0, so every organization gets its four
             * roles automatically. `seed_default_rbac` — the grants — had no trigger and no caller
             * anywhere in the tree except the local seed, which W-12's own inventory recorded and
             * nobody acted on. An org created by any other path therefore had roles and no
             * capabilities, and portal admission is a role literal that consults no grant, so its
             * administrator was admitted to the shell and refused by every surface that checks one.
             */
            const live = readMigration(LIVE_SEED);
            expect(live).toMatch(/CREATE TRIGGER orgs_seed_default_rbac\s+AFTER INSERT ON public\.orgs/);
            expect(live).toMatch(/perform public\.seed_default_rbac\(new\.id\)/);
        });
    });
});
