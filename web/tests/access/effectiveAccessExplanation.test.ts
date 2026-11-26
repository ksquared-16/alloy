/**
 * `OD-8` / `AD-25` — the Users chapter explains effective access, and refuses to when it cannot.
 *
 * The product goal is one sentence an administrator can act on: *"this person can manage these
 * areas, at these places, because of these roles."* Three different layers supply the three clauses,
 * and each can be unavailable independently. These tests are mostly about the unavailable cases,
 * because a confident wrong explanation is worse than no explanation — an operator acts on it.
 */
import { describe, it, expect } from "vitest";
import { buildPermissionGridRows } from "@/lib/admin/permissionGrid";
import {
    explainEffectiveAccess,
    explanationIsAnswerable,
    managedAreas,
    partialAreas,
    scopeStatementForMember,
    type RoleGrantLoad,
    type ScopeStatement,
} from "@/lib/access/effectiveAccessExplanation";

/** Two enforced areas inside one catalog group, plus a second group — enough to disagree. */
const CATALOG = [
    { key: "settings.read", group_key: "settings", label: "View settings" },
    { key: "settings.manage", group_key: "settings", label: "Manage settings" },
    { key: "settings.users_roles.read", group_key: "settings", label: "View users and roles" },
    { key: "settings.users_roles", group_key: "settings", label: "Manage users and roles" },
    { key: "documents.read", group_key: "documents", label: "View documents" },
    { key: "documents.write", group_key: "documents", label: "Manage documents" },
];

const GRID = buildPermissionGridRows(CATALOG);

const ORG_WIDE: ScopeStatement = { kind: "organization" };

function role(roleKey: string, roleLabel: string | null, keys: string[] | null): RoleGrantLoad {
    return { roleKey, roleLabel, keys: keys === null ? null : new Set(keys) };
}

describe("OD-8 — the explanation is derived, and attributes truthfully", () => {
    it("names EVERY role that contributes to an area, not the first one found", () => {
        // `06…` requires authority from multiple sources to show truthfully. Naming one role would
        // make the other invisible to anyone auditing why the access exists — and the operator
        // would remove the named role and be surprised the access survived.
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [
                role("center_director", "Center Director", ["documents.read", "documents.write"]),
                role("regional_lead", "Regional Lead", ["documents.read"]),
            ],
        });
        const docs = e.areas.find((a) => a.groupKey === "documents")!;
        expect(docs.from.map((r) => r.roleLabel).sort()).toEqual(["Center Director", "Regional Lead"]);
    });

    it("does not attribute a role to an area it grants nothing in", () => {
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [
                role("center_director", "Center Director", ["documents.write"]),
                role("bookkeeper", "Bookkeeper", ["settings.read"]),
            ],
        });
        const docs = e.areas.find((a) => a.groupKey === "documents")!;
        expect(docs.from.map((r) => r.roleLabel)).toEqual(["Center Director"]);
        const settings = e.areas.find((a) => a.groupKey === "settings")!;
        expect(settings.from.map((r) => r.roleLabel)).toEqual(["Bookkeeper"]);
    });

    it("the authority reported is the UNION's, not any single role's", () => {
        // Two roles each holding half of `settings` compose to more than either explains alone.
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [
                role("a", "Role A", ["settings.read", "settings.manage"]),
                role("b", "Role B", ["settings.users_roles.read", "settings.users_roles"]),
            ],
        });
        const settings = e.areas.find((a) => a.groupKey === "settings")!;
        expect(settings.enforcedTotal).toBe(2);
        expect(settings.granted).toBe(2);
        expect(settings.authority).toBe("manage");
        expect(settings.from).toHaveLength(2);
    });

    it("a partially granted area is never rounded up into the managed headline", () => {
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [role("a", "Role A", ["settings.read", "settings.manage"])],
        });
        expect(managedAreas(e).map((a) => a.groupKey)).toEqual([]);
        expect(partialAreas(e).map((a) => a.groupKey)).toEqual(["settings"]);
        expect(partialAreas(e)[0]!.authority).toBe("limited");
    });

    it("an area the principal holds nothing in does not appear at all", () => {
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [role("a", "Role A", ["documents.read"])],
        });
        expect(e.areas.map((a) => a.groupKey)).toEqual(["documents"]);
    });

    it("a held role the catalog does not define is reported, not rendered as its key", () => {
        // The key is not a name. Showing it would put implementation vocabulary in the one place
        // the product is trying to explain itself, and inventing a label would be worse.
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [
                role("center_director", "Center Director", ["documents.write"]),
                role("ghost_role", null, ["documents.read"]),
            ],
        });
        expect(e.roles.map((r) => r.roleKey)).toEqual(["center_director"]);
        expect(e.unlabelledRoleKeys).toEqual(["ghost_role"]);
        // …and it explains nothing, because there is no name to explain it with.
        expect(e.areas.flatMap((a) => a.from).map((r) => r.roleKey)).not.toContain("ghost_role");
    });

    it("invents no domain — every area is a catalog group", () => {
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [role("a", "Role A", ["documents.write", "settings.manage", "settings.read"])],
        });
        const groups = new Set(CATALOG.map((c) => c.group_key));
        for (const area of e.areas) expect(groups.has(area.groupKey), area.groupKey).toBe(true);
        for (const invented of ["enrollment", "attendance", "roster", "records"]) {
            expect(e.areas.map((a) => a.groupLabel.toLowerCase())).not.toContain(invented);
        }
    });
});

describe("OD-8 — the explanation refuses to be an answer when a layer is unknown", () => {
    it("a failed grant read makes the whole explanation unanswerable", () => {
        // `W-56`/`T-22` one layer out: a union built from the roles that happened to load reads
        // exactly like a complete one. The distinction between "holds nothing" and "we could not
        // find out" is the one that must survive.
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [
                role("a", "Role A", ["documents.write"]),
                role("b", "Role B", null),
            ],
        });
        expect(e.capabilitiesKnown).toBe(false);
        expect(explanationIsAnswerable(e)).toBe(false);
        // The areas that DID load are still computed — the caller decides what to do with them —
        // but nothing in the structure lets them be mistaken for the total.
        expect(e.areas.map((a) => a.groupKey)).toEqual(["documents"]);
    });

    it("all reads succeeding with no grants is answerable, and the answer is 'nothing'", () => {
        // The other side of the same distinction, asserted so the check above cannot be satisfied
        // by treating every empty result as unknown.
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: ORG_WIDE,
            heldRoles: [role("a", "Role A", [])],
        });
        expect(e.capabilitiesKnown).toBe(true);
        expect(explanationIsAnswerable(e)).toBe(true);
        expect(e.areas).toEqual([]);
    });

    it("an unknown scope makes it unanswerable even when every capability loaded", () => {
        const e = explainEffectiveAccess({
            gridRows: GRID,
            scope: { kind: "unknown", reason: "configured and effective scope diverge" },
            heldRoles: [role("a", "Role A", ["documents.write"])],
        });
        expect(e.capabilitiesKnown).toBe(true);
        expect(explanationIsAnswerable(e)).toBe(false);
    });
});

describe("OD-8 — scope is read from the enforced answer, never defaulted to the widest", () => {
    const labels = {
        departmentName: (id: string) => ({ "d-1": "Infants", "d-2": "Toddlers" })[id] ?? null,
        siteName: (id: string) => ({ "s-1": "Bend", "s-2": "Redmond" })[id] ?? null,
    };
    const base = {
        has_access_profile: true,
        effective_department_scope: "all" as const,
        effective_site_scope: "all" as const,
        effective_divergence_reason: null,
        department_ids: [] as string[],
        site_location_ids: [] as string[],
    };

    it("all on both dimensions is organization-wide", () => {
        expect(scopeStatementForMember(base, labels)).toEqual({ kind: "organization" });
    });

    it("a restriction names the places it is restricted to", () => {
        const s = scopeStatementForMember(
            { ...base, effective_site_scope: "restricted", site_location_ids: ["s-1", "s-2"] },
            labels,
        );
        expect(s).toEqual({ kind: "selected", departments: [], sites: ["Bend", "Redmond"] });
    });

    it("a divergence between configured and effective scope is UNKNOWN, not either side", () => {
        // `W-7`. Flattening a divergence into one of its sides is a claim the platform is not
        // making, and the operator would read it as the enforced answer.
        const s = scopeStatementForMember(
            { ...base, effective_divergence_reason: "profile row absent while grants imply restriction" },
            labels,
        );
        expect(s.kind).toBe("unknown");
        expect((s as { reason: string }).reason).toContain("profile row absent");
    });

    it("restricted-to-nothing-nameable is unknown, not organization-wide and not empty", () => {
        // The dangerous middle. A restriction whose members cannot be named is neither "everywhere"
        // nor "nowhere", and both readings are wrong in a direction an operator would act on.
        const s = scopeStatementForMember(
            { ...base, effective_department_scope: "restricted", department_ids: ["d-unknown"] },
            labels,
        );
        expect(s.kind).toBe("unknown");
        expect((s as { reason: string }).reason).toMatch(/could not be named/i);
    });

    it("the label resolver is actually consulted — non-vacuity on the naming", () => {
        // Without this, "names the places" would pass against a resolver that returns everything or
        // one that is never called.
        const seen: string[] = [];
        const s = scopeStatementForMember(
            { ...base, effective_site_scope: "restricted", site_location_ids: ["s-1"] },
            {
                departmentName: () => null,
                siteName: (id) => {
                    seen.push(id);
                    return "Bend";
                },
            },
        );
        expect(seen).toEqual(["s-1"]);
        expect(s).toEqual({ kind: "selected", departments: [], sites: ["Bend"] });
    });
});
