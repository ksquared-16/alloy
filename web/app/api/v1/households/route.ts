/**
 * GET /api/v1/households — the household a visible child belongs to.
 *
 * ── AN ANCHOR, NEVER AN AUTHORITY ──
 *
 * A household appears in this collection because at least one of its children is independently
 * visible. It grants sight of nothing further. A sibling enrolled only at a site outside the
 * boundary does not appear in `/children`, and nothing here reveals that they exist — no id, no
 * count, no member list. One household in the certification tenant already spans two sites, so
 * this is a live case and not a hypothetical one.
 *
 * The response is deliberately a thin shell. Payment instruments live on the same domain row —
 * `stripe_customer_id`, the stored payment method and its brand and last four digits — and the SQL
 * authority never selects them.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { toPublicHousehold } from "@/lib/platform/external/resources/peopleResources";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/households",
    operationId: "listHouseholds",
    subject: "households",
    rpc: "list_external_households",
    params: (params) => {
        const household = uuidFilter(params, "household_id");
        if (!household.ok) return household;
        return { ok: true, values: { p_household_ids: household.value ? [household.value] : null } };
    },
    toPublic: toPublicHousehold,
});
