import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    PERMISSION_KEY_GRAMMAR,
    REPO_ROOT,
    discoverCatalog,
    scanEnforcement,
} from "./permissionCatalogDiscovery";

/**
 * **W-11 — one vocabulary (C4).** Plan:
 * `docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §7.
 *
 * This suite is **not a registered regression lock**, and that is deliberate. `03…§33.1`/`DR-12` of the
 * product-source copy settles who may mint one: *"by the Director rather than by a worker appending to
 * §25 — which is how `X-1` happened."* No `RL-` number in either register belongs to W-11 — `RL-35`
 * ("every catalog key resolves to ≥1 enforcement site") is `W-50`'s and cannot be green until W-11's
 * deletions apply. So this file is the **instrument** for W-11's exit artifact and for `RL-35` later:
 * it holds the measurement steady so the enumerated deletion list cannot drift away from the tree it
 * was derived from, and it fails if either side of the reconciliation moves.
 *
 * Three things are asserted, in descending strength:
 *
 *   1. **The catalog is discovered completely** — the width matches the count the Phase 0 migration
 *      independently measured against the shared database, and every seeding syntax in the tree is
 *      reached. This is the clause that would have caught the defect described in
 *      `permissionCatalogDiscovery.ts`: a parser pinned to one `INSERT` shape saw 35 of 57 keys.
 *   2. **The reconciliation is exactly the artifact** — the enforced and unenforced sets equal the ones
 *      enumerated in `w11-catalog-reconciliation.json`, in both directions. A key that gains or loses
 *      its last enforcement site fails here, so the operator's review list stays true to the tree.
 *   3. **The one uncatalogued permission key is still the only one.** `communications.send.emergency`
 *      is declared as a permission key in code, written into the enqueue record as the permission the
 *      send was made under, and held by nobody — it has no catalog row and nothing binds it to the
 *      resolved permission set.
 */

const ARTIFACT_PATH = path.join(
    REPO_ROOT,
    "docs/platform/planning/vacilando-os/qa/access-identity-v2/w11-catalog-reconciliation.json",
);

type Artifact = {
    catalog_width: number;
    enforced: Array<{ key: string; sites: string[] }>;
    deletion_candidates: string[];
    addition_candidates: Array<{ key: string; sites: string[] }>;
    discovery: { keys_missed_by_pinned_parser: string[] };
};

const artifact: Artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
const artifactEnforced = artifact.enforced.map((e) => e.key);

/**
 * Keys added by an APPROVED decision after the W-11 artifact was recorded.
 *
 * The lock's purpose is that nothing widens the catalog SILENTLY, not that the catalog can never
 * widen. Each entry names the decision that authorized it, so an unapproved addition still fails —
 * it simply will not be in this list.
 */
const APPROVED_ADDITIONS: Record<string, string> = {
    "health.view": "D-H6 — structured health visibility boundary",
    "health.manage": "D-H6 — structured health mutation boundary",
};

describe("W-11 — the catalog is discovered completely", () => {
    const catalog = discoverCatalog();

    it("finds the full catalog, not the subset a tuple-shaped parser reaches", () => {
        // 57 is not a number chosen here. The Phase 0 migration measured the shared database on
        // 2026-07-29 and recorded it in its own comment before writing the literal that reproduces it;
        // this derivation from the migration tree arrives at the same width independently.
        const added = Object.keys(APPROVED_ADDITIONS).filter((k) => catalog.has(k));
        expect(catalog.size).toBe(artifact.catalog_width + added.length);
        expect(catalog.size).toBe(57 + added.length);
    });

    it("every key beyond the W-11 artifact is one an approved decision added", () => {
        // The discovery lock still bites: a key seeded without a recorded decision fails here.
        const artifactKeys = new Set([
            ...artifactEnforced,
            ...artifact.deletion_candidates,
            ...artifact.addition_candidates.map((a) => a.key),
        ]);
        const unexplained = [...catalog.keys()].filter(
            (k) => !artifactKeys.has(k) && !(k in APPROVED_ADDITIONS),
        );
        expect(unexplained).toEqual([]);
    });

    it("reaches every seeding syntax in the tree, including the two the pinned parser could not", () => {
        // Transposed columns — `seed_default_rbac` writes (key, label, group_key, description).
        expect(catalog.get("fin.read")?.seededBy).toContain(
            "20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql",
        );
        // Variable-driven — the wave-C loop's INSERT carries `k`, not a literal.
        expect(catalog.get("operational_expectations.authority.assign")?.seededBy).toContain(
            "20260722000000_operational_expectations_authority_model_p1_wave_c.sql",
        );
        // Canonical literal tuples still resolve, with their seeding migration named.
        expect(catalog.get("settings.users_roles")?.seededBy).toContain(
            "20260505120100_settings_users_roles_permission.sql",
        );
        // Approved post-artifact additions are excluded on the DISCOVERED side, so the artifact
        // comparison still detects anything else that appeared.
        expect([...catalog.keys()].filter((k) => !(k in APPROVED_ADDITIONS)).sort()).toEqual(
            [...artifactEnforced, ...artifact.deletion_candidates].sort(),
        );
    });

    it("records exactly the keys the pinned parser missed, so the correction cannot be forgotten", () => {
        const missed = new Set(artifact.discovery.keys_missed_by_pinned_parser);
        expect(missed.size).toBe(22);
        for (const key of missed) expect(catalog.has(key)).toBe(true);
    });

    it("admits only key-shaped literals — labels and group names are not keys", () => {
        for (const key of catalog.keys()) expect(key).toMatch(PERMISSION_KEY_GRAMMAR);
        expect(catalog.has("operations")).toBe(false);
        expect(catalog.has("Manage operational authorities")).toBe(false);
    });
});

describe("W-11 — catalog against enforcement, both directions", () => {
    const catalog = discoverCatalog();
    const scan = scanEnforcement(catalog.keys());

    it("scans a real product tree", () => {
        // Non-vacuity. RL-1 was defeated twice by a pinned subject and RL-4 once; an enforcement scan
        // that silently walked nothing would report every key as unenforced and read as a finding.
        expect(scan.fileCount).toBeGreaterThan(1000);
        expect(scan.sitesByKey.size).toBeGreaterThan(10);
    });

    it("the enforced set is exactly the artifact's, plus the approved additions", () => {
        const enforced = [...catalog.keys()].filter((k) => (scan.sitesByKey.get(k) ?? []).length > 0);
        const added = Object.keys(APPROVED_ADDITIONS).filter((k) => enforced.includes(k));
        expect(enforced.filter((k) => !(k in APPROVED_ADDITIONS)).sort()).toEqual(
            [...artifactEnforced].sort(),
        );
        // 21 until W-13/AD-22 gave `settings.users_roles.read` an enforcement site.
        expect(enforced.length).toBe(22 + added.length);
        /*
         * A health key that is SEEDED but not ENFORCED would be the D-H6 failure mode: the catalogue
         * would advertise a boundary the product does not apply. Both keys must have call sites.
         */
        expect(added.sort()).toEqual(Object.keys(APPROVED_ADDITIONS).sort());
    });

    it("the deletion list is exactly the catalog keys no product source names", () => {
        const unenforced = [...catalog.keys()].filter((k) => (scan.sitesByKey.get(k) ?? []).length === 0);
        expect(unenforced.sort()).toEqual([...artifact.deletion_candidates].sort());
        // 36 until W-13/AD-22 recovered `settings.users_roles.read` from the deletion list.
        expect(unenforced.length).toBe(35);
    });

    it("C13 resolves against the measurement: nothing enforces a workflows key", () => {
        // `01…§2.3`'s C13 — Phase 0 grants `ops.workflows.*` to every org's admin; W-3 removed the grid
        // row; W-10's projection returned it. The plan's M2 amendment binds the outcome to this
        // measurement: the row returns iff W-11 seeds a workflows key that something enforces. It does
        // not, so both keys are on the deletion list and the row goes with them — reached by
        // enumeration, not silently.
        expect(scan.sitesByKey.get("ops.workflows.read") ?? []).toEqual([]);
        expect(scan.sitesByKey.get("ops.workflows.write") ?? []).toEqual([]);
        expect(artifact.deletion_candidates).toContain("ops.workflows.read");
        expect(artifact.deletion_candidates).toContain("ops.workflows.write");
    });

    it("the one enforced key with no catalog row is still the only one", () => {
        const declared = [...scan.uncatalogued.entries()]
            .filter(([, sites]) => sites.some((s) => /communications|admin\/rbac|access/.test(s)))
            .map(([key]) => key)
            .filter((key) => key !== "communications.family_send"); // a `sourceCapability` label, not a key
        expect(declared).toEqual(["communications.send.emergency"]);
        expect(new Set(artifact.addition_candidates.map((a) => a.key))).toEqual(
            new Set(["communications.send.emergency"]),
        );
        // Its neighbour in the same helper resolves the other way, and only once the catalog is
        // discovered completely: `ops.messaging.write` is enforced as the legacy alias for
        // `communications.send`, and it *is* catalogued — but only by the seed literal the pinned
        // parser could not read. Under that parser it looked like a second uncatalogued key.
        expect(catalog.has("ops.messaging.write")).toBe(true);
        expect(scan.sitesByKey.get("ops.messaging.write")).toEqual([
            "web/lib/communications/communicationPermissions.ts",
        ]);
    });

    it("the uncatalogued emergency-send key is unreachable, not merely ungrantable", () => {
        // Adding a catalog row would not make it work: no production caller binds it. The key gates
        // `emergencyPermitted`, and every production path passes that flag as `false`. Wiring it to the
        // resolved permission set is W-15's, not W-11's — W-11 records that adding the row alone is
        // insufficient, so the addition is not read as a fix.
        const sources = ["web/lib/communications/send/canonicalSend.ts", "web/lib/communications/canonicalOutboundEnqueue.ts"];
        for (const rel of sources) {
            const source = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
            expect(source).not.toMatch(/emergencyPermitted:\s*true/);
        }
    });
});
