/**
 * GET /api/v1/relationships — who a visible child's adults are, and whether they may collect them.
 *
 * ── THE EDGE IS THE RESOURCE ──
 *
 * A relationship is not a flag on a child and not a flag on a person. It is its own row with its
 * own id, status and clock, because one person holds different authority for different children —
 * a parent to one child may be an emergency contact only to another. Flattening that into booleans
 * on either end loses the distinction the domain exists to keep.
 *
 * An edge is visible exactly when its CHILD is. Relationships never widen the people a caller can
 * see; they describe the people it can already reach.
 *
 * ── PICKUP AUTHORITY IS COMPUTED, AND THE RAW ROLE IS NEVER PUBLISHED ──
 *
 * `authorized_pickup` on the relationship role says a person MAY collect a child. An active
 * safeguarding restriction says they MAY NOT. Those are different tables, and in the certification
 * tenant two such restrictions are live right now — one naming a person, one naming its subject
 * only in free text. Publishing the role alone would tell a partner that someone may collect a
 * child while a protective order says otherwise.
 *
 * So the role is never published. `pickup_authorized` is computed where both authorities are in
 * scope, fails closed, and carries no reason: a partner learns true or false and nothing about
 * why, because why is safeguarding information.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { toPublicRelationship } from "@/lib/platform/external/resources/peopleResources";
import { hasScope } from "@/lib/platform/principal/principalAuthorization";

export const dynamic = "force-dynamic";

const CONTACT_SCOPE = "relationships.contact.read";

export const GET = externalCollectionRoute({
    route: "/api/v1/relationships",
    operationId: "listRelationships",
    subject: "relationships",
    rpc: "list_external_relationships",
    params: (params, ctx) => {
        const child = uuidFilter(params, "child_id");
        if (!child.ok) return child;
        const household = uuidFilter(params, "household_id");
        if (!household.ok) return household;

        return {
            ok: true,
            values: {
                p_child_id: child.value,
                p_household_id: household.value,
                /*
                 * Contact points are a SEPARATE grant, and it is enforced at the source: without
                 * the scope the SQL returns NULL for those columns. Nothing downstream has to
                 * remember to remove them.
                 */
                p_include_contact: hasScope(ctx.principal, CONTACT_SCOPE),
            },
        };
    },
    toPublic: (row, ctx) => toPublicRelationship(row, hasScope(ctx.principal, CONTACT_SCOPE)),
});
