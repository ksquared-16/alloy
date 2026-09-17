/**
 * WHAT A NORMAL-MODE SELECTION ACTUALLY SAVES.
 *
 * The role editor computes the saved grant set from the loaded set through `applyGridRowSelection`
 * and `applyAreaPreset`; these are the functions between the radio and the row in
 * `role_permission_grants`, so this measures the write path rather than describing it.
 *
 * Two questions, both raised by the mounted audit and neither answered by it:
 *
 *   1. Does a PARTIAL row selection save exactly that, with no sibling riding along? The Enrollment
 *      split is the case that matters — records without decisions is the role an organization
 *      actually wants, and a silent `enrollment.decide` would be invisible to the administrator who
 *      granted it.
 *   2. What does the AREA preset do? Not to change it — that is a later Director decision — but so
 *      the decision is made against the concrete capability set rather than an impression.
 */
import { describe, expect, it } from "vitest";
import {
    applyAreaPreset,
    buildCapabilityMatrix,
    normalModeMatrix,
    type MatrixArea,
} from "@/lib/access/capabilityMatrix";
import {
    applyGridRowSelection,
    buildPermissionGridRows,
    levelFromGrantedKeys,
    type PermissionCatalogEntry,
} from "@/lib/admin/permissionGrid";

/** The catalog as the product seeds it, restricted to the families under test. */
const CATALOG: PermissionCatalogEntry[] = [
    { key: "portal.access", label: "Portal access", group_key: "portal" },
    { key: "enrollment.record.manage", label: "Manage Enrollment records", group_key: "enrollment" },
    { key: "enrollment.decide", label: "Make enrollment decisions", group_key: "enrollment" },
    { key: "enrollment.pricing.override", label: "Override recommended tuition", group_key: "enrollment" },
    { key: "enrollment.requirement_exception.manage", label: "Except Enrollment requirements", group_key: "enrollment" },
    { key: "business_process.configure", label: "Configure business processes", group_key: "business_process" },
    { key: "business_process.activate", label: "Activate business processes", group_key: "business_process" },
    { key: "work.configure", label: "Configure work", group_key: "operations" },
    { key: "work.operate", label: "Perform work", group_key: "operations" },
    { key: "tours.configure", label: "Configure tours", group_key: "scheduling" },
    { key: "tours.book", label: "Manage tour bookings", group_key: "scheduling" },
    { key: "admin.users.read", label: "View users", group_key: "system" },
    { key: "admin.users.write", label: "Manage users", group_key: "system" },
    { key: "admin.roles.read", label: "View roles", group_key: "system" },
    { key: "admin.roles.write", label: "Manage roles", group_key: "system" },
    { key: "admin.access_scope.write", label: "Manage user access scope", group_key: "system" },
    { key: "fin.read", label: "View financials", group_key: "financials" },
    { key: "fin.write", label: "Manage financials", group_key: "financials" },
    { key: "fin.post", label: "Post financial transactions", group_key: "financials" },
    { key: "fin.adjust", label: "Adjust an account by hand", group_key: "financials" },
    { key: "fin.responsibility", label: "Configure who is responsible", group_key: "financials" },
    { key: "fin.subsidy", label: "Administer subsidy funding", group_key: "financials" },
];

const ROWS = buildPermissionGridRows(CATALOG);
const row = (id: string) => {
    const r = ROWS.find((x) => x.id === id);
    if (!r) throw new Error(`no row ${id} — the projection changed and this file is measuring nothing`);
    return r;
};
const areas = (granted: ReadonlySet<string>) => normalModeMatrix(buildCapabilityMatrix(ROWS, granted));
const area = (key: string, granted: ReadonlySet<string> = new Set()): MatrixArea => {
    const a = areas(granted).find((x) => x.areaKey === key);
    if (!a) throw new Error(`no area ${key}`);
    return a;
};

describe("a partial selection saves exactly what was selected", () => {
    const CASES: [string, string, string[], string[]][] = [
        // label, row id set to write, expected granted, keys that must NOT appear
        ["Enrollment records without decisions", "enrollment.record", ["enrollment.record.manage"], ["enrollment.decide", "enrollment.pricing.override", "enrollment.requirement_exception.manage"]],
        ["Business Process configure without activate", "business_process.configure", ["business_process.configure"], ["business_process.activate"]],
        ["Work operate without configure", "work.operate", ["work.operate"], ["work.configure"]],
        ["User administration without Role administration", "admin.users", ["admin.users.read", "admin.users.write"], ["admin.roles.read", "admin.roles.write", "admin.access_scope.write"]],
        ["Tour bookings without tour configuration", "tours.book", ["tours.book"], ["tours.configure"]],
    ];

    it.each(CASES)("%s", (_label, rowId, expected, forbidden) => {
        const saved = applyGridRowSelection({ row: row(rowId), level: "write", granted: new Set<string>() });
        expect([...saved].sort()).toEqual([...expected].sort());
        for (const f of forbidden) expect(saved.has(f), `${f} rode along`).toBe(false);
    });

    it("Financials manage does not post money", () => {
        // `fin.read`/`fin.write` are one row; posting, adjusting, responsibility and subsidy are four
        // more. Ordinary financial authority must not reach the money-truth keys.
        const saved = applyGridRowSelection({ row: row("fin"), level: "write", granted: new Set<string>() });
        expect([...saved].sort()).toEqual(["fin.read", "fin.write"]);
        for (const f of ["fin.post", "fin.adjust", "fin.responsibility", "fin.subsidy"]) {
            expect(saved.has(f), `${f} is money truth and must be granted deliberately`).toBe(false);
        }
    });

    it("the editor reconstructs exactly what was saved", () => {
        // The reload half: a stored set read back through the same projection must reproduce the
        // levels an administrator set, and report a disagreeing area as Limited rather than rounding.
        const saved = applyGridRowSelection({ row: row("enrollment.record"), level: "write", granted: new Set<string>() });
        expect(levelFromGrantedKeys(row("enrollment.record"), saved)).toBe("write");
        expect(levelFromGrantedKeys(row("enrollment.decide"), saved)).toBe("none");
        const enrollment = area("enrollment", saved);
        expect(enrollment.level).toBe("limited");
        expect(`${enrollment.granted} of ${enrollment.enforcedTotal}`).toBe("1 of 4");
    });

    it("a key the surface cannot draw survives a save — H2 / RL-48", () => {
        const carried = new Set(["some.key.the.grid.cannot.draw", "enrollment.decide"]);
        const saved = applyGridRowSelection({ row: row("enrollment.record"), level: "write", granted: carried });
        expect(saved.has("some.key.the.grid.cannot.draw")).toBe(true);
    });
});

describe("what the AREA preset does — evidence for the Director, not a change", () => {
    const preset = (key: string) => [...applyAreaPreset({ area: area(key), level: "write", granted: new Set<string>() })].sort();

    it("Enrollment → Manage grants all four enrollment authorities", () => {
        expect(preset("enrollment")).toEqual([
            "enrollment.decide",
            "enrollment.pricing.override",
            "enrollment.record.manage",
            "enrollment.requirement_exception.manage",
        ]);
    });

    it("Financials → Manage grants ordinary authority AND every money-truth key", () => {
        expect(preset("financials")).toEqual([
            "fin.adjust", "fin.post", "fin.read", "fin.responsibility", "fin.subsidy", "fin.write",
        ]);
    });

    it("Users & roles → Manage grants users, roles AND access scope together", () => {
        expect(preset("users_roles")).toEqual([
            "admin.access_scope.write", "admin.roles.read", "admin.roles.write", "admin.users.read", "admin.users.write",
        ]);
    });

    it("Business Processes → Manage grants configure AND activate", () => {
        expect(preset("business_process")).toEqual(["business_process.activate", "business_process.configure"]);
    });

    it("No access removes exactly the area's own keys and nothing else", () => {
        const held = new Set(["enrollment.decide", "enrollment.record.manage", "portal.access"]);
        const cleared = applyAreaPreset({ area: area("enrollment", held), level: "none", granted: held });
        expect([...cleared].sort()).toEqual(["portal.access"]);
    });

    it("View on a write-only area grants nothing rather than something weaker", () => {
        // Enrollment offers no read column at all, so `View` cannot quietly become a partial Manage.
        expect([...applyAreaPreset({ area: area("enrollment"), level: "read", granted: new Set<string>() })]).toEqual([]);
    });
});
