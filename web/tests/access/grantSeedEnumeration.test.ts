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

const M6 = "20260807170000_w12_seed_default_rbac_enumerated_grants.sql";

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

const OPS_WITHHELD = ["admin.users.write", "admin.roles.write"];

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

        it("is defined by M6", () => {
            expect(live).not.toBeNull();
            expect(live!.file).toBe(M6);
        });

        it("contains no blanket grant", () => {
            const inLive = statements.filter((s) => s.file === M6);
            expect(inLive.length).toBe(2);
            expect(inLive.map((s) => s.binding)).toEqual(["literal", "literal"]);
            expect(inLive.map((s) => s.boundingKeys.length)).toEqual([57, 55]);
        });

        it("reads the catalog only to narrow the enumeration, never to source it", () => {
            // The blanket carried `is_active = true`, and `is_active` shapes nothing else at
            // runtime — `resolveAdminAccessCore.fetchPermissionKeys` reads grant rows without
            // joining the catalog. Dropping it would widen. The distinction RL-8 draws is between
            // a catalog read that *decides* the key set and one that can only remove from a list
            // already fixed by literals.
            const inLive = statements.filter((s) => s.file === M6);
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

        it("grants admin exactly the function's own catalog literal", () => {
            const admin = keyLiterals(adminRegion!).sort();
            const catalog = [...new Set(catalogLiteral)].sort();
            expect(catalog.length).toBe(57);
            expect(admin.length).toBe(57);
            expect(admin).toEqual(catalog);
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

        it("agrees with the catalog W-11 discovers from the whole tree", () => {
            // Cross-instrument: the enumeration is pinned to a width a second, independent method
            // produced. W-11's non-vacuity guard could not tell 35 keys from 57; this can.
            /*
             * The seed function reproduces the catalog AS OF ITS OWN MIGRATION. Keys seeded later by
             * an approved decision (D-H6's health.view / health.manage, granted to admin in their
             * own migration) are legitimately absent from this literal — back-editing them into a
             * historical migration would rewrite what that migration did.
             */
            const POST_SEED_ADDITIONS = new Set(["health.view", "health.manage"]);
            const discovered = [...discoverCatalog().keys()]
                .filter((k) => !POST_SEED_ADDITIONS.has(k))
                .sort();
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
            for (const withheld of OPS_WITHHELD) {
                expect(migration).toContain(`'${withheld}'`);
            }
            expect(migration).toMatch(/the ops enumeration grants %, which the blanket it replaces explicitly withheld/);
        });
    });
});
