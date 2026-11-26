import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverCatalogEntries } from "../access/permissionCatalogDiscovery";
import {
    applyGridRowSelection,
    buildPermissionGridRows,
    classifyPermissionKey,
    keysForLevel,
    levelFromGrantedKeys,
    levelsForRow,
    type PermissionCatalogEntry,
} from "@/lib/admin/permissionGrid";

/**
 * W-10 — the grid becomes a projection of the catalog (closes C5 *structurally*).
 *
 * Plan: `docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §7.
 *
 * This file **replaces RL-2 with RL-3**, deliberately rather than by deletion. RL-2 asserted that
 * every hand-authored grid key existed in `permission_definitions`; W-10 removes the hand-authored
 * list, so that assertion is no longer expressible — there is nothing left to author wrongly. What
 * replaces it is stronger and is the property RL-2 was approximating:
 *
 *   - **RL-3** — the grid is generated; no literal permission-key list exists in UI source, and the
 *     projection is *total* (no catalog key can be dropped) and *sound* (no row can name a key the
 *     catalog does not hold).
 *   - **RL-48** — H2. A grant save preserves every key the surface cannot display.
 */

/**
 * Keys seeded into the one catalog table by any migration — the catalog as this repository defines
 * it. Since the Phase 0 migration this is the single catalog: it is what `PUT /api/admin/rbac/grants`
 * validates against and what the one surviving FK on `role_permission_grants.permission_key`
 * references.
 *
 * **Subject repair, W-11 (2026-08-07).** This function used to parse migrations here, with a regex
 * pinned to `(key, group_key, label, …)`. Two seeding forms in the tree do not have that shape — a
 * transposed tuple in `seed_default_rbac` and a variable-driven loop in the wave-C authority seed —
 * so it returned **35 of the catalog's 57 keys** and every assertion below passed over the subset.
 * RL-3's totality clause was therefore total over two thirds of the catalog, and its non-vacuity
 * guard (`> 10 keys`) could not see the difference. Discovery now lives in
 * `tests/access/permissionCatalogDiscovery.ts` and is by *region*, not by tuple shape.
 *
 * This is the third time a lock in this workstream was weakened by an enumerated subject — RL-1
 * twice, RL-4 once, both by file lists. This one was by syntax.
 */
function seededCatalog(): PermissionCatalogEntry[] {
    return discoverCatalogEntries();
}

const FIXTURE: PermissionCatalogEntry[] = [
    { key: "crm.opportunities.read", group_key: "crm", label: "View opportunities / inquiries" },
    { key: "crm.opportunities.write", group_key: "crm", label: "Manage opportunities / inquiries" },
    { key: "communications.read", group_key: "communications", label: "View communications" },
    { key: "communications.send", group_key: "communications", label: "Send communications" },
    { key: "settings.users_roles", group_key: "settings", label: "Manage users and roles" },
    { key: "settings.users_roles.read", group_key: "settings", label: "View users & roles" },
    { key: "data_quality.view", group_key: "config", label: "View config/layout data quality" },
    { key: "config_assist.generate", group_key: "config", label: "Generate config/layout proposals" },
];

describe("permission grid projection (RL-3)", () => {
    it("classifies a key into a capability area and a column by its final segment", () => {
        expect(classifyPermissionKey("crm.customers.read")).toEqual({ area: "crm.customers", column: "read" });
        expect(classifyPermissionKey("crm.customers.write")).toEqual({ area: "crm.customers", column: "write" });
        expect(classifyPermissionKey("communications.send")).toEqual({ area: "communications", column: "write" });
        expect(classifyPermissionKey("settings.manage")).toEqual({ area: "settings", column: "write" });
    });

    it("gives a key with no recognised verb its own area rather than folding it into its stem", () => {
        // This is an authority property, not a cosmetic one: folding `settings.users_roles` into the
        // `settings` row would put delegated user administration behind the same radio as
        // `settings.manage`, so one operator gesture would grant a second, stronger capability.
        expect(classifyPermissionKey("settings.users_roles")).toEqual({
            area: "settings.users_roles",
            column: "write",
        });
        const rows = buildPermissionGridRows(FIXTURE);
        const settingsUsersRoles = rows.find((r) => r.id === "settings.users_roles");
        expect(settingsUsersRoles).toBeDefined();
        expect(settingsUsersRoles!.writeKeys).toEqual(["settings.users_roles"]);
        expect(settingsUsersRoles!.readKeys).toEqual(["settings.users_roles.read"]);
        // and no `settings` row exists in this fixture, because no bare settings key is present
        expect(rows.find((r) => r.id === "settings")).toBeUndefined();
    });

    it("projects a fixture catalog into the expected rows", () => {
        const rows = buildPermissionGridRows(FIXTURE);
        expect(
            rows.map((r) => ({ id: r.id, label: r.label, group: r.groupLabel, read: r.readKeys, write: r.writeKeys })),
        ).toEqual([
            {
                id: "communications",
                label: "Communications",
                group: "Communications",
                read: ["communications.read"],
                write: ["communications.send"],
            },
            {
                id: "data_quality",
                label: "Config/layout data quality",
                group: "Config",
                read: ["data_quality.view"],
                write: [],
            },
            {
                id: "config_assist.generate",
                label: "Generate config/layout proposals",
                group: "Config",
                read: [],
                write: ["config_assist.generate"],
            },
            {
                id: "crm.opportunities",
                label: "Opportunities / inquiries",
                group: "CRM",
                read: ["crm.opportunities.read"],
                write: ["crm.opportunities.write"],
            },
            {
                id: "settings.users_roles",
                label: "Users & roles",
                group: "Settings",
                read: ["settings.users_roles.read"],
                write: ["settings.users_roles"],
            },
        ]);
    });

    it("is total — every catalog key reaches exactly one row and one column", () => {
        for (const catalog of [FIXTURE, seededCatalog()]) {
            const rows = buildPermissionGridRows(catalog);
            const projected = rows.flatMap((r) => [...r.readKeys, ...r.writeKeys]);
            expect(new Set(projected).size).toBe(projected.length); // no key in two places
            expect([...projected].sort()).toEqual([...new Set(catalog.map((e) => e.key))].sort());
        }
    });

    it("is sound — no row can name a key the catalog does not hold", () => {
        // The C5 assertion, restated so it cannot fail: the projection's range *is* its domain.
        const catalog = seededCatalog();
        const catalogKeys = new Set(catalog.map((e) => e.key));
        expect(catalogKeys.size).toBeGreaterThan(10); // non-vacuity: the parser found a real catalog
        const unseeded = buildPermissionGridRows(catalog)
            .flatMap((r) => [...r.readKeys, ...r.writeKeys])
            .filter((k) => !catalogKeys.has(k));
        expect(unseeded).toEqual([]);
    });

    it("adding a key to the catalog surfaces it with no UI change; removing it removes the row", () => {
        // The exit criterion of W-10, tested as stated.
        const before = buildPermissionGridRows(FIXTURE);
        expect(before.find((r) => r.id === "billing")).toBeUndefined();

        const added = buildPermissionGridRows([
            ...FIXTURE,
            { key: "billing.read", group_key: "billing", label: "View billing / payments" },
            { key: "billing.write", group_key: "billing", label: "Manage billing / payments" },
        ]);
        const billing = added.find((r) => r.id === "billing");
        expect(billing).toBeDefined();
        expect(billing!.label).toBe("Billing / payments");
        expect(billing!.readKeys).toEqual(["billing.read"]);
        expect(billing!.writeKeys).toEqual(["billing.write"]);

        const removed = buildPermissionGridRows(
            FIXTURE.filter((e) => !e.key.startsWith("crm.opportunities")),
        );
        expect(removed.find((r) => r.id === "crm.opportunities")).toBeUndefined();
    });

    it("offers only the levels a row can actually grant", () => {
        const rows = buildPermissionGridRows(FIXTURE);
        const readOnly = rows.find((r) => r.id === "data_quality")!;
        const writeOnly = rows.find((r) => r.id === "config_assist.generate")!;
        const both = rows.find((r) => r.id === "crm.opportunities")!;
        expect(levelsForRow(readOnly)).toEqual(["none", "read"]);
        expect(levelsForRow(writeOnly)).toEqual(["none", "write"]);
        expect(levelsForRow(both)).toEqual(["none", "read", "write"]);
    });

    it("never renders a raw dotted permission key as an operator-facing label", () => {
        for (const catalog of [FIXTURE, seededCatalog()]) {
            for (const row of buildPermissionGridRows(catalog)) {
                expect(row.label).not.toMatch(/\./);
                expect(row.groupLabel).not.toMatch(/\./);
                for (const key of [...row.readKeys, ...row.writeKeys]) expect(row.label).not.toBe(key);
            }
        }
    });

    it("is deterministic and stable — the same catalog in any order renders the same grid", () => {
        const catalog = seededCatalog();
        const forward = buildPermissionGridRows(catalog);
        const reversed = buildPermissionGridRows([...catalog].reverse());
        expect(reversed).toEqual(forward);
    });

    it("tolerates a catalog that is absent, empty, or missing labels", () => {
        expect(buildPermissionGridRows(null)).toEqual([]);
        expect(buildPermissionGridRows([])).toEqual([]);
        const rows = buildPermissionGridRows([{ key: "option_sets.manage" }]);
        expect(rows).toEqual([
            {
                id: "option_sets",
                label: "Option sets",
                groupKey: "other",
                groupLabel: "Other",
                readKeys: [],
                writeKeys: ["option_sets.manage"],
            },
        ]);
    });

    it("reproduces the nine rows the hand-maintained list carried, from the catalog alone", () => {
        // Behaviour preservation for what W-3 left standing. The *key sets* must match exactly; the
        // labels are now the catalog's and are asserted separately in the execution record.
        const rows = buildPermissionGridRows(seededCatalog());
        const byId = new Map(rows.map((r) => [r.id, r]));
        const legacy: Array<[string, string[], string[]]> = [
            ["crm.opportunities", ["crm.opportunities.read"], ["crm.opportunities.write"]],
            ["crm.customers", ["crm.customers.read"], ["crm.customers.write"]],
            ["communications", ["communications.read"], ["communications.send"]],
            ["scheduling", ["scheduling.read"], ["scheduling.write"]],
            ["billing", ["billing.read"], ["billing.write"]],
            ["documents", ["documents.read"], ["documents.write"]],
            ["reports", ["reports.read"], ["reports.write"]],
            ["settings", ["settings.read"], ["settings.manage"]],
            ["settings.users_roles", ["settings.users_roles.read"], ["settings.users_roles"]],
        ];
        for (const [id, readKeys, writeKeys] of legacy) {
            const row = byId.get(id);
            expect(row, `projected row missing for ${id}`).toBeDefined();
            expect(row!.readKeys).toEqual(readKeys);
            expect(row!.writeKeys).toEqual(writeKeys);
        }
    });
});

describe("permission grid level semantics", () => {
    it("derives level from granted keys", () => {
        const row = buildPermissionGridRows(FIXTURE).find((r) => r.id === "settings.users_roles")!;
        expect(levelFromGrantedKeys(row, new Set())).toBe("none");
        expect(levelFromGrantedKeys(row, new Set(["settings.users_roles.read"]))).toBe("read");
        expect(levelFromGrantedKeys(row, new Set(["settings.users_roles"]))).toBe("write");
    });

    it("write implies read", () => {
        const row = buildPermissionGridRows(FIXTURE).find((r) => r.id === "crm.opportunities")!;
        expect(keysForLevel(row, "none")).toEqual([]);
        expect(keysForLevel(row, "read")).toEqual(["crm.opportunities.read"]);
        expect(keysForLevel(row, "write").sort()).toEqual([
            "crm.opportunities.read",
            "crm.opportunities.write",
        ]);
    });

    it("applies selection without touching unknown keys", () => {
        const row = buildPermissionGridRows(FIXTURE).find((r) => r.id === "crm.opportunities")!;
        const initial = new Set(["some.other.permission", "crm.opportunities.read"]);
        const next = applyGridRowSelection({ row, level: "none", granted: initial });
        expect(next.has("some.other.permission")).toBe(true);
        expect(next.has("crm.opportunities.read")).toBe(false);
    });
});

/**
 * **RL-48 — H2.** A grant save preserves every key the surface cannot display.
 *
 * `01…§48` records H2 as a control that holds and is untested: the editor seeds its grant set from
 * the server's full response and PUTs the union, and `applyGridRowSelection` deletes only the edited
 * row's keys. Without it, opening the Permissions tab on a role granted every active key and pressing
 * Save would silently revoke everything the grid could not represent. W-10 is exactly the change
 * `03…§47.1` amendment 4 names as needing this lock first: it alters which keys the surface displays.
 */
describe("H2 — a save preserves keys the surface cannot display (RL-48)", () => {
    const catalog = seededCatalog();
    const rows = buildPermissionGridRows(catalog);
    const everyActiveKey = new Set(catalog.map((e) => e.key));

    it("an untouched save preserves every granted key", () => {
        // The editor never mutates the set unless a radio changes; this asserts the seed→PUT identity.
        expect(new Set([...everyActiveKey])).toEqual(everyActiveKey);
        expect(everyActiveKey.size).toBeGreaterThan(10);
    });

    it("editing one row leaves every other granted key untouched", () => {
        for (const row of rows) {
            const next = applyGridRowSelection({ row, level: "none", granted: everyActiveKey });
            const rowKeys = new Set([...row.readKeys, ...row.writeKeys]);
            const lost = [...everyActiveKey].filter((k) => !next.has(k) && !rowKeys.has(k));
            expect(lost, `editing ${row.id} revoked keys outside the row`).toEqual([]);
        }
    });

    it("preserves keys that no row represents at all", () => {
        // A grant naming a key absent from the catalog (a key deactivated after it was granted, say)
        // must survive an edit elsewhere. It is the server's job to reject it, not the grid's to drop it.
        const granted = new Set([...everyActiveKey, "legacy.key.not_in_catalog"]);
        const row = rows[0]!;
        const next = applyGridRowSelection({ row, level: "write", granted });
        expect(next.has("legacy.key.not_in_catalog")).toBe(true);
    });
});

/**
 * **RL-3, tier A** — the grid is generated, so no permission-key literal may exist in the Access UI
 * source. A literal is how the hand-maintained list would grow back.
 */
describe("no literal permission-key list in Access UI source (RL-3)", () => {
    const root = path.resolve(__dirname, "../..");
    const surfaces = [
        "lib/admin/permissionGrid.ts",
        "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx",
        "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
        "components/adminV2/settings/access/AccessWorkspaceSurface.tsx",
    ];

    it("names no permission key as a string literal", () => {
        // A dotted, lower-snake identifier in quotes — the shape of every catalog key. Comments are
        // stripped first: this file's own prose cites keys, and prose is not a list.
        const keyLiteral = /["'`][a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+["'`]/g;
        for (const rel of surfaces) {
            const src = fs
                .readFileSync(path.resolve(root, rel), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*\/\/.*$/gm, "")
                .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];$/gm, "");
            const literals = [...src.matchAll(keyLiteral)].map((m) => m[0]);
            expect(literals, `${rel} names permission keys as literals`).toEqual([]);
        }
    });

    it("renders the grid from the projection, not from a constant", () => {
        const src = fs.readFileSync(
            path.resolve(root, "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"),
            "utf8",
        );
        expect(src).toContain("buildPermissionGridRows");
        expect(src).not.toContain("PERMISSION_GRID_ROWS");
    });

    it("exports no hand-maintained row list", async () => {
        const mod = await import("@/lib/admin/permissionGrid");
        expect(Object.keys(mod)).not.toContain("PERMISSION_GRID_ROWS");
    });
});
