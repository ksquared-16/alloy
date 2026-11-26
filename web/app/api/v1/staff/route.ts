/**
 * GET /api/v1/staff — people employed at locations this installation reaches.
 *
 * ── A PROJECTION, NOT A NEW IDENTITY ──
 *
 * Alloy has no staff entity. Staff is Person composed with Employment, and this route publishes
 * that composition as one convenient resource without creating a second identity system: `id` is
 * the employment id, and the person is reached through it.
 *
 * Employment is organization-scoped; visibility is not. A staff member is visible only when their
 * primary location falls inside the boundary, and one with no primary location is invisible — the
 * same fail-closed rule the children use.
 *
 * Compensation is never exposable here rather than merely forbidden: pay lives in a separate
 * authority that this resource does not join. Nor does it reach payroll, tax, HR notes,
 * safeguarding, medical facts, or Alloy's own access grants — an application role is not an
 * employment role and the two are never conflated.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { toPublicStaff } from "@/lib/platform/external/resources/serviceStateResources";
import { hasScope } from "@/lib/platform/principal/principalAuthorization";

export const dynamic = "force-dynamic";

const CONTACT_SCOPE = "staff.contact.read";

export const GET = externalCollectionRoute({
    route: "/api/v1/staff",
    operationId: "listStaff",
    subject: "staff",
    rpc: "list_external_staff",
    params: (params, ctx) => {
        const site = uuidFilter(params, "site_id");
        if (!site.ok) return site;
        return {
            ok: true,
            values: {
                p_site_id: site.value,
                p_employment_status: params.get("employment_status"),
                p_include_contact: hasScope(ctx.principal, CONTACT_SCOPE),
            },
        };
    },
    toPublic: (row, ctx) => toPublicStaff(row, hasScope(ctx.principal, CONTACT_SCOPE)),
});
