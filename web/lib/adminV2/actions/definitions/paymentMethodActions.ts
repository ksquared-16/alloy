/**
 * PAYMENT METHOD ADMINISTRATION — the three acts that put an instrument on file and take it off.
 *
 * Registered capabilities, not route mutations, for the same reason every other financial act is:
 * one executor, one authorization check, one audit record, one place the operator's intent is
 * spelled. A Details panel that POSTed to its own endpoint would be a second authority over which
 * card a family's money comes from.
 *
 * ── WHY `fin.write` AND NOT `fin.provider` ──
 *
 * The opposite judgement from W1, and deliberately so. Connecting a provider decides whose bank
 * account the organisation's money lands in — a once-per-organisation act that belongs to an admin.
 * Adding a family's card is ordinary daily financial operations: `ops` does it at the front desk
 * while the parent is standing there. Requiring `fin.provider` for it would mean an administrator
 * had to be found before a parent could pay, for no gain in safety — the provider is already
 * configured, and nothing here can change where money settles.
 *
 * ── NOTHING HERE TRUSTS THE BROWSER ──
 *
 * The organisation comes from the authenticated runtime context and is applied to every read and
 * write. The ACCOUNT is named in the payload and then verified to belong to that organisation. The
 * provider's method reference is never accepted from a payload at all — it is read back from the
 * setup Alloy's own server created, so the browser cannot name an instrument it does not own.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolvePayerCandidates } from "@/lib/financials/payments/paymentSubjectModel";
import {
    beginAddPaymentMethod,
    completeAddPaymentMethod,
    readAccountMethods,
    readMethod,
    revokePaymentMethod,
    setDefaultPaymentMethod,
} from "@/lib/financials/payments/paymentMethodService";

export const PAYMENT_METHOD_ADD_ACTION_KEY = "payment_method.add";
export const PAYMENT_METHOD_SET_DEFAULT_ACTION_KEY = "payment_method.set_default";
export const PAYMENT_METHOD_REVOKE_ACTION_KEY = "payment_method.revoke";

/** Ordinary financial operations work. See the header for why this is not `fin.provider`. */
export const PAYMENT_METHOD_PERMISSION = "fin.write" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A grant read that FAILED answers `null` and denies — an unidentified caller is not an unprivileged one. */
async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(PAYMENT_METHOD_PERMISSION);
}

function denied(correlationId: string, sentence: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `${sentence} requires ${PAYMENT_METHOD_PERMISSION}.`,
        blockers: [{ code: "payment_method_permission_required", message: "Permission required." }],
    };
}

function ineligible(sentence: string) {
    return {
        eligible: false,
        blockers: [
            { code: "payment_method_permission_required", message: `${sentence} requires ${PAYMENT_METHOD_PERMISSION}.` },
        ],
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
 * THE ACCOUNT NAMED IN THE PAYLOAD MUST BE ONE THIS SESSION'S ORGANISATION HAS.
 *
 * Without this, a caller could name another tenant's customer and attach a method to it. The org
 * comes from the session; the customer is checked against it; a customer from elsewhere reads as
 * absent rather than as forbidden, because "no such account here" is the truthful answer.
 */
async function accountInOrg(supabase: SupabaseClient, orgId: string, customerId: string): Promise<boolean> {
    if (!customerId) return false;
    const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", customerId)
        .maybeSingle();
    return !error && Boolean(data);
}

/**
 * WHOSE METHOD THIS WILL BE, when the surface did not say.
 *
 * A stored method is owned by a PAYER, and the Details panel names an account rather than a person —
 * so without this the act would refuse for want of a field no operator was ever asked for.
 *
 * The default is the household's PRIMARY CONTACT: a relationship, not a responsibility. It is
 * deliberately NOT the responsible party, because defaulting the payer to whoever owes is exactly
 * the collapse `PayerCandidate.alsoResponsible` exists to warn about — a grandparent's card must not
 * silently record a parent as the payer, and using someone's card never moves what they owe.
 *
 * A caller that DOES name a payer wins; this only fills a gap.
 */
async function resolveDefaultPayer(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<string> {
    const { candidates } = await resolvePayerCandidates(supabase, { orgId, customerId });
    if (!candidates.length) return "";
    const primary = candidates.find((c) => c.isPrimaryContact) ?? candidates[0];
    return t(primary?.personId);
}

const addPaymentMethod: RegisteredAction = {
    actionKey: PAYMENT_METHOD_ADD_ACTION_KEY,
    defaultLabel: "Add payment method",
    description: "Save a card or bank account for a payer, through the provider's own secure collection.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    /*
     * ONE ACTION, TWO STAGES, because it is one operator intention.
     *
     *   begin     open the provider's collection — creates nothing canonical
     *   complete  read the provider back on the server and persist what actually exists
     *
     * Splitting these into two registered actions would let the second be invoked without the first,
     * and would spell one intention as two capabilities in every registry that lists them.
     */
    validatePayload(payload) {
        const src = payload ?? {};
        const stage = t(src.stage) || "begin";
        if (stage !== "begin" && stage !== "complete") {
            return {
                ok: false,
                blockers: [{ code: "invalid_stage", message: "Unknown step in adding a payment method.", field: "stage" }],
            };
        }
        if (!t(src.customer_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_account", message: "An account is required.", field: "customer_id" }],
            };
        }
        if (stage === "begin") {
            const rail = t(src.rail);
            if (rail !== "card" && rail !== "ach") {
                return {
                    ok: false,
                    blockers: [{ code: "invalid_rail", message: "Choose a card or a bank account.", field: "rail" }],
                };
            }
            /*
             * A payer is NOT required from the caller. The Details panel names an account, not a
             * person, and the server resolves the account's primary contact when none is given —
             * see `resolveDefaultPayer`. Requiring it here would refuse the mounted flow for want of
             * a field nobody is asked for.
             */
        } else if (!t(src.setup_ref)) {
            return {
                ok: false,
                blockers: [{ code: "missing_setup", message: "The provider session is missing.", field: "setup_ref" }],
            };
        }
        return { ok: true, value: { ...src, stage } };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Adding a payment method");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const rail = t(payload?.rail) === "ach" ? "bank account" : "card";
        return {
            summary: `Add a ${rail} for this family`,
            changes: [
                `Opens the provider's own secure collection for a ${rail}`,
                "Alloy stores a reference, the brand and the last four digits — never the full number",
                ...(rail === "bank account"
                    ? ["Records the payer's authorization to debit the account"]
                    : []),
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;
        if (!(await permitted(db, ctx.orgId, ctx.userId))) return denied(correlationId, "Adding a payment method");

        const customerId = t(payload?.customer_id);
        if (!(await accountInOrg(db, ctx.orgId, customerId))) {
            return {
                ok: false,
                correlationId,
                status: 404,
                error: "That account is not in this organization.",
                blockers: [{ code: "account_not_found", message: "Account not found." }],
            };
        }

        try {
            const stage = t(payload?.stage) || "begin";

            const namedPayer = t(payload?.payer_entity_id);
            const payerEntityId = namedPayer || (await resolveDefaultPayer(db, ctx.orgId, customerId));
            if (!payerEntityId) {
                return {
                    ok: false,
                    correlationId,
                    status: 409,
                    error: "This account has nobody who can be recorded as the payer, so a payment method cannot be attached to it.",
                    blockers: [{ code: "no_payer", message: "No payer could be resolved for this account." }],
                };
            }

            if (stage === "begin") {
                const begun = await beginAddPaymentMethod(db, {
                    orgId: ctx.orgId,
                    customerId,
                    payerEntityType: t(payload?.payer_entity_type) || "person",
                    payerEntityId,
                    rail: t(payload?.rail) === "ach" ? "ach" : "card",
                    payerEmail: t(payload?.payer_email) || null,
                    payerName: t(payload?.payer_name) || null,
                });
                if (!begun.ok) {
                    return {
                        ok: false,
                        correlationId,
                        status: begun.reason === "invalid_input" ? 400 : 502,
                        error: begun.message,
                        blockers: [{ code: begun.reason, message: begun.message }],
                    };
                }
                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: PAYMENT_METHOD_ADD_ACTION_KEY,
                        entityType: invocation.entityType,
                        entityId: t(invocation.entityId),
                        affectedId: "",
                        detail: {
                            stage: "begin",
                            setup_ref: begun.setupRef,
                            /* The browser's handle on the provider session. Not persisted anywhere. */
                            client_secret: begun.clientSecret,
                            provider_customer_ref: begun.providerCustomerRef,
                            rail: begun.rail,
                            authorization_disclosure: begun.authorizationDisclosure,
                        },
                    },
                };
            }

            const done = await completeAddPaymentMethod(db, {
                orgId: ctx.orgId,
                customerId,
                payerEntityType: t(payload?.payer_entity_type) || "person",
                payerEntityId,
                rail: t(payload?.rail) === "ach" ? "ach" : "card",
                setupRef: t(payload?.setup_ref),
                providerCustomerRef: t(payload?.provider_customer_ref),
                actorUserId: ctx.userId ?? null,
                makeDefault: payload?.make_default === true,
            });
            if (!done.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: done.reason === "no_instrument" ? 409 : done.reason === "already_claimed" ? 409 : 502,
                    error: done.message,
                    blockers: [{ code: done.reason, message: done.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_METHOD_ADD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: done.method.id,
                    detail: { stage: "complete", method: done.method },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "The payment method could not be added.");
        }
    },
};

const setDefaultMethod: RegisteredAction = {
    actionKey: PAYMENT_METHOD_SET_DEFAULT_ACTION_KEY,
    defaultLabel: "Set as default",
    description: "Choose which stored method this account is normally collected from, for one rail.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.payment_method_id)) {
            return {
                ok: false,
                blockers: [
                    { code: "missing_method", message: "A payment method is required.", field: "payment_method_id" },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Setting a default payment method");
        }
        const methodId = t(payload?.payment_method_id);
        if (methodId) {
            const method = await readMethod(supabase as SupabaseClient, { orgId: ctx.orgId, methodId });
            if (method && method.usabilityState !== "usable") {
                return {
                    eligible: false,
                    blockers: [
                        {
                            code: "method_not_usable",
                            message:
                                method.usabilityState === "revoked"
                                    ? "That payment method was removed."
                                    : "That payment method cannot currently be used.",
                        },
                    ],
                    availableTransitions: [],
                    requiredInputs: [],
                };
            }
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ supabase, ctx, payload }) {
        const method = await readMethod(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            methodId: t(payload?.payment_method_id),
        });
        const rail = method?.rail === "ach" ? "bank" : "card";
        return {
            summary: "Set the default payment method",
            changes: method
                ? [
                      `Future ${rail} collections for this account use ${method.brand ?? "this method"} ending ${method.last4 ?? "—"}`,
                      `Any other default ${rail} method for this account stops being the default`,
                      "The other rail is unaffected",
                  ]
                : ["Sets this method as the default for its rail"],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;
        if (!(await permitted(db, ctx.orgId, ctx.userId))) {
            return denied(correlationId, "Setting a default payment method");
        }
        try {
            const outcome = await setDefaultPaymentMethod(db, {
                orgId: ctx.orgId,
                methodId: t(payload?.payment_method_id),
                actorUserId: ctx.userId ?? null,
            });
            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "not_found" ? 404 : 409,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_METHOD_SET_DEFAULT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.method.id,
                    detail: { method: outcome.method },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "The default payment method could not be set.");
        }
    },
};

const revokeMethod: RegisteredAction = {
    actionKey: PAYMENT_METHOD_REVOKE_ACTION_KEY,
    defaultLabel: "Remove",
    description: "Stop using a stored payment method, keeping the record of payments it already made.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    /* Removing the instrument a family pays with is not undone by adding it again. */
    confirmationPolicy: "destructive",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.payment_method_id)) {
            return {
                ok: false,
                blockers: [
                    { code: "missing_method", message: "A payment method is required.", field: "payment_method_id" },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Removing a payment method");
        }
        const methodId = t(payload?.payment_method_id);
        if (methodId) {
            const method = await readMethod(supabase as SupabaseClient, { orgId: ctx.orgId, methodId });
            if (method?.usabilityState === "revoked") {
                return {
                    eligible: false,
                    blockers: [{ code: "already_revoked", message: "That payment method has already been removed." }],
                    availableTransitions: [],
                    requiredInputs: [],
                };
            }
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    /**
     * WHAT THE OPERATOR IS ABOUT TO LOSE, SAID BEFORE THEY CONFIRM.
     *
     * The dependency sentence is computed rather than asserted, so that when W5 gives a method
     * standing obligations this preview already has the shape to name them. W2 has no autopay, so it
     * truthfully says the only consequence there is.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const db = supabase as SupabaseClient;
        const method = await readMethod(db, { orgId: ctx.orgId, methodId: t(payload?.payment_method_id) });
        const changes: string[] = [
            "The method stops being available for collection",
            "Payments already made with it keep naming it",
        ];
        if (method?.isDefault && method.customerId) {
            const siblings = (await readAccountMethods(db, { orgId: ctx.orgId, customerId: method.customerId }))
                .filter((m) => m.id !== method.id && m.rail === method.rail && m.usabilityState === "usable");
            changes.push(
                siblings.length
                    ? `This is the default ${method.rail === "ach" ? "bank" : "card"} method — the account will have no default until one is chosen`
                    : `This is the only usable ${method.rail === "ach" ? "bank" : "card"} method on the account`,
            );
        }
        return {
            summary: method
                ? `Remove ${method.brand ?? "this method"} ending ${method.last4 ?? "—"}`
                : "Remove this payment method",
            changes,
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;
        if (!(await permitted(db, ctx.orgId, ctx.userId))) return denied(correlationId, "Removing a payment method");
        try {
            const outcome = await revokePaymentMethod(db, {
                orgId: ctx.orgId,
                methodId: t(payload?.payment_method_id),
                reason: t(payload?.reason) || null,
                actorUserId: ctx.userId ?? null,
            });
            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "not_found" ? 404 : 409,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_METHOD_REVOKE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.method.id,
                    detail: {
                        method: outcome.method,
                        /* Reported, never fatal: Alloy's record is canonical either way. */
                        provider_detached: outcome.providerDetached,
                    },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "The payment method could not be removed.");
        }
    },
};

export const paymentMethodActions: RegisteredAction[] = [addPaymentMethod, setDefaultMethod, revokeMethod];
