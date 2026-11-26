/**
 * `OD-8` — the Users chapter explains effective access instead of listing assignments.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md`, and `AD-25`'s
 * four layers — **Membership → Role → Capability → Scope**.
 *
 * The product goal is one sentence an administrator can act on: *"this person can manage these
 * areas, at these places, because of these roles."* Everything here exists to make that sentence
 * derivable rather than asserted, and to make it refuse to be said when any part of it is unknown.
 *
 * ## What this module will not do
 *
 * **It never fabricates the composition.** Each of the three claims comes from a different layer,
 * and each has a way of being unavailable:
 *
 * - the **roles** come from the membership union (`heldRoleKeys`), not from the collapsed picker
 *   value — `W-55`/`RL-51`;
 * - the **capabilities** come from `role_permission_grants` per role, projected through the catalog
 *   grid. A grant read that FAILED is not an empty grant set: `capabilitiesKnown` goes false and the
 *   caller must say so rather than render "no access", which is `W-56`/`T-22` one layer out;
 * - the **scope** comes from the membership's access profile, and reports `unknown` rather than
 *   defaulting to organization-wide. Defaulting the unknown to the widest answer is exactly the
 *   `W-43` failure this initiative closed in the resolver, and it would be worse here because the
 *   operator would be reading it as an explanation.
 *
 * **It never claims a role explains an area it does not grant.** Attribution is computed per role
 * from that role's own grant set, so *"because of Center Director"* is checkable. Where two roles
 * both contribute, both are named — `06…` requires that authority from multiple sources shows
 * truthfully, and naming one would make the other invisible to anyone auditing why access exists.
 *
 * **It never invents a domain.** Areas are catalog groups, exactly as in the role editor. A held
 * role key with no `role_definitions` row is reported in `unlabelledRoleKeys` rather than rendered
 * with its raw key as a label — the key is not a name, and showing it would be the implementation
 * vocabulary leaking into the one place the product is trying to explain itself.
 */

import {
    buildRoleAuthorityAreas,
    collapseLevels,
    heldAuthorityAreas,
    type AreaAuthority,
    type RoleAuthorityArea,
} from "@/lib/access/roleAuthoritySummary";
import { levelFromGrantedKeys, type PermissionGridRow } from "@/lib/admin/permissionGrid";

export type RoleAttribution = { roleKey: string; roleLabel: string };

/** One capability area the principal actually holds, with the roles that explain it. */
export type ExplainedArea = {
    groupKey: string;
    groupLabel: string;
    /** Over the UNION of every role held — what the principal can do, not what one role grants. */
    authority: AreaAuthority;
    granted: number;
    enforcedTotal: number;
    /** Every role contributing at least one grant here. Never truncated to the first. */
    from: RoleAttribution[];
};

export type ScopeStatement =
    | { kind: "organization" }
    | { kind: "selected"; departments: string[]; sites: string[] }
    | { kind: "unknown"; reason: string };

export type EffectiveAccessExplanation = {
    /** Every role held, in the order `heldRoleKeys` returned them. */
    roles: RoleAttribution[];
    /** Held keys the role catalog does not define — stated so the gap is visible, not guessed at. */
    unlabelledRoleKeys: string[];
    /** Areas the principal holds something in. Empty is a real answer; unknown is not. */
    areas: ExplainedArea[];
    scope: ScopeStatement;
    /**
     * False when any held role's grant set could not be read. The caller MUST NOT render `areas`
     * as the answer in that state — a partial union reads as a complete one.
     */
    capabilitiesKnown: boolean;
};

/** A role's grant set as the caller loaded it. `null` keys means the read failed. */
export type RoleGrantLoad = {
    roleKey: string;
    roleLabel: string | null;
    /** The permission keys the role holds, or `null` when the read did not succeed. */
    keys: ReadonlySet<string> | null;
};

/**
 * Compose the four layers into an explanation.
 *
 * `gridRows` is the catalog projection (`W-10`), so this function cannot name a capability the
 * platform does not define. `scope` is passed already resolved by the caller, because the effective
 * scope is a platform answer with a divergence rule of its own (`W-7`) and re-deriving it here would
 * create the second opinion this initiative keeps removing.
 */
export function explainEffectiveAccess(params: {
    heldRoles: readonly RoleGrantLoad[];
    gridRows: readonly PermissionGridRow[];
    scope: ScopeStatement;
}): EffectiveAccessExplanation {
    const { heldRoles, gridRows, scope } = params;

    const roles: RoleAttribution[] = [];
    const unlabelledRoleKeys: string[] = [];
    for (const held of heldRoles) {
        if (held.roleLabel) roles.push({ roleKey: held.roleKey, roleLabel: held.roleLabel });
        else unlabelledRoleKeys.push(held.roleKey);
    }

    const capabilitiesKnown = heldRoles.every((r) => r.keys !== null);

    // The union is what the principal can do. Computed from the loaded sets only — a failed read
    // contributes nothing, and `capabilitiesKnown` is what tells the caller not to trust the total.
    const union = new Set<string>();
    for (const held of heldRoles) {
        if (!held.keys) continue;
        for (const key of held.keys) union.add(key);
    }

    const unionAreas = heldAuthorityAreas(buildRoleAuthorityAreas(gridRows, union));

    const areas: ExplainedArea[] = unionAreas.map((area) => ({
        groupKey: area.groupKey,
        groupLabel: area.groupLabel,
        authority: area.authority,
        granted: area.granted,
        enforcedTotal: area.enforcedTotal,
        from: attributionForArea(area, heldRoles),
    }));

    return { roles, unlabelledRoleKeys, areas, scope, capabilitiesKnown };
}

/**
 * Which roles explain this area.
 *
 * A role attributes when it grants *anything* enforced here — not when it grants everything. An
 * operator asking "why can this person see scheduling" is asking which assignment to change, and a
 * role contributing one of three rows is still the answer to that question.
 */
function attributionForArea(
    area: RoleAuthorityArea,
    heldRoles: readonly RoleGrantLoad[],
): RoleAttribution[] {
    const out: RoleAttribution[] = [];
    for (const held of heldRoles) {
        if (!held.keys || !held.roleLabel) continue;
        const contributes = area.rows.some(
            (row) => levelFromGrantedKeys(row, new Set(held.keys!)) !== "none",
        );
        if (contributes) out.push({ roleKey: held.roleKey, roleLabel: held.roleLabel });
    }
    return out;
}

/**
 * The scope statement for a membership, from the projection the members endpoint already returns.
 *
 * **`effective` is used, not `configured`.** `W-7` records that the two can diverge and that the
 * effective answer is the enforced one; an explanation built on the configured value would describe
 * a system the operator is not using. When the platform reports a divergence reason, the scope is
 * `unknown` and carries it — a divergence the surface cannot account for must not be flattened into
 * either side of itself.
 */
export function scopeStatementForMember(member: {
    has_access_profile: boolean;
    effective_department_scope: "all" | "restricted";
    effective_site_scope: "all" | "restricted";
    effective_divergence_reason: string | null;
    department_ids: readonly string[];
    site_location_ids: readonly string[];
}, labels: {
    departmentName: (id: string) => string | null;
    siteName: (id: string) => string | null;
}): ScopeStatement {
    if (member.effective_divergence_reason) {
        return { kind: "unknown", reason: member.effective_divergence_reason };
    }
    if (member.effective_department_scope === "all" && member.effective_site_scope === "all") {
        return { kind: "organization" };
    }

    const departments = member.effective_department_scope === "restricted"
        ? member.department_ids.map(labels.departmentName).filter((n): n is string => Boolean(n))
        : [];
    const sites = member.effective_site_scope === "restricted"
        ? member.site_location_ids.map(labels.siteName).filter((n): n is string => Boolean(n))
        : [];

    // Restricted with nothing named is not "restricted to everywhere" and it is not organization
    // wide — it is a restriction whose members this surface could not resolve. Say so.
    if (departments.length === 0 && sites.length === 0) {
        return {
            kind: "unknown",
            reason: "This membership is restricted, but the departments or locations it is restricted to could not be named.",
        };
    }
    return { kind: "selected", departments, sites };
}

/** The areas an operator would call "managed", for the headline. Never rounds `limited` up. */
export function managedAreas(explanation: EffectiveAccessExplanation): ExplainedArea[] {
    return explanation.areas.filter((a) => a.authority === "manage");
}

/** Everything held that is not full management — kept distinct so the headline cannot overstate. */
export function partialAreas(explanation: EffectiveAccessExplanation): ExplainedArea[] {
    return explanation.areas.filter((a) => a.authority !== "manage");
}

/**
 * Is this explanation safe to present as an answer?
 *
 * A caller rendering an explanation with `capabilitiesKnown: false` would be showing a union built
 * from the roles that happened to load. The distinction between *"this person has no capabilities"*
 * and *"we could not find out"* is the one `W-56` was written to preserve, and an explanation is
 * exactly where collapsing it does the most damage.
 */
export function explanationIsAnswerable(explanation: EffectiveAccessExplanation): boolean {
    return explanation.capabilitiesKnown && explanation.scope.kind !== "unknown";
}

/** Re-exported so a caller composing its own summary uses the same collapse rule the areas did. */
export { collapseLevels };
