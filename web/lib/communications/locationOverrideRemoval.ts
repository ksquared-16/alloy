/**
 * What happens when an administrator removes a location's Communications override.
 *
 * ---------------------------------------------------------------------------
 * The audit that produced this file
 * ---------------------------------------------------------------------------
 *
 * The first implementation removed an override by clearing `location_id` and
 * setting `scope='org'`. That looked like "it is no longer Riverside's", and it is
 * wrong in four separate ways. Answering the questions asked, on the real model:
 *
 * 1. **Does clearing `location_id` convert a location identity into another
 *    org-level identity?** YES. The projection derives identity scope from the
 *    binding, so `location_id = null` produced `scope='tenant'`.
 *
 * 2. **Can that create multiple organization defaults or candidates?** YES. The
 *    resolver's organization fallback is
 *    `pool.filter(i => i.scope === 'tenant' || i.scope === 'system')` sorted by
 *    id. A broadened ex-Riverside identity joins that pool, so an address a
 *    school created for ONE campus becomes a candidate to speak for the entire
 *    organization — chosen by id order, which is arbitrary from the operator's
 *    point of view.
 *
 * 3. **Can the former location-specific receiving address keep receiving,
 *    unexpectedly, organization-wide?** YES, and this was the sharpest edge.
 *    Inbound ownership resolves from the receiving address to its binding; with
 *    the location cleared, mail to `riverside@` would have been filed as
 *    ORGANIZATION conversations. Families writing to a campus address would land
 *    in the general inbox with no sign anything had changed.
 *
 * 4. **Does resolver precedence change?** YES — the identity moves from
 *    `location_default` (level 10) into the tenant pool (30/40).
 *
 * 5. **Is identity ownership distinct from location assignment anywhere?** YES,
 *    and this is what makes the fix cheap. `communication_identity_location_bindings`
 *    already models assignment as its own row with its own `status`. Only the
 *    authoring table (`communication_provider_bindings`) conflates the two by
 *    deriving scope from `location_id`.
 *
 * ---------------------------------------------------------------------------
 * The semantics, therefore
 * ---------------------------------------------------------------------------
 *
 *     remove the ASSIGNMENT · preserve the IDENTITY and its history · restore INHERITANCE
 *
 * Concretely: the binding is deactivated **in place**. `location_id` is KEPT.
 *
 * Keeping it is the whole trick, and it needs no schema change:
 *
 *   - the identity stays `scope='location'`, and the resolver's organization pool
 *     admits only `tenant`/`system` — so it is structurally incapable of becoming
 *     an organization candidate. Not "we remembered not to"; it cannot.
 *   - `inbound_address` stays claimed, so the globally-unique receiving address is
 *     not released for another organization to take, and no message that named it
 *     is orphaned.
 *   - the location has no ACTIVE binding, which is exactly what "no override"
 *     means to every reader — so Riverside inherits the organization identity.
 *   - mail to the retired address is quarantined rather than silently re-filed
 *     under the organization, which is question 3 answered by construction.
 *   - it is reversible: re-activating restores the override with its history.
 *
 * No migration is required. The model could already express this; the previous
 * implementation simply chose the destructive reading of "remove".
 */

export type LocationOverrideBinding = {
    id?: string;
    location_id: string | null;
    scope?: string | null;
    status?: string | null;
};

export type LocationOverrideRemoval =
    | {
          ok: true;
          /** Patch to apply to the binding. `location_id` is deliberately absent. */
          patch: { status: "disabled" };
          /** Operator-facing summary of what just happened. */
          message: string;
      }
    | { ok: false; reason: "not_a_location_override"; message: string };

/**
 * Plan the removal. Pure, so the semantics are testable without a database and
 * cannot drift between the route and the surface.
 */
export function planLocationOverrideRemoval(binding: LocationOverrideBinding): LocationOverrideRemoval {
    const locationId = (binding.location_id ?? "").trim();
    if (!locationId) {
        return {
            ok: false,
            reason: "not_a_location_override",
            message: "This is the organization identity, so there is no location override to remove.",
        };
    }

    return {
        ok: true,
        // `location_id` is NOT cleared. See the header: keeping it is what stops
        // this identity becoming an organization candidate.
        patch: { status: "disabled" },
        message: "This location now uses the organization identity.",
    };
}

/** True when this binding is an override that is currently in force. */
export function isActiveLocationOverride(binding: LocationOverrideBinding): boolean {
    return Boolean((binding.location_id ?? "").trim()) && String(binding.status ?? "").trim().toLowerCase() === "active";
}

/** True when this binding is a retired override — its location kept, but inactive. */
export function isRetiredLocationOverride(binding: LocationOverrideBinding): boolean {
    return Boolean((binding.location_id ?? "").trim()) && String(binding.status ?? "").trim().toLowerCase() !== "active";
}
