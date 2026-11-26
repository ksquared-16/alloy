/**
 * A STAFF RECIPIENT — a member of the organization a product notification is addressed to.
 *
 * Communications' one answer to "may this staff member be sent this, and where": the canonical enqueue
 * calls it for a typed `staffRecipient` and takes the address from here, never from the caller. Authorized
 * means all of:
 *   - a member of the organization (a role in it — the same membership the access resolver enforces);
 *   - holding the capability the caller names (the power to act on what the message is about, e.g.
 *     `tours.book` for a tour);
 *   - site scope over the record's location (an all-sites member, or one whose sites contain it);
 *   - a usable email address on their account.
 * Anything else is a refusal with a reason the enqueue persists on a blocked row — an auditable non-send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { locationAllowedUnderSiteScope } from "@/lib/admin/accessScope";
import { resolveAdminAccessDimensionsForOrgMember } from "@/lib/admin/resolveAdminAccessCore";

export type StaffRecipientRequest = {
    userId: string;
    /** The record's location; site scope is checked against it. Null only for org-wide records. */
    locationId: string | null;
    /** The capability the recipient must hold for this message's subject. */
    capability: string;
};

export type StaffRecipientResolution =
    | { ok: true; userId: string; email: string }
    | { ok: false; userId: string; reason: "not_a_member" | "lacks_capability" | "outside_location_scope" | "no_email" | "lookup_failed"; message: string };

export async function resolveAuthorizedStaffRecipient(
    supabase: SupabaseClient,
    orgId: string,
    req: StaffRecipientRequest
): Promise<StaffRecipientResolution> {
    const userId = String(req.userId ?? "").trim();
    const refuse = (reason: Extract<StaffRecipientResolution, { ok: false }>["reason"], message: string): StaffRecipientResolution => ({ ok: false, userId, reason, message });
    if (!userId) return refuse("not_a_member", "No staff recipient was named.");
    try {
        const dims = await resolveAdminAccessDimensionsForOrgMember(supabase, userId, orgId);
        if (!dims) return refuse("not_a_member", "The staff recipient is not a member of this organization.");
        if (!dims.permissionKeys.includes(req.capability)) {
            return refuse("lacks_capability", `The staff recipient does not hold ${req.capability}.`);
        }
        const inScope = await locationAllowedUnderSiteScope(
            supabase,
            orgId,
            { departmentScope: dims.departmentScope, allowedDepartmentIds: dims.allowedDepartmentIds, siteScope: dims.siteScope, allowedSiteLocationIds: dims.allowedSiteLocationIds },
            req.locationId
        );
        if (!inScope) return refuse("outside_location_scope", "The staff recipient has no access to this location.");
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error) return refuse("lookup_failed", "The staff recipient's account could not be read.");
        const email = typeof data?.user?.email === "string" ? data.user.email.trim() : "";
        if (!email) return refuse("no_email", "The staff recipient has no email address.");
        return { ok: true, userId, email };
    } catch {
        return refuse("lookup_failed", "The staff recipient could not be verified.");
    }
}
