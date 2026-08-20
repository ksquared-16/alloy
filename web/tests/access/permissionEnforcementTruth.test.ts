/**
 * W-50 — no inert capability is presented as a control (`IA-R8`, `T-6`).
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * `05…§2.1`: **11 of 18 grantable keys are consulted by nothing; 4 of 9 grid rows are inert in both
 * columns.** `01…§14`'s `T-6` calls it *"revocation theatre"* — an operator sets a capability to
 * *None* and nothing changes. `IA-R8`: *"a grid row whose keys have no enforcement site MUST NOT
 * render as a setting."*
 *
 * **What this file is not.** The plan's `RL-35` is the stronger clause — *"every catalog key
 * resolves to ≥1 enforcement site"*, failing the build when a key loses its last one — and W-11's
 * own instrument records that it *"cannot be green until W-11's deletions apply."* Those deletions
 * are `OD-3`, an operator decision on 36 of 57 keys. This file locks the half that needs no
 * decision: **whichever keys are inert, the product must not offer them as controls.** When `OD-3`
 * lands and the catalog shrinks, the assertions here become trivially true and `RL-35` replaces
 * them; until then they are what stands between the operator and a screen full of dead switches.
 *
 * The property is a **join in both directions** against a fresh derivation from the tree. A list
 * that could only be wrong in one direction is the failure mode this program has paid for four
 * times: a key that gains its first enforcement site would stay greyed out forever, and a key that
 * loses its last would keep rendering as a live control. Neither can survive a run of this file.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { discoverCatalog, discoverCatalogEntries, scanEnforcement, REPO_ROOT } from "./permissionCatalogDiscovery";
import {
    UNENFORCED_PERMISSION_KEYS,
    buildPermissionGridRows,
    levelsForRow,
    offerableLevelsForRow,
    rowEnforcement,
    applyGridRowSelection,
    type PermissionCatalogEntry,
} from "@/lib/admin/permissionGrid";

const ARTIFACT_PATH = path.join(REPO_ROOT, "web/lib/admin/unenforcedPermissionKeys.json");
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8")) as { keys: string[] };

/** Catalog keys named by no product source on an executable line — derived, never listed. */
function deriveUnenforced(): string[] {
    const catalog = discoverCatalog();
    const scan = scanEnforcement(catalog.keys());
    // Non-vacuity, both sides. A discovery that found no catalog, or a scan that read no files,
    // would make the set difference empty and every assertion below pass over nothing.
    expect(catalog.size).toBeGreaterThan(20);
    expect(scan.fileCount).toBeGreaterThan(500);
    return [...catalog.keys()].filter((key) => (scan.sitesByKey.get(key) ?? []).length === 0).sort();
}

describe("W-50 — the inert set is derived from the tree, not remembered", () => {
    it("matches a fresh derivation exactly, in both directions", () => {
        const derived = deriveUnenforced();
        const recorded = [...artifact.keys].sort();

        const nowEnforced = recorded.filter((key) => !derived.includes(key));
        expect(
            nowEnforced,
            "these keys gained an enforcement site — remove them from web/lib/admin/unenforcedPermissionKeys.json " +
                "or the product will keep telling operators they are dead"
        ).toEqual([]);

        const newlyInert = derived.filter((key) => !recorded.includes(key));
        expect(
            newlyInert,
            "these catalog keys are consulted by nothing — add them to web/lib/admin/unenforcedPermissionKeys.json " +
                "or the grid will keep offering them as live controls"
        ).toEqual([]);

        expect(recorded).toEqual(derived);
    });

    it("names only keys the catalog actually holds", () => {
        const catalog = discoverCatalog();
        for (const key of artifact.keys) {
            expect(catalog.has(key), `${key} is marked inert but the catalog does not seed it`).toBe(true);
        }
    });

    it("is a strict subset — the platform enforces something", () => {
        // If every key were inert the product would render no control at all, and the assertions
        // above would still pass. This is the clause that notices.
        const catalog = discoverCatalog();
        expect(artifact.keys.length).toBeGreaterThan(0);
        expect(artifact.keys.length).toBeLessThan(catalog.size);
    });

    it("carries no permission-key literal into TypeScript under the scanned roots", () => {
        // The artifact is JSON precisely because `scanEnforcement` walks `.ts`/`.tsx` under
        // web/app, web/lib, web/components and web/scripts. A `.ts` copy of this list would give
        // all 36 keys an enforcement site and quietly empty the derived set — the artifact would
        // become the evidence for its own falsity, and the "both directions" test above would then
        // pass by agreeing with a list of nothing.
        expect(ARTIFACT_PATH.endsWith(".json")).toBe(true);
        const grid = fs
            .readFileSync(path.join(REPO_ROOT, "web/lib/admin/permissionGrid.ts"), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
            .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];$/gm, " ");
        expect([...grid.matchAll(/["'`][a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+["'`]/g)].map((m) => m[0])).toEqual([]);
    });
});

describe("W-50 · IA-R8 — an inert row is not a setting", () => {
    const catalog = discoverCatalogEntries();
    const rows = buildPermissionGridRows(catalog);

    it("offers no level whose keys nothing enforces", () => {
        for (const row of rows) {
            const offered = offerableLevelsForRow(row);
            for (const level of offered) {
                if (level === "none") continue;
                const keys = level === "read" ? row.readKeys : row.writeKeys;
                expect(
                    keys.some((key) => !UNENFORCED_PERMISSION_KEYS.has(key)),
                    `${row.id} offers "${level}" but every key in that column is inert`
                ).toBe(true);
            }
        }
    });

    it("actually removes controls — the change is not cosmetic", () => {
        // `05…§2.1` says 4 of 9 grid rows are inert in both columns. If this count were zero the
        // suite above would pass while the product still rendered every dead switch.
        const inert = rows.filter((row) => rowEnforcement(row).inert);
        expect(inert.length).toBeGreaterThan(3);
        for (const row of inert) {
            expect(offerableLevelsForRow(row)).toEqual(["none"]);
        }
        const narrowed = rows.filter(
            (row) => offerableLevelsForRow(row).length < levelsForRow(row).length && !rowEnforcement(row).inert
        );
        // Mixed rows exist too — the grain is the column, not the row. `documents.read` is enforced
        // and `documents.write` is not, so a row-level verdict would be wrong in both directions.
        expect(narrowed.length).toBeGreaterThan(0);
    });

    it("leaves the catalog projection untouched — W-10's property is not conditioned on enforcement", () => {
        // `levelsForRow` answers what the catalog can express and is what RL-3 locks; enforcement is
        // a second input and must not leak into it, or a fixture would project differently depending
        // on repository state.
        const fixture: PermissionCatalogEntry[] = [
            { key: "crm.opportunities.read", group_key: "crm", label: "View opportunities" },
            { key: "crm.opportunities.write", group_key: "crm", label: "Manage opportunities" },
        ];
        const row = buildPermissionGridRows(fixture)[0]!;
        expect(levelsForRow(row)).toEqual(["none", "read", "write"]);
        expect(offerableLevelsForRow(row)).toEqual(["none"]);
    });

    it("removing the control does not revoke the grant", () => {
        // The keys stay in the database. Hiding a switch must never be a silent write — H2 holds
        // because an absent control cannot fire `applyGridRowSelection` at all, and this asserts the
        // only path that could: an edit elsewhere.
        const inert = rows.find((row) => rowEnforcement(row).inert)!;
        const live = rows.find((row) => !rowEnforcement(row).inert)!;
        const granted = new Set([...inert.readKeys, ...inert.writeKeys, ...live.writeKeys]);
        const next = applyGridRowSelection({ row: live, level: "none", granted });
        for (const key of [...inert.readKeys, ...inert.writeKeys]) {
            expect(next.has(key), `editing ${live.id} revoked the inert grant ${key}`).toBe(true);
        }
    });
});

describe("W-50 — the surface states the condition rather than drawing a dead control", () => {
    const source = fs.readFileSync(
        path.join(REPO_ROOT, "web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"),
        "utf8"
    );

    it("renders rows from the enforced level set, never the raw one", () => {
        const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
        expect(code).toContain("offerableLevelsForRow(row)");
        // `levelsForRow` returning "read"/"write" for an inert column is correct, and that is
        // exactly why it must not reach the renderer. `\b` keeps the match off the qualified name.
        expect(code).not.toMatch(/\blevelsForRow\s*\(/);
    });

    it("marks an inert row with the platform's planned-capability discipline", () => {
        // `06…§4.10`: `data-capability="planned"` is this surface's best property. An inert
        // capability is unbuilt capability, so it uses the same marker rather than a new one.
        //
        // W-57 rewrote the row and this assertion had to be rewritten with it. It used to pin the
        // exact expression `data-capability={enforcement.inert ? …}`; the one-page editor computes
        // the same condition into a local (`enforcement.inert || offered.length <= 1`, which also
        // catches a row whose only offerable level is "none"). Pinning the spelling made a
        // *stricter* surface look like a regression. What W-50 actually owns is the property —
        // an unenforced row is marked, and it says so in words — so that is what is asserted, and
        // the condition is required to still be derived from `rowEnforcement` rather than authored.
        expect(source).toMatch(/data-capability=\{[^}]*"planned"[^}]*\}/);
        expect(source).toContain("rowEnforcement");
        expect(source).toContain("Not enforced");
    });

    it("does not list a granted-but-inert capability among the ones the role has", () => {
        // The Overview card this used to read is gone — W-57 folded the role's summary into its
        // header. The claim survives the merge and is now stronger, because it moved from a
        // rendering detail into the projection: `heldAuthorityAreas` excludes areas with no
        // enforced rows, so a role granted the whole catalog cannot read as able to do everything.
        // `roleAuthoritySummary.ts` is where that is now proved (`oneRoleEditorPage.test.ts`).
        expect(source).toContain("heldAuthorityAreas");
        expect(source).toContain("Not enforced");
        // And the editor still renders EVERY area, so excluding one from the headline is not
        // hiding it — the record stays visible even when the summary declines to claim it.
        expect(source).toContain("authorityAreas.map");
    });
});
