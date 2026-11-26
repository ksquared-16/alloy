/**
 * THE REQUEST AN OPERATOR MAKES, AND THE AUTHORITY IT IS NOT.
 *
 * An operator may ask a payer to put a bank account on file. That request mints a link addressed to
 * ONE named person and writes nothing else — no payment method, no mandate, no provider object, no
 * canonical row of any kind. Nothing about the request authorizes a debit, and if the payer never
 * opens it, the account is exactly as it was.
 *
 * ── WHY THE REQUEST CANNOT BE THE AUTHORIZATION ──
 *
 * Saving a bank account establishes a DEBIT MANDATE, and Stripe's ACH terms place the warranty on
 * the platform: it must hold the account holder's authorization, BY NAME, before a debit is
 * initiated, and the provider emails the mandate confirmation to that person. An operator pressing
 * through that on a parent's behalf produces three untruths at once — Alloy warrants an
 * authorization nobody gave, the named authorizing customer was not present, and the payer receives
 * confirmation of a debit authorization they never agreed to.
 *
 * So the two halves are split by construction rather than by policy: this module mints and resolves,
 * the payer's own surface authorizes, and the canonical `payment_methods` row is written by the same
 * writer the operator surface uses for a card. See
 * `docs/platform/financials/payments-bank-setup-handoff.md`.
 *
 * ── THE PAYER IS NAMED, NEVER INFERRED ──
 *
 * `entity_id` on the link IS the payer. Not the household's primary contact, not whoever is
 * responsible for the fees, and not the operator who made the request. A household has more than
 * one adult and a bank account belongs to exactly one of them, so a link that names nobody resolves
 * to nothing rather than to a guess.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { createActionLink } from "@/lib/actionLinks";
import { getPublicAppOrigin } from "@/lib/publicAppUrl";

export const BANK_SETUP_ACTION_TYPE = "payment_method_setup" as const;

/**
 * How long a payer has. Seven days, set explicitly.
 *
 * `createActionLink` defaults to two hours, which is right for confirming an appointment and wrong
 * for this: a parent receives the request during the working day and deals with their bank that
 * evening or at the weekend. The default is NOT widened — every appointment link on the platform
 * would have inherited the longer life.
 */
export const BANK_SETUP_LINK_MINUTES = 7 * 24 * 60;

const t = (v: unknown): string => (v != null ? String(v).trim() : "");

/**
 * Where the payer goes. The BEARER token, never the short code.
 *
 * `/a/<short-code>` exists and is how a parent already receives an appointment link, and it is
 * deliberately not offered for this one: after S-3 a short code cannot be exchanged for the
 * plaintext token, and eight characters is the wrong credential for a standing authorization to
 * debit a bank account. The entry page refuses a short code for this action type for the same
 * reason.
 */
export function buildBankSetupUrl(token: string, originOverride?: string | null): string {
    const bearer = t(token);
    if (!bearer) return "";
    const override = t(originOverride).replace(/\/$/, "");
    const root = override || getPublicAppOrigin() || "";
    const path = `/bank-setup/${encodeURIComponent(bearer)}`;
    return root ? `${root}${path}` : path;
}

export type BankSetupRequestOutcome =
    | { ok: true; token: string; url: string; expiresInMinutes: number }
    | { ok: false; reason: "invalid_input" | "mint_failed"; message: string };

/**
 * Mint the request. Writes an `action_links` row and NOTHING in Financials.
 *
 * The plaintext token is returned because it has to be — it goes in the URL the payer receives —
 * and is never persisted: the row carries the digest.
 */
export async function requestBankAccountSetup(args: {
    orgId: string;
    customerId: string;
    payerEntityId: string;
    requestedByUserId?: string | null;
}): Promise<BankSetupRequestOutcome> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);
    const payerEntityId = t(args.payerEntityId);
    if (!orgId || !customerId || !payerEntityId) {
        return { ok: false, reason: "invalid_input", message: "An organization, an account and a payer are required." };
    }

    const minted = await createActionLink(null, {
        org_id: orgId,
        action_type: BANK_SETUP_ACTION_TYPE,
        /* The payer, named. This is the whole point of the link. */
        entity_type: "person",
        entity_id: payerEntityId,
        expires_in_minutes: BANK_SETUP_LINK_MINUTES,
        metadata: {
            customer_id: customerId,
            rail: "ach",
            /*
             * WHO ASKED — provenance only, and deliberately never read as authority. A later reader
             * that resolved the payer from this field would be doing exactly what this design
             * exists to refuse.
             */
            requested_by_user_id: t(args.requestedByUserId) || null,
        },
    });

    if (!minted) return { ok: false, reason: "mint_failed", message: "The request link could not be created." };
    return {
        ok: true,
        token: minted.token,
        url: buildBankSetupUrl(minted.token),
        expiresInMinutes: BANK_SETUP_LINK_MINUTES,
    };
}

export type ResolvedBankSetupLink = {
    readonly linkId: string;
    readonly orgId: string;
    readonly customerId: string;
    readonly payerEntityId: string;
};

export type BankSetupLinkResolution =
    | { ok: true; link: ResolvedBankSetupLink }
    | { ok: false; reason: "unknown" | "expired" | "used" | "revoked" | "malformed"; message: string };

/** Columns that still exist after S-3. `token` is deliberately absent — it was dropped. */
const LINK_COLUMNS =
    "id, org_id, action_type, entity_type, entity_id, metadata, consumed_at, expires_at, revoked_at";

/**
 * Turn a bearer token into the org, account and payer it names — or refuse.
 *
 * BY DIGEST ONLY. A short code is not accepted here: the entry page already refuses one for this
 * action type, and accepting it in the API would put the weaker credential back on the same door.
 *
 * Revocation, expiry and consumption are three DIFFERENT answers and are kept apart, because
 * "already done", "too late" and "withdrawn by the organisation" send a parent to three different
 * next steps. None of them is "forbidden": a link this server does not recognise is unknown, not
 * denied, and saying otherwise would confirm to a stranger that some other token exists.
 */
export async function resolveBankSetupLink(
    supabase: SupabaseClient,
    token: string,
): Promise<BankSetupLinkResolution> {
    const bearer = t(token);
    if (!bearer) return { ok: false, reason: "unknown", message: "This link is not valid." };

    const { data, error } = await supabase
        .from("action_links")
        .select(LINK_COLUMNS)
        .eq("token_hash", hashFormLinkToken(bearer))
        .maybeSingle();

    if (error || !data) return { ok: false, reason: "unknown", message: "This link is not valid." };
    const row = data as Record<string, unknown>;

    if (t(row.action_type) !== BANK_SETUP_ACTION_TYPE) {
        /* A real link for a different act. Unknown HERE is the truthful answer. */
        return { ok: false, reason: "unknown", message: "This link is not valid." };
    }
    if (t(row.revoked_at)) {
        return { ok: false, reason: "revoked", message: "This request was withdrawn. Ask your provider for a new one." };
    }
    if (t(row.consumed_at)) {
        return { ok: false, reason: "used", message: "This request has already been completed." };
    }
    const expiresAt = new Date(t(row.expires_at));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
        return { ok: false, reason: "expired", message: "This request has expired. Ask your provider for a new one." };
    }

    const orgId = t(row.org_id);
    const payerEntityId = t(row.entity_type) === "person" ? t(row.entity_id) : "";
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const customerId = t(metadata.customer_id);

    /*
     * A link missing any of the three is malformed, not a licence to fill the gap. Resolving the
     * account from the payer, or the payer from the account, is the inference this design refuses.
     */
    if (!orgId || !payerEntityId || !customerId) {
        return { ok: false, reason: "malformed", message: "This link is incomplete. Ask your provider for a new one." };
    }

    return { ok: true, link: { linkId: t(row.id), orgId, customerId, payerEntityId } };
}

/**
 * Close the request, once, when the bank account is actually on file.
 *
 * `.is("consumed_at", null)` puts the predicate in the WRITE, so the database decides a race
 * between two tabs rather than a read-then-write that both pass. It is called AFTER the method is
 * saved and never before: a payer who closes the provider's window mid-flow has authorized nothing,
 * and burning their link would strand them with no way back in.
 */
export async function consumeBankSetupLink(supabase: SupabaseClient, linkId: string): Promise<boolean> {
    const id = t(linkId);
    if (!id) return false;
    const { data, error } = await supabase
        .from("action_links")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", id)
        .is("consumed_at", null)
        .select("id");
    return !error && Array.isArray(data) && data.length > 0;
}
