/**
 * Operator copy for a canonical topology refusal.
 *
 * The server answers with a NAMED code (Slice 3). The form reads the code, never
 * the sentence — matching on English would break the moment the server reworded
 * anything, and it is exactly how a stack trace ends up in front of an operator.
 *
 * A code with no entry here falls back to the server's own sentence, which is
 * already written for an operator; the fallback exists so an unmapped future
 * code degrades to something readable rather than to silence.
 */

import type { TopologyRefusalCode } from "@/lib/location/topologyMutationAuthority";

const CREATE_REFUSAL_COPY: Partial<Record<TopologyRefusalCode, string>> = {
    invalid_parent_role: "That room can't go inside the space you picked. Choose a physical room instead.",
    invalid_parent_type: "A room has to belong to a site or to a physical room.",
    nested_physical_space: "A physical room can't go inside another physical room.",
    parent_not_direct_child_of_site: "That physical room isn't set up to contain classrooms.",
    parent_not_found: "The physical room you picked is no longer available. Refresh and try again.",
    parent_required: "Pick the site or physical room this belongs to.",
    cross_site_parent: "Inside must be a physical room at the same site.",
    topology_cycle: "That would place a room inside itself.",
    unresolved_site: "That room doesn't belong to a site yet.",
    invalid_unit_role: "That room type isn't available.",
    role_only_on_unit: "A room type applies only to a room.",
    existing_children_incompatible: "That room still contains other rooms.",
    active_placement_incompatible: "Children are currently placed in that classroom.",
};

/** Operator-safe sentence for a refusal, by code. */
export function topologyRefusalCopy(code: string | null | undefined, fallback: string): string {
    if (!code) return fallback;
    return CREATE_REFUSAL_COPY[code as TopologyRefusalCode] ?? fallback;
}
