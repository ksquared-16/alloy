/**
 * Default-grant doctrine — frozen Phase 3 policy.
 *
 * Model A (open_until_restricted): no explicit grants → communications.send permits use.
 * Model B (explicit_grants_required): user must have an active grant with can_send.
 *
 * Transition: backfilled identities use Model A; newly created identities default to Model B.
 */

export type DefaultAccessMode = "open_until_restricted" | "explicit_grants_required";

export const DEFAULT_ACCESS_MODE_OPEN: DefaultAccessMode = "open_until_restricted";
export const DEFAULT_ACCESS_MODE_EXPLICIT: DefaultAccessMode = "explicit_grants_required";

export type GrantEvaluationInput = {
    defaultAccessMode: DefaultAccessMode;
    grantsForIdentity: Array<{ user_id: string; can_send: boolean; can_manage?: boolean; status: string }>;
    operatorUserId: string | null;
    operatorHasCommunicationsSend: boolean;
};

export type GrantEvaluationResult = {
    allowed: boolean;
    reason: "explicit_grant" | "org_communications_send" | "open_until_restricted" | "explicit_required_denied" | "no_operator";
    label: string;
};

export function evaluateIdentitySendAccess(input: GrantEvaluationInput): GrantEvaluationResult {
    if (!input.operatorUserId) {
        if (input.operatorHasCommunicationsSend) {
            return { allowed: true, reason: "org_communications_send", label: "Allowed by organization permission" };
        }
        return { allowed: false, reason: "no_operator", label: "Operator context required" };
    }

    const activeGrants = input.grantsForIdentity.filter((g) => g.status === "active");
    const userGrant = activeGrants.find((g) => g.user_id === input.operatorUserId);

    if (input.defaultAccessMode === "explicit_grants_required") {
        if (userGrant?.can_send) {
            return { allowed: true, reason: "explicit_grant", label: "Explicitly granted" };
        }
        return { allowed: false, reason: "explicit_required_denied", label: "Explicit grant required" };
    }

    // open_until_restricted
    if (activeGrants.length === 0) {
        if (input.operatorHasCommunicationsSend) {
            return { allowed: true, reason: "open_until_restricted", label: "Allowed by organization permission (no explicit grants)" };
        }
        return { allowed: false, reason: "no_operator", label: "communications.send required" };
    }

    if (userGrant?.can_send || userGrant?.can_manage) {
        return { allowed: true, reason: "explicit_grant", label: "Explicitly granted" };
    }

    return { allowed: false, reason: "explicit_required_denied", label: "Explicitly restricted" };
}

/** Whether operator may choose a non-default sender when multiple identities exist. */
export function operatorCanOverrideSender(params: {
    defaultAccessMode: DefaultAccessMode;
    grants: Array<{ user_id: string; can_override_default: boolean; can_manage: boolean; status: string }>;
    operatorUserId: string | null;
    hasCommunicationsSend: boolean;
}): boolean {
    return operatorMayUseIdentity({
        defaultAccessMode: params.defaultAccessMode,
        grants: params.grants.map((g) => ({
            user_id: g.user_id,
            can_send: false,
            can_manage: g.can_manage,
            can_override_default: g.can_override_default,
            status: g.status,
        })),
        operatorUserId: params.operatorUserId,
        hasCommunicationsSend: params.hasCommunicationsSend,
        mode: "override",
    });
}

/** Resolver integration: extend operatorAuthorized when grants exist under open mode. */
export function operatorMayUseIdentity(params: {
    defaultAccessMode: DefaultAccessMode;
    grants: Array<{ user_id: string; can_send: boolean; can_manage: boolean; can_override_default: boolean; status: string }>;
    operatorUserId: string | null;
    hasCommunicationsSend: boolean;
    mode: "send" | "override";
}): boolean {
    const active = params.grants.filter((g) => g.status === "active");
    if (params.defaultAccessMode === "explicit_grants_required") {
        if (!params.operatorUserId) return params.hasCommunicationsSend;
        const g = active.find((x) => x.user_id === params.operatorUserId);
        if (params.mode === "override") return Boolean(g?.can_override_default || g?.can_manage);
        return Boolean(g?.can_send || g?.can_manage);
    }
    if (active.length === 0) return params.hasCommunicationsSend;
    if (!params.operatorUserId) return params.hasCommunicationsSend;
    const g = active.find((x) => x.user_id === params.operatorUserId);
    if (params.mode === "override") return Boolean(g?.can_override_default || g?.can_manage || params.hasCommunicationsSend);
    return Boolean(g?.can_send || g?.can_manage || params.hasCommunicationsSend);
}
