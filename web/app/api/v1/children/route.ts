/**
 * GET /api/v1/children — children participating in service at locations this installation reaches.
 *
 * ── ENROLLMENT IS WHAT MAKES A CHILD VISIBLE ──
 *
 * Not organization membership. The authority behind this route requires an enrollment agreement at
 * a site inside the boundary, and it applies that requirement inside the select. The rule holds in
 * `org_wide` mode too: `org_wide` widens which SITES an installation reaches, it does not change
 * what makes a child a participant in service.
 *
 * The measurement that settled it: in the certification tenant only 17 of 1,519 children hold an
 * enrollment. Publishing "every child in the organization" would have exposed 1,519 records to
 * satisfy a need for 17 — a bulk PII export on the first day, from a rule that looked reasonable.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { toPublicChild } from "@/lib/platform/external/resources/peopleResources";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/children",
    operationId: "listChildren",
    subject: "children",
    rpc: "list_external_children",
    params: (params, ctx) => {
        const household = uuidFilter(params, "household_id");
        if (!household.ok) return household;
        const child = uuidFilter(params, "child_id");
        if (!child.ok) return child;

        const externalId = params.get("external_id");
        if (externalId !== null && externalId.trim() === "") {
            return { ok: false, error: { code: "invalid_filter", message: "external_id must not be blank." } };
        }

        return {
            ok: true,
            values: {
                // The caller's OWN mapping only. Another installation's alias for the same child is
                // invisible here, so an external id cannot be used to probe across a trust boundary.
                p_installation_id: ctx.installationId,
                p_household_id: household.value,
                p_child_ids: child.value ? [child.value] : null,
                p_external_id: externalId,
            },
        };
    },
    toPublic: toPublicChild,
});
