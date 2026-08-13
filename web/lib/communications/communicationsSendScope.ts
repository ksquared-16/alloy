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
 * Organization-level conversations — Director ruling, 2026-08-12
 * ---------------------------------------------------------------------------
 *
 * An earlier revision let ANY operator with `communications.send` answer an
 * organization-level conversation, reasoning that "no location" meant "no
 * boundary to cross". That was overturned, and the ruling is the right one:
 *
 *     No location on a conversation does NOT mean every location-scoped
 *     operator may access it.
 *
 * The general inbox is where unknown senders, quarantine releases and
 * organization-wide correspondence land. A Riverside-only operator having free
 * rein there is precisely the leak this layer exists to prevent — "unscoped" is
 * not "public".
 *
 * So an organization-level conversation now requires ORGANIZATION-WIDE access:
 * `siteScope === "all"`, which is Access V2's existing representation of exactly
 * that. Nothing new was defined.
 *
 * ---------------------------------------------------------------------------
 * The escape hatch is an EXISTING canonical authority, not an exception
 * ---------------------------------------------------------------------------
 *
 * A thread explicitly ASSIGNED to a user grants that user access to it —
 * `communication_threads.assigned_user_id` / `assignment_state`, the platform's
 * own assignment model. That is what makes the strict rule workable rather than
 * paralysing: a site-restricted operator can be handed a specific organization
 * conversation deliberately, by name, and answer it — without being handed the
 * whole general inbox.
 *
 * Assignment is checked BEFORE scope for exactly that reason: a deliberate,
 * auditable grant should not be overridden by a blanket scope rule.
 *
 * Pure. Values in, decision out.
 */

export type SiteScopeMode = "all" | "restricted";

export type SendScopeInput = {
    /** From `hasCommunicationsSendPermission` — org RBAC, already resolved. */
    hasCommunicationsSend: boolean;
    /** From the admin access bundle. `"all"` IS Access V2's org-wide representation. */
    siteScope: SiteScopeMode;
    /** From the admin access bundle. `null` means "no locations listed". */
    allowedSiteLocationIds: string[] | null;
    /** The conversation's location. `null` = organization-level conversation. */
    conversationLocationId: string | null | undefined;
    /** `communication_threads.assigned_user_id` — the canonical assignment model. */
    assignedUserId?: string | null;
    /** The acting operator, for the assignment check. */
    actorUserId?: string | null;
};

export type SendScopeDecision =
    | {
          allowed: true;
          reason: "assigned_to_actor" | "organization_wide" | "site_unrestricted" | "site_permitted";
      }
    | {
          allowed: false;
          reason: "no_send_permission" | "location_not_permitted" | "organization_access_required";
          message: string;
      };

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

    // A deliberate, auditable grant of THIS conversation. Checked first so a
    // blanket scope rule cannot override an explicit assignment.
    const assigned = normalize(input.assignedUserId);
    const actor = normalize(input.actorUserId);
    if (assigned !== null && actor !== null && assigned === actor) {
        return { allowed: true, reason: "assigned_to_actor" };
    }

    if (conversationLocation === null) {
        // Organization-level: requires organization-wide access. "Unscoped" is not
        // "public" — see the Director ruling in the header.
        if (input.siteScope === "all") return { allowed: true, reason: "organization_wide" };
        return {
            allowed: false,
            reason: "organization_access_required",
            message: "This conversation belongs to the whole organization, and you have access to specific locations only.",
        };
    }

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
