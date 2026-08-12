/**
 * May THIS operator send in THIS conversation?
 *
 * The accepted model:
 *
 *     organization / location  →  OWNS the Communications identity
 *     user                     →  has PERMISSION to use it
 *
 * So this answers an authorization question and nothing else. It never chooses an
 * identity, never sees a credential, and never widens what an operator may send
 * AS. Identity resolution has already happened by the time this runs, from the
 * conversation's location — which is why a Riverside conversation sends from
 * Riverside's address no matter who is typing.
 *
 * ---------------------------------------------------------------------------
 * Built from Access V2 as it already exists — no Communications ACL
 * ---------------------------------------------------------------------------
 *
 * Two authorities compose, both already resolved for every admin request:
 *
 *   `communications.send`      — may this user send at all
 *                                (`communicationPermissions.ts`, org RBAC, with
 *                                 the admin/ops bypass and the legacy alias)
 *   `siteScope` + `allowedSiteLocationIds`
 *                              — which locations may this user act in
 *                                (`resolveAdminAccessCore`, backed by
 *                                 `user_site_access`)
 *
 * Nothing new was added. The earlier audit reported that
 * `role_permission_grants` carries no location and concluded Access V2 could not
 * express location send-as. That was half the picture: the GRANT is org-wide, but
 * site MEMBERSHIP is already modelled and already resolved, and the composition
 * of the two is exactly the required condition.
 *
 * ---------------------------------------------------------------------------
 * The judgment call, stated because it is one
 * ---------------------------------------------------------------------------
 *
 * A site-restricted operator and an ORGANIZATION-level conversation: allowed.
 *
 * An organization-level conversation has no location, so there is no location the
 * operator is excluded from — the rule "may not act in a location they cannot
 * access" simply does not apply. The alternative reading (deny unless
 * organization-wide) would make the general inbox, which is exactly where unknown
 * senders and quarantine releases land, answerable only by administrators. That
 * is an operational failure mode rather than a safety one, and the safety gain is
 * nil because no location boundary is being crossed.
 *
 * Pure. Values in, decision out.
 */

export type SiteScopeMode = "all" | "restricted";

export type SendScopeInput = {
    /** From `hasCommunicationsSendPermission` — org RBAC, already resolved. */
    hasCommunicationsSend: boolean;
    /** From the admin access bundle. */
    siteScope: SiteScopeMode;
    /** From the admin access bundle. `null` means "not restricted". */
    allowedSiteLocationIds: string[] | null;
    /** The conversation's location. `null` = organization-level conversation. */
    conversationLocationId: string | null | undefined;
};

export type SendScopeDecision =
    | { allowed: true; reason: "organization_conversation" | "site_unrestricted" | "site_permitted" }
    | { allowed: false; reason: "no_send_permission" | "location_not_permitted"; message: string };

function normalize(value: string | null | undefined): string | null {
    const v = (value ?? "").trim();
    return v ? v : null;
}

export function decideCommunicationsSendScope(input: SendScopeInput): SendScopeDecision {
    if (!input.hasCommunicationsSend) {
        return {
            allowed: false,
            reason: "no_send_permission",
            // Deliberately says nothing about the conversation or its location —
            // an operator without send permission learns only that.
            message: "You do not have permission to send communications.",
        };
    }

    const conversationLocation = normalize(input.conversationLocationId);

    // No location on the conversation means no location boundary to enforce.
    if (conversationLocation === null) return { allowed: true, reason: "organization_conversation" };

    if (input.siteScope === "all") return { allowed: true, reason: "site_unrestricted" };

    // Restricted with no list is a denial, not a pass. An empty allow-list means
    // "permitted nowhere"; reading it as "permitted everywhere" would invert the
    // restriction exactly where it matters most.
    const allowed = input.allowedSiteLocationIds ?? [];
    if (allowed.some((id) => normalize(id) === conversationLocation)) {
        return { allowed: true, reason: "site_permitted" };
    }

    return {
        allowed: false,
        reason: "location_not_permitted",
        // Names no address, no identity, and no other location.
        message: "You do not have access to the location this conversation belongs to.",
    };
}
