/**
 * W-62 (`RL-47`) — the layer enumeration, graded rather than argued.
 *
 * §45.3: *"'Four layers' is met when a single declared enumeration of the resolution layers exists in
 * code, the resolver reads no store absent from it, and a check fails when a ninth appears."* §47's
 * exit: *"'Four layers' is a graded claim rather than an argued one."* This is the grader.
 *
 * **Bidirectional, because one direction is worthless.** A mapping that only proved "every declared
 * entry is real" would pass while the resolver quietly grew an eighth store; one that only proved
 * "every read is declared" would pass while the model invented a layer nothing backs. Both
 * directions are asserted, plus the two shapes that make either direction vacuous.
 *
 * **Mechanism-aware, not string-aware.** The resolver's reads are DISCOVERED by scanning its source
 * with comments stripped, so neither this file's prose nor the resolver's own doc comments can
 * satisfy the check. That is `RL-41`'s lesson and the public-form lock's: this program has now
 * convicted correct code for its own comment text three times and, once, passed a lock because the
 * matched string was a TYPE UNION rather than the refusal it described. A scan that reads prose is
 * not evidence.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    AUTHORITY_LAYERS,
    AUTHORITY_SOURCES,
    canonicalSources,
    canonicalStoresForLayer,
    compatibilitySources,
    declaredStores,
    type AuthorityLayer,
} from "@/lib/admin/authorityLayers";

const webRoot = join(__dirname, "..", "..");

/**
 * The modules that ARE the authority resolver. Enumerated deliberately and asserted to exist; the
 * subject inside each is discovered. An enumerated ROOT with a discovered interior is the shape
 * `W-5`'s lesson allows — what it forbids is an enumerated interior, which is what rotted RL-1 twice.
 */
const RESOLVER_MODULES = [
    "lib/admin/resolveAdminAccessCore.ts",
    "lib/admin/resolveAdminPortalOrgCore.ts",
] as const;

/** Source with comments stripped — prose must not be able to satisfy or defeat the scan. */
function executableSource(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

/** Every table the resolver actually reads, discovered from `.from("…")` in executable source. */
function resolverReadStores(modules: readonly string[] = RESOLVER_MODULES): string[] {
    const found = new Set<string>();
    for (const rel of modules) {
        for (const [, table] of executableSource(rel).matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
            found.add(table);
        }
    }
    return [...found].sort();
}

describe("W-62 / AD-25 — the four-layer model is total in both directions", () => {
    it("the enumeration declares exactly four layers", () => {
        expect([...AUTHORITY_LAYERS]).toEqual(["membership", "role", "capability", "scope"]);
    });

    it("the scan finds the resolver's reads at all — non-vacuity on the WALK", () => {
        // If the regex or the module list drifted, every assertion below would pass by agreeing with
        // nothing. Asserted before the mapping, not after.
        // W-20 removed two stores from this resolver (`user_profiles`, `app_users`), so the floor
        // moved from six to four. It is still a floor and not an equality: the point is that the
        // walk finds SOMETHING, and pinning the exact count would make every future read a test
        // edit rather than a fact about coverage.
        const stores = resolverReadStores();
        expect(stores.length).toBeGreaterThanOrEqual(4);
        expect(stores).toContain("user_roles");
        expect(stores).toContain("role_permission_grants");
    });

    /* ------------------------------------------------- direction 1: reads → model */

    it("every store the resolver reads is mapped by the model", () => {
        const unmapped = resolverReadStores().filter((s) => !declaredStores().includes(s));
        expect(
            unmapped,
            "a resolver read with no entry in AUTHORITY_SOURCES is an unclassified authority input — "
                + "add it to the layer it serves, or classify it as compatibility",
        ).toEqual([]);
    });

    /* ------------------------------------------------- direction 2: model → reads */

    it("every store the model declares is actually read by the resolver", () => {
        const reads = resolverReadStores();
        const phantom = declaredStores().filter((s) => !reads.includes(s));
        expect(
            phantom,
            "a declared source the resolver does not read is a model describing a system that does not "
                + "exist — the failure mode a one-directional check cannot see",
        ).toEqual([]);
    });

    it("every canonical layer is backed by at least one real store — no invented layer", () => {
        for (const layer of AUTHORITY_LAYERS) {
            const backing = canonicalStoresForLayer(layer);
            expect(backing.length, `layer "${layer}" has no canonical backing store`).toBeGreaterThan(0);
            // And that backing must be a store the resolver genuinely reads.
            for (const store of backing) {
                expect(resolverReadStores(), `layer "${layer}" cites ${store}, which is not read`).toContain(store);
            }
        }
    });

    /* ------------------------------------- conceptual grouping vs physical storage */

    it("more physical stores than layers — the model does not claim otherwise", () => {
        // AD-25's central point. If these ever became equal by someone trimming the source list to
        // make the count tidy, that is the untruthful grouping the decision forbids.
        expect(resolverReadStores().length).toBeGreaterThan(AUTHORITY_LAYERS.length);
    });

    it("scope is one layer over several stores, not several layers", () => {
        const scope = canonicalStoresForLayer("scope");
        expect(scope.length).toBeGreaterThan(1);
        expect(scope).toEqual(["user_access_profiles", "user_department_access", "user_site_access"]);
    });

    it("one store may serve two layers, and user_roles does", () => {
        // Membership is the row's existence; Role is its `role` column. Forcing this into one layer
        // would be tidier and false.
        const purposes = AUTHORITY_SOURCES.filter((s) => s.store === "user_roles");
        expect(purposes.map((p) => p.layer).sort()).toEqual(["membership", "role"]);
        expect(purposes.find((p) => p.layer === "role")?.column).toBe("role");
    });

    /* ------------------------------------------------------ fallback, not a layer */

    it("a compatibility source, if one ever returns, is never a fifth layer", () => {
        // The list is empty since W-20. The RULE is kept and stated over whatever the list holds,
        // because deleting it with its last member would mean the next compatibility source added
        // arrives with nothing constraining it — and the constraint, not the membership, is what
        // AD-25 needs: a fallback names the canonical layer it feeds and never becomes one.
        const fallback = compatibilitySources();
        for (const s of fallback) {
            expect(AUTHORITY_LAYERS).toContain(s.layer);
            expect(canonicalStoresForLayer(s.layer)).not.toContain(s.store);
        }
        // And the model has not grown a layer to house what was removed.
        expect(AUTHORITY_LAYERS).toHaveLength(4);
    });

    it("the fallback is GONE, and the model is empty of it rather than quietly reclassifying it", () => {
        // This assertion used to read the other way: the fallback was live, the two stores were
        // listed as `compatibility`, and the note here said *"when its removal half lands, these
        // reads disappear and direction 2 will fail until the entries are deleted — which is
        // exactly the intended coupling."* W-20 landed, and the coupling worked as designed.
        //
        // Both halves are asserted, because either alone can be satisfied dishonestly: an empty
        // `compatibilitySources()` with the reads still in the resolver would be a model that lies,
        // and reads removed while the entries remained would be a model that is merely stale.
        const src = executableSource("lib/admin/resolveAdminAccessCore.ts");
        expect(src).not.toMatch(/\.from\(\s*["'`]user_profiles["'`]\s*\)/);
        expect(src).not.toMatch(/\.from\(\s*["'`]app_users["'`]\s*\)/);
        expect(compatibilitySources()).toEqual([]);
    });

    it("no authority-path module reads a legacy identity store — RL-12, over every module", () => {
        // `M2-5` is why this is stated over the tree and not over one file: `resolveAdminPortalOrgCore`
        // re-implemented the fallback and served `requireAdminOrOps` across 147 route files, so
        // deleting it from the enforcing resolver alone would have left the copy granting.
        const LEGACY_STORES = ["user_profiles", "app_users"];
        const offenders: string[] = [];
        for (const rel of ["lib/admin/resolveAdminAccessCore.ts", "lib/admin/resolveAdminPortalOrgCore.ts"]) {
            const src = executableSource(rel);
            for (const store of LEGACY_STORES) {
                if (src.includes(`.from("${store}")`) || src.includes(`.from('${store}')`)) {
                    offenders.push(`${rel}: ${store}`);
                }
            }
        }
        expect(offenders, "one principal source — a second one is a fifth layer under another name").toEqual([]);
    });

    it("that scan can convict — it finds the read that IS there", () => {
        // Non-vacuity: both modules still read `user_roles`, so the `.from(...)` shape the scan
        // looks for is present and the empty result above is a fact about the legacy stores rather
        // than about the matcher.
        for (const rel of ["lib/admin/resolveAdminAccessCore.ts", "lib/admin/resolveAdminPortalOrgCore.ts"]) {
            expect(executableSource(rel), rel).toContain('.from("user_roles")');
        }
    });

    /* ------------------------------------------------------------ composition */

    it("role and scope are siblings — neither is derived from the other", () => {
        // `I-20`/`C8`, the invariant W-8 restored by deleting the bypass that let a role widen a
        // scope dimension. Asserted structurally: no scope store is classified under the role layer,
        // and no role store under scope.
        const roleStores = canonicalStoresForLayer("role");
        const scopeStores = canonicalStoresForLayer("scope");
        expect(roleStores.some((s) => scopeStores.includes(s))).toBe(false);
        // And the resolver must not fold one into the other: the deleted bypass is gone.
        const src = executableSource("lib/admin/resolveAdminAccessCore.ts");
        expect(src).not.toMatch(/portalAdminBypassesDepartmentScope\s*\(/);
    });

    it("capability is resolved from role, not from a role literal at the gate", () => {
        // W-13's outcome, expressed as a layer property: the capability layer's store is what the
        // gate reads. `canManageUsersAndRoles` reading a role literal was the fifth-layer instance.
        const gate = executableSource("lib/admin/canManageUsersAndRoles.ts");
        expect(gate).toMatch(/permissionKeys/);
        expect(gate, "a role literal at the gate is the fifth layer AD-25 refuses").not.toMatch(
            /roleKeys\s*\.\s*includes\(\s*["'`]admin["'`]\s*\)/,
        );
    });

    /* ------------------------------------------------------------- non-vacuity */

    it("bites: a resolver source absent from the model is convicted", () => {
        // Direction 1 must be able to fail. Fed a fabricated read set rather than asserted in prose.
        const withNewStore = [...resolverReadStores(), "some_new_authority_table"];
        const unmapped = withNewStore.filter((s) => !declaredStores().includes(s));
        expect(unmapped).toEqual(["some_new_authority_table"]);
    });

    it("bites: a model entry with no resolver read is convicted", () => {
        // Direction 2 must be able to fail.
        const declaredPlusPhantom = [...declaredStores(), "table_nobody_reads"];
        const phantom = declaredPlusPhantom.filter((s) => !resolverReadStores().includes(s));
        expect(phantom).toEqual(["table_nobody_reads"]);
    });

    it("bites: an invented layer with no backing store is convicted", () => {
        const invented = "relationship" as AuthorityLayer;
        expect(canonicalStoresForLayer(invented)).toEqual([]);
    });

    it("the scan reads CODE, not comments — a mentioned table does not count as a read", () => {
        // The lesson this program has now paid for four times. A doc comment naming a table must not
        // register as a read, or the enumeration could be satisfied by writing prose about a store
        // nobody queries.
        // Proved on the SCANNER, against an input built for the purpose, rather than by guessing
        // what the resolver's comments happen to say. An earlier version of this test asserted the
        // real file contained a comment naming `user_roles` — it does not, and the test failed for a
        // reason that had nothing to do with the property. The property is about the scanner.
        const fixture = [
            "/** reads `pretend_authority_table` when the moon is full */",
            "// also mentions another_pretend_table in a line comment",
            'const real = await supabase.from("user_roles").select("*");',
        ].join("\n");
        const strippedFixture = fixture
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/^\s*\/\/.*$/gm, " ");
        const found = [...strippedFixture.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)].map((m) => m[1]);
        expect(found, "only the executed read counts").toEqual(["user_roles"]);
        expect(strippedFixture).not.toContain("pretend_authority_table");
        expect(strippedFixture).not.toContain("another_pretend_table");

        // And on the real file the strip is not a no-op: it removes content.
        const raw = readFileSync(join(webRoot, "lib/admin/resolveAdminAccessCore.ts"), "utf8");
        expect(executableSource("lib/admin/resolveAdminAccessCore.ts").length).toBeLessThan(raw.length);
    });

    it("every source carries a stated reason, and reasons are not matched by any assertion", () => {
        for (const s of AUTHORITY_SOURCES) {
            expect(s.why.trim().length, `${s.store}/${s.layer} has no substantive reason`).toBeGreaterThan(60);
        }
        // Stated so it is not mistaken for evidence: `why` is read by a human. Every assertion above
        // is over structure or over discovered source, never over this text.
        expect(canonicalSources().length + compatibilitySources().length).toBe(AUTHORITY_SOURCES.length);
    });
});
