/**
 * PROVIDER INSTALLATION — the three acts that make an organisation able to take payments.
 *
 * These are registered capabilities, not route mutations, for the same reason every other financial
 * act is: one executor, one authorization check, one audit record, and one place the operator's
 * intent is spelled. A settings page that POSTed to its own endpoint would be a second authority
 * over where a family's money settles.
 *
 * ── WHY `fin.provider` AND NOT `fin.write` ──
 *
 * `fin.write` is held by `ops`, the role that records cheques and collects cards all day. Connecting
 * a provider does not take money — it decides WHOSE BANK ACCOUNT money lands in, for the whole
 * organisation, for every family. The platform already drew this distinction once when it minted
 * `fin.post` rather than widening `fin.write`, and the database already refuses to let an existing
 * merchant be repointed. This permission is that same judgement at the authority layer.
 *
 * ── NOTHING HERE TRUSTS THE BROWSER ──
 *
 * The organisation comes from the authenticated runtime context. The provider account reference is
 * returned by the provider and never accepted from a payload — there is deliberately no parameter
 * through which an operator could type one, because that is how one organisation claims another's
 * merchant account.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    connectProviderMerchant,
    disconnectProviderMerchant,
    readInstallationState,
    refreshProviderReadiness,
} from "@/lib/financials/payments/providerInstallation";

export const PROVIDER_CONNECT_ACTION_KEY = "provider.connect";
export const PROVIDER_REFRESH_ACTION_KEY = "provider.refresh_readiness";
export const PROVIDER_DISCONNECT_ACTION_KEY = "provider.disconnect";

/** One key for all three: establishing, refreshing and withdrawing are one authority. */
export const PROVIDER_PERMISSION = "fin.provider" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A grant read that FAILED answers `null` and denies — an unidentified caller is not an unprivileged one. */
async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(PROVIDER_PERMISSION);
}

function denied(correlationId: string, sentence: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `${sentence} requires ${PROVIDER_PERMISSION}.`,
        blockers: [{ code: "provider_permission_required", message: "Permission required." }],
    };
}

function ineligible(sentence: string) {
    return {
        eligible: false,
        blockers: [{ code: "provider_permission_required", message: `${sentence} requires ${PROVIDER_PERMISSION}.` }],
        availableTransitions: [],
        requiredInputs: [],
    };
}

function failed(correlationId: string, err: unknown, fallback: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 500,
        error: err instanceof Error ? err.message : fallback,
    };
}

/**
 * WHERE THE OPERATOR COMES BACK TO.
 *
 * Returning from the provider proves only that the flow was entered and exited — the operator may
 * have saved for later. Both URLs land on the Payments chapter, which refreshes readiness on
 * arrival, so the answer always comes from the provider rather than from the redirect.
 */
function onboardingUrls(payload: Record<string, unknown> | undefined): { returnUrl: string; refreshUrl: string } {
    const base = t(payload?.origin) || t(process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000";
    const chapter = `${base.replace(/\/$/, "")}/organization/financials?chapter=payments`;
    return { returnUrl: `${chapter}&provider=returned`, refreshUrl: `${chapter}&provider=retry` };
}

const connectProvider: RegisteredAction = {
    actionKey: PROVIDER_CONNECT_ACTION_KEY,
    defaultLabel: "Connect payment provider",
    description: "Connect this organization to a payment provider so it can accept card and bank payments.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    // Organization-grain configuration: it is about the org, not about any record in it.
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.display_name)) {
            return {
                ok: false,
                blockers: [{ code: "missing_display_name", message: "A business name is required.", field: "display_name" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Connecting a payment provider");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ supabase, ctx }) {
        const state = await readInstallationState(supabase as SupabaseClient, ctx.orgId);
        return {
            summary: state.connected ? "Continue payment provider setup" : "Connect a payment provider",
            changes: state.connected
                ? ["Opens setup again for the provider account this organization already has"]
                : [
                      "Creates a provider account this organization owns",
                      "Opens the provider's own setup, which collects its business details",
                      "Alloy stores none of those details",
                  ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return denied(correlationId, "Connecting a payment provider");
        }
        try {
            const urls = onboardingUrls(payload);
            const outcome = await connectProviderMerchant(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                actorUserId: ctx.userId ?? null,
                displayName: t(payload?.display_name),
                contactEmail: t(payload?.contact_email) || null,
                country: t(payload?.country) || undefined,
                returnUrl: urls.returnUrl,
                refreshUrl: urls.refreshUrl,
            });
            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "already_ready" ? 409 : 502,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PROVIDER_CONNECT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.state.merchantId ?? "",
                    detail: {
                        // A resumed connect is a SUCCESS that created nothing, and says so.
                        created: outcome.created,
                        resumed: outcome.resumed,
                        onboarding_url: outcome.onboardingUrl,
                        state: outcome.state,
                    },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "The payment provider could not be connected.");
        }
    },
};

const refreshProvider: RegisteredAction = {
    actionKey: PROVIDER_REFRESH_ACTION_KEY,
    defaultLabel: "Refresh status",
    description: "Ask the payment provider what this organization can currently accept, and record it.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Refreshing the payment provider");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Ask the provider what this organization can accept",
            changes: ["Records the provider's current answer. Nothing else changes."],
        };
    },

    async execute({ supabase, ctx, invocation }) {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return denied(correlationId, "Refreshing the payment provider");
        }
        try {
            const outcome = await refreshProviderReadiness(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                actorUserId: ctx.userId ?? null,
            });
            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "not_connected" ? 409 : 502,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PROVIDER_REFRESH_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.state.merchantId ?? "",
                    detail: { state: outcome.state },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "The provider status could not be refreshed.");
        }
    },
};

const disconnectProvider: RegisteredAction = {
    actionKey: PROVIDER_DISCONNECT_ACTION_KEY,
    defaultLabel: "Disconnect",
    description: "Stop using this payment provider for new payments. Existing payment history is unchanged.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    // Disconnecting stops an organisation being able to take card and bank payments. It is asked for.
    confirmationPolicy: "destructive",

    validatePayload(payload) {
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Disconnecting the payment provider");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Stop taking card and bank payments",
            changes: [
                "New card and bank payments become unavailable for this organization",
                "Payments already received, and the account that collected them, are unchanged",
                "The provider account itself is not closed — it belongs to this organization",
            ],
        };
    },

    async execute({ supabase, ctx, invocation }) {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return denied(correlationId, "Disconnecting the payment provider");
        }
        try {
            const outcome = await disconnectProviderMerchant(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                actorUserId: ctx.userId ?? null,
            });
            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: 409,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PROVIDER_DISCONNECT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.withdrewMerchantId,
                    detail: {
                        withdrew_merchant_id: outcome.withdrewMerchantId,
                        // Said explicitly, because "disconnect" is the word an operator most fears.
                        history_preserved: true,
                        state: outcome.state,
                    },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "The payment provider could not be disconnected.");
        }
    },
};

export const providerInstallationActions: RegisteredAction[] = [
    connectProvider,
    refreshProvider,
    disconnectProvider,
];

/** Re-exported for surfaces that need the current state without invoking an action. */
export { readInstallationState };
