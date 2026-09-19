/**
 * The ONE canonical topology mutation safety contract (Slice 3).
 *
 * Before this module, topology legality was spelled three times — in the DB
 * trigger, in `POST /api/admin/locations`, and nowhere at all in `PATCH` — and
 * the three did not agree. Worse, every one of them validated only the row being
 * written. A row can be perfectly legal from its own perspective while leaving
 * the tree beneath it illegal, or leaving a committed placement pointing at
 * something that is no longer a classroom. Slice 1 measured both paths:
 *
 *   DEFECT A  Room 1 (physical_space) contains Toddler 1 and Toddler 2. Change
 *             Room 1's role to shared_space: Room 1 itself still validates —
 *             its own parent is still the site — and the two groups are left
 *             nested inside something that may not contain them.
 *
 *   DEFECT B  Toddler 1 is named by a live `child_placements` row. Change its
 *             role to physical_space: the role write validates, and the
 *             placement now says a child belongs to a room that is not a group.
 *
 * Both are dormant only because PATCH cannot currently express a topology
 * change. This module closes them BEFORE that door opens.
 *
 * Shape:
 *
 *     canonical model (types, roles, the NULL fold)
 *          ↓
 *     THIS module — the mutation validator
 *          ↓
 *     POST + PATCH  (transport, auth, parsing — never topology semantics)
 *          ↓
 *     validate_location_hierarchy()  — defence in depth, and the only layer
 *                                      that is safe against a preflight race
 *
 * The validator evaluates the PROPOSED RESULTING ROW, never the partial payload.
 * A PATCH that touches only a label must reach the same verdict as no change at
 * all, so ordinary edits cannot be refused by topology rules they never engaged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    canonicalLocationTypeFromStorage,
    canonicalUnitRoleFromStorage,
    DEFAULT_UNIT_ROLE,
    type CanonicalLocation,
    type CanonicalUnitRole,
} from "@/lib/location/canonicalLocationModel";
import {
    resolveLocationsForOrganization,
    resolveSiteIdsByLocation,
} from "@/lib/location/canonicalLocationProvider";

/** The three legal `unit_role` values, as stored. */
export const CANONICAL_UNIT_ROLES: readonly CanonicalUnitRole[] = [
    "physical_space",
    "operational_group",
    "shared_space",
];

/**
 * Placement lifecycle states that still assert committed intent. A placement in
 * one of these says "this child belongs to this group", now or shortly; the
 * statement becomes false the moment the group stops being a group.
 *
 * `ended`, `superseded` and `canceled` are closed history: the child DID belong
 * to that group while it was one, and a later reclassification does not make the
 * record false. Freezing a location forever because it once held a placement is
 * exactly the over-blocking §6 warns against.
 */
export const LIVE_PLACEMENT_STATUSES: readonly string[] = ["planned", "active", "ending"];

/**
 * Named, deterministic refusal reasons. The later Type/Inside UI explains a
 * refusal from this code — never from a raw database error string.
 */
export type TopologyRefusalCode =
    | "invalid_location_type"
    | "invalid_unit_role"
    | "role_only_on_unit"
    | "parent_required"
    | "parent_not_found"
    | "invalid_parent_type"
    | "invalid_parent_role"
    | "nested_physical_space"
    | "parent_not_direct_child_of_site"
    | "cross_site_parent"
    | "topology_cycle"
    | "unresolved_site"
    | "existing_children_incompatible"
    | "active_placement_incompatible";

export type TopologyVerdict =
    | { ok: true }
    | { ok: false; code: TopologyRefusalCode; message: string };

const OK: TopologyVerdict = { ok: true };

function refuse(code: TopologyRefusalCode, message: string): TopologyVerdict {
    return { ok: false, code, message };
}

/** The proposed resulting row, in storage terms. `id` is null on create. */
export type TopologyCandidate = {
    id: string | null;
    locationType: string | null;
    /** RAW stored role — null is legitimate and means "legacy default". */
    unitRole: string | null;
    parentLocationId: string | null;
};

/**
 * Fold a partial PATCH body onto the current row to get the candidate. This is
 * the step that makes "validate the result, not the payload" true: a PATCH that
 * omits `unit_role` keeps the row's stored role rather than reading as a change
 * to null.
 */
export function candidateFromPatch(
    current: { id: string; locationType: string | null; unitRole: string | null; parentLocationId: string | null },
    changes: { locationType?: string | null; unitRole?: string | null; parentLocationId?: string | null }
): TopologyCandidate {
    return {
        id: current.id,
        locationType: changes.locationType !== undefined ? changes.locationType : current.locationType,
        unitRole: changes.unitRole !== undefined ? changes.unitRole : current.unitRole,
        parentLocationId:
            changes.parentLocationId !== undefined ? changes.parentLocationId : current.parentLocationId,
    };
}

/** True when the candidate changes nothing this module governs. */
export function isTopologyUnchanged(
    current: { locationType: string | null; unitRole: string | null; parentLocationId: string | null },
    candidate: TopologyCandidate
): boolean {
    return (
        (current.locationType ?? null) === (candidate.locationType ?? null) &&
        (current.unitRole ?? null) === (candidate.unitRole ?? null) &&
        (current.parentLocationId ?? null) === (candidate.parentLocationId ?? null)
    );
}

/** Effective role of the candidate, through the one canonical fold. */
export function candidateEffectiveRole(candidate: TopologyCandidate): CanonicalUnitRole | null {
    return canonicalUnitRoleFromStorage(candidate.locationType, candidate.unitRole);
}

// ---------------------------------------------------------------------------
// Structural legality — pure, over an in-memory view of the org's locations.
// ---------------------------------------------------------------------------

type LocationView = Pick<CanonicalLocation, "id" | "type" | "unitRole" | "parentLocationId"> & {
    name?: string | null;
};

/**
 * Site ancestor of `startParentId`, walking the EXISTING tree. Bounded and
 * revisit-guarded, mirroring `public.location_site_id()`. The candidate itself
 * is never walked through — its parent is the proposed one, and the rest of the
 * chain above the parent is unchanged by this mutation.
 */
function siteIdThroughParent(parentId: string | null, byId: ReadonlyMap<string, LocationView>): string | null {
    let current = parentId;
    const seen = new Set<string>();
    let hops = 0;
    while (current && hops < 8) {
        if (seen.has(current)) return null; // cycle
        seen.add(current);
        const row = byId.get(current);
        if (!row) return null;
        if (row.type === "site") return row.id;
        current = row.parentLocationId;
        hops += 1;
    }
    return null;
}

/** Would parenting `candidateId` under `parentId` close a loop? */
function wouldCycle(
    candidateId: string | null,
    parentId: string | null,
    byId: ReadonlyMap<string, LocationView>
): boolean {
    if (!candidateId) return false;
    if (parentId === candidateId) return true;
    let current = parentId;
    const seen = new Set<string>();
    let hops = 0;
    while (current && hops < 8) {
        if (current === candidateId) return true;
        if (seen.has(current)) return false;
        seen.add(current);
        current = byId.get(current)?.parentLocationId ?? null;
        hops += 1;
    }
    return false;
}

/**
 * Structural legality of the candidate against the existing tree.
 *
 * Every rule the DB trigger enforces lives here too, deliberately — the trigger
 * stays as the backstop that survives a race, and this layer exists so a refusal
 * reaches the operator as a named reason rather than a Postgres exception.
 */
export function validateTopologyShape(
    candidate: TopologyCandidate,
    locations: readonly LocationView[]
): TopologyVerdict {
    const type = String(candidate.locationType ?? "").trim();
    if (type !== "site" && type !== "unit" && type !== "address") {
        return refuse("invalid_location_type", `Location type '${type || "(empty)"}' is not a valid location type.`);
    }

    const storedRole = candidate.unitRole == null ? null : String(candidate.unitRole).trim() || null;
    if (storedRole != null && !CANONICAL_UNIT_ROLES.includes(storedRole as CanonicalUnitRole)) {
        return refuse("invalid_unit_role", `Unit role '${storedRole}' is not a valid room type.`);
    }
    if (storedRole != null && type !== "unit") {
        return refuse("role_only_on_unit", "A room type applies only to a room, not to a site or an address.");
    }

    // Only units participate in the topology this module governs.
    if (type !== "unit") return OK;

    if (!candidate.parentLocationId) {
        return refuse("parent_required", "A room must belong to a site or to a physical room.");
    }

    const byId = new Map<string, LocationView>(locations.map((l) => [l.id, l]));

    if (wouldCycle(candidate.id, candidate.parentLocationId, byId)) {
        return refuse("topology_cycle", "That move would place a room inside itself.");
    }

    const parent = byId.get(candidate.parentLocationId);
    if (!parent) {
        return refuse("parent_not_found", "The chosen parent location does not exist in this organization.");
    }
    if (parent.type !== "site" && parent.type !== "unit") {
        return refuse(
            "invalid_parent_type",
            "A room must be parented to a site or a physical room."
        );
    }

    const effectiveRole = canonicalUnitRoleFromStorage(type, storedRole) ?? DEFAULT_UNIT_ROLE;

    if (parent.type === "unit") {
        const parentRole = parent.unitRole ?? DEFAULT_UNIT_ROLE;
        if (parentRole !== "physical_space") {
            return refuse(
                "invalid_parent_role",
                "A room may only sit inside a physical room."
            );
        }
        if (effectiveRole === "physical_space") {
            return refuse(
                "nested_physical_space",
                "A physical room may not sit inside another physical room."
            );
        }
        // The containing space must hang straight off a site: that caps the chain
        // at site -> physical room -> classroom, which is the whole supported model.
        if (siteIdThroughParent(parent.id, byId) !== parent.parentLocationId) {
            return refuse(
                "parent_not_direct_child_of_site",
                "A room may only sit inside a physical room that belongs directly to a site."
            );
        }
    }

    if (siteIdThroughParent(candidate.parentLocationId, byId) == null) {
        return refuse("unresolved_site", "That location does not resolve to a site.");
    }

    return OK;
}

// ---------------------------------------------------------------------------
// The IO entry point both routes call.
// ---------------------------------------------------------------------------

export type TopologyMutationInput = {
    candidate: TopologyCandidate;
    /** The row as it stands. Null on create. */
    current?: { locationType: string | null; unitRole: string | null; parentLocationId: string | null } | null;
};

/**
 * The single server-side authority. POST and PATCH both call THIS for equivalent
 * resulting states, so the two verbs cannot drift.
 *
 * Reads the org's site+unit rows once and answers every structural question in
 * memory, reusing the canonical ancestry resolver rather than adding a fifth
 * site-inference algorithm to the codebase.
 */
export async function assertTopologyMutationSafe(
    supabase: SupabaseClient,
    orgId: string,
    input: TopologyMutationInput
): Promise<TopologyVerdict> {
    const { candidate, current } = input;

    let locations: CanonicalLocation[];
    try {
        locations = await resolveLocationsForOrganization(supabase, orgId, { includeInactive: true });
    } catch (err) {
        // A validator that cannot see the tree must not wave the write through.
        return refuse(
            "unresolved_site",
            err instanceof Error ? err.message : "Could not resolve the location hierarchy."
        );
    }

    const shape = validateTopologyShape(candidate, locations);
    if (!shape.ok) return shape;

    // Creates have no children and no dependents yet; the shape rules are the
    // whole contract for them.
    if (!candidate.id || !current) return OK;
    if (isTopologyUnchanged(current, candidate)) return OK;

    const byId = new Map<string, LocationView>(locations.map((l) => [l.id, l]));
    const priorRole = canonicalUnitRoleFromStorage(current.locationType, current.unitRole);
    const nextRole = candidateEffectiveRole(candidate);

    // -- CHILD LEGALITY (Defect A) -----------------------------------------
    // Only a physical room may contain other rooms. If this row is losing that
    // role — or ceasing to be a room at all — while rooms still sit inside it,
    // refuse. Never orphan, re-parent or silently reclassify the children.
    const children = locations.filter((l) => l.parentLocationId === candidate.id);
    if (children.length > 0 && nextRole !== "physical_space") {
        const names = children
            .slice(0, 3)
            .map((c) => (c.name ?? "").trim() || "an unnamed room")
            .join(", ");
        return refuse(
            "existing_children_incompatible",
            `This physical room still contains ${children.length} room${children.length === 1 ? "" : "s"} (${names}). ` +
                "Move them out before changing its type."
        );
    }

    // -- SITE ANCESTRY (transition H) ---------------------------------------
    // A re-parent that lands the room under a different site invalidates every
    // placement, attendance and presence row that carries its site id — and none
    // of those are re-validated when the location moves. Same-site re-parenting
    // is the supported operation.
    const priorSite = siteIdThroughParent(current.parentLocationId, byId);
    const nextSite = siteIdThroughParent(candidate.parentLocationId, byId);
    if (priorSite && nextSite && priorSite !== nextSite) {
        return refuse(
            "cross_site_parent",
            "A room cannot be moved to a different site. Its attendance and placement history belongs to the site it is recorded under."
        );
    }

    // -- DEPENDENT LEGALITY (Defect B) --------------------------------------
    // A child is placed into an operational group, never into a physical room or
    // a shared space. If this row is leaving that role while a live placement
    // still names it, the placement would become semantically false.
    if (priorRole === "operational_group" && nextRole !== "operational_group") {
        const { data, error } = await supabase
            .from("child_placements")
            .select("id, status")
            .eq("org_id", orgId)
            .eq("room_location_id", candidate.id)
            .in("status", LIVE_PLACEMENT_STATUSES as string[]);
        if (error) {
            return refuse("active_placement_incompatible", error.message);
        }
        const live = (data ?? []) as { id: string }[];
        if (live.length > 0) {
            return refuse(
                "active_placement_incompatible",
                `${live.length} child${live.length === 1 ? " is" : "ren are"} currently placed in this classroom. ` +
                    "End those placements before changing its type."
            );
        }
    }

    return OK;
}
