/**
 * W-62 / `GAP-15` / `AD-25` — the declared enumeration of the authority layers.
 *
 * `03-implementation-qa-sequence.md` §45.3: *"'Four layers' is met when a single declared
 * enumeration of the resolution layers exists in code, the resolver reads no store absent from it,
 * and a check fails when a ninth appears."* This is that enumeration. `01…§54` is why it is a
 * workstream and not merely a lock: **every control in the eight-layer enforcement matrix — including
 * `H1`, `H2` and `H3`, the three that hold — is currently locked by no test**, and *"the
 * simplification work is exactly the kind of change that degrades unlocked controls silently."*
 *
 * ## What AD-25 decided, and what it deliberately did not
 *
 * The canonical model is four layers: **Membership → Role → Capability → Scope**.
 *
 * AD-25 does **not** claim the resolver physically reads four stores. It reads SEVEN. The decision is
 * that those reads map *truthfully* onto four conceptual layers — grouping is operator-facing, and
 * *"the fact that scope is currently represented by multiple physical tables does not create multiple
 * conceptual authority layers."* Conflating the two is precisely the error the plan warns about:
 * *"restating the chain as four layers does not make it four layers."* So this module records BOTH —
 * the conceptual layer and the physical store — and the test beside it proves the mapping is total
 * in both directions.
 *
 * ## Two facts this enumeration is careful not to flatten
 *
 * 1. **`user_roles` backs TWO layers.** The row's existence is the Membership fact — this user is
 *    admitted to this org. Its `role` column is the Role fact. One physical store, two conceptual
 *    layers, and saying otherwise to make the table tidier would be the untruthful grouping AD-25
 *    forbids. Each READ PURPOSE maps to exactly one layer; the store is listed once per purpose.
 *
 * 2. **`app_users` and `user_profiles` are NOT a fifth layer.** They are the legacy fallback that
 *    `W-20` exists to remove and has not yet removed. They are classified `compatibility`, they name
 *    the canonical layer they feed, and they are visible here precisely so their removal is a
 *    deletion from this list rather than a silent change of meaning.
 *
 * ## How effective access composes
 *
 * Membership admits; Role is a sibling input off that same membership; Capability is what Role
 * resolves to and is the executable vocabulary; Scope bounds where those capabilities operate.
 *
 *     effective = Membership ∧ capability(Role) ∧ scope
 *
 * **Role and Scope are sibling branches from the same membership and compose at the authorization
 * gate. Neither writes into the other.** That invariant is `I-20`/`C8`'s and it is what `W-8`
 * restored by deleting the bypass that let a role widen a scope dimension.
 *
 * Surface visibility is a PROJECTION of capability, not a layer. `W-49`/`W-50` make the surfaces
 * gate on the capability they present; that does not give a surface authority of its own, and
 * distributing capability ownership into surfaces is `OD-8`'s open question, not this one's.
 */

/** The four canonical layers. Ordered as authority resolves. */
export const AUTHORITY_LAYERS = ["membership", "role", "capability", "scope"] as const;

export type AuthorityLayer = (typeof AUTHORITY_LAYERS)[number];

export type AuthoritySource = {
    /** The physical table the resolver reads. */
    readonly store: string;
    /**
     * `canonical` — the store is authoritative for the layer it names.
     * `compatibility` — a legacy fallback feeding that layer, scheduled for removal, never a layer
     * of its own.
     */
    readonly classification: "canonical" | "compatibility";
    /** The canonical layer this read serves or feeds. */
    readonly layer: AuthorityLayer;
    /** The column carrying the fact, when the store serves more than one layer. */
    readonly column?: string;
    /** Why this read belongs to this layer. Read by a human, not matched by a test. */
    readonly why: string;
};

/**
 * Every store the admin authority resolver reads, mapped.
 *
 * The test beside this file DISCOVERS the resolver's reads from source and asserts this list is
 * exactly that set — so a store added to the resolver without an entry here fails, and an entry here
 * with no corresponding read fails too.
 */
export const AUTHORITY_SOURCES: readonly AuthoritySource[] = [
    {
        store: "user_roles",
        classification: "canonical",
        layer: "membership",
        why: "The existence of a (user, org) row IS the admission fact — this person belongs to this organization. W-5 made a membership and its access profile atomic precisely so this row cannot exist without the scope layer's row.",
    },
    {
        store: "user_roles",
        classification: "canonical",
        layer: "role",
        column: "role",
        why: "The role assignment is a sibling input off the same membership row, not a separate admission. W-16 constrained this column to role_definitions, so a membership can no longer name a role that does not exist.",
    },
    {
        store: "role_permission_grants",
        classification: "canonical",
        layer: "capability",
        why: "Role → capability. This is the executable authority vocabulary the gates actually read; W-13 removed the last place a role literal conferred authority without passing through it.",
    },
    {
        store: "user_access_profiles",
        classification: "canonical",
        layer: "scope",
        why: "Carries the scope MODE per dimension (all / restricted / unset). W-47 made 'unset' representable so an absent profile stops rendering as org-wide.",
    },
    {
        store: "user_department_access",
        classification: "canonical",
        layer: "scope",
        why: "The department subdimension's membership set. A separate table, not a separate layer — AD-25 is explicit that multiple physical scope tables do not multiply the conceptual layers.",
    },
    {
        store: "user_site_access",
        classification: "canonical",
        layer: "scope",
        why: "The site/location subdimension's membership set. Same store-vs-layer distinction as the department table.",
    },
    {
        store: "user_profiles",
        classification: "compatibility",
        layer: "role",
        column: "role",
        why: "LEGACY FALLBACK, not a layer. Yields an admin/ops role when no user_roles row exists. W-20 exists to remove it and has removed only its truthfulness half so far — removal is lockout class L4 and needs census Q15 against a real tenant. Listed so its removal is a deletion from this list rather than a silent change of meaning.",
    },
    {
        store: "app_users",
        classification: "compatibility",
        layer: "role",
        column: "role",
        why: "LEGACY FALLBACK, not a layer. The second of the two stores W-20 removes; it also supplies the org id when the fallback is the only source of authority, which is why W-22's lexicographic tiebreak still has a path to reach.",
    },
] as const;

/** Stores that are authoritative rather than a legacy fallback. */
export function canonicalSources(): readonly AuthoritySource[] {
    return AUTHORITY_SOURCES.filter((s) => s.classification === "canonical");
}

/** The legacy fallback reads. Non-empty until W-20's removal half lands. */
export function compatibilitySources(): readonly AuthoritySource[] {
    return AUTHORITY_SOURCES.filter((s) => s.classification === "compatibility");
}

/** Every distinct physical store the model accounts for. */
export function declaredStores(): string[] {
    return [...new Set(AUTHORITY_SOURCES.map((s) => s.store))].sort();
}

/** The canonical stores backing one layer. A layer with none is an invented layer. */
export function canonicalStoresForLayer(layer: AuthorityLayer): string[] {
    return [...new Set(canonicalSources().filter((s) => s.layer === layer).map((s) => s.store))].sort();
}
