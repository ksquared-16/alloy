/**
 * Perform an unsubscribe, from a token and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE AUTHORITY BOUNDARY
 * ---------------------------------------------------------------------------
 *
 * Every value that decides WHAT changes comes out of the verified token: the Person, the
 * organization, and the single category. Nothing is read from the request. A recipient can
 * therefore only ever do the one thing their link was minted for, and the guarantees the
 * audit asked for fall out of that rather than being enforced by a series of checks:
 *
 *   · cannot alter another Person   — `p` is signed
 *   · cannot alter another org      — `o` is signed
 *   · cannot switch categories      — `c` is signed
 *   · tampering fails               — any edit breaks the HMAC
 *
 * The mutation itself goes through `persistCommunicationPreference`, the same function the
 * operator surface uses, so the preference row and the append-only event are written by one
 * authority regardless of who asked. There is no second unsubscribe store, and there is no
 * second way to write a preference.
 *
 * IDEMPOTENT by construction: the target state is `opted_out` whatever the current state
 * is, so a recipient clicking twice — or a mail client prefetching the link — produces the
 * same row. The event trail still records each request, because "asked again" is a real
 * fact and collapsing it would hide a recipient asking twice because nothing happened.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { persistCommunicationPreference } from "@/lib/communications/v2/persistCommunicationPreference";
import type { PreferenceState } from "@/lib/communications/v2/preferences";
import {
    verifyUnsubscribeToken,
    type UnsubscribableCategory,
} from "@/lib/communications/preferences/unsubscribeToken";

export type UnsubscribeOutcome =
    | { ok: true; category: UnsubscribableCategory; alreadyOptedOut: boolean }
    | { ok: false; reason: "invalid_token" | "expired" | "unknown_recipient" | "write_failed" };

/**
 * Apply the unsubscribe named by `token`.
 *
 * Never throws, and never distinguishes "this Person does not exist" from "this Person is
 * not in that org" — both answer `unknown_recipient`. A recipient holding a bad link learns
 * that it did not work, and an attacker probing ids learns nothing about which half was
 * wrong.
 */
export async function applyUnsubscribeToken(
    supabase: SupabaseClient,
    token: string | null | undefined,
    options: { nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<UnsubscribeOutcome> {
    const verified = verifyUnsubscribeToken(token, options);
    if (!verified.ok) {
        return { ok: false, reason: verified.reason === "expired" ? "expired" : "invalid_token" };
    }
    const { p: personId, o: orgId, c: category } = verified.claims;
    try {
        return await performUnsubscribe(supabase, { personId, orgId, category });
    } catch {
        // A recipient asking to stop must never see a stack trace, and an outage must not
        // read to them as "your request was rejected". `write_failed` is the honest answer:
        // nothing changed, and it was not their fault.
        return { ok: false, reason: "write_failed" };
    }
}

async function performUnsubscribe(
    supabase: SupabaseClient,
    params: { personId: string; orgId: string; category: UnsubscribableCategory },
): Promise<UnsubscribeOutcome> {
    const { personId, orgId, category } = params;

    // The token asserts the pair; the database confirms it. A signed claim proves nobody
    // edited the link — it does not prove the Person still belongs to that organization.
    const { data: person, error: personError } = await supabase
        .from("persons")
        .select("id")
        .eq("id", personId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (personError || !person) return { ok: false, reason: "unknown_recipient" };

    const { data: existing } = await supabase
        .from("communication_preferences")
        .select("state")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .eq("category", category)
        .maybeSingle();

    const fromState =
        existing && typeof existing === "object" && "state" in existing ?
            ((existing as { state: PreferenceState }).state ?? null)
        :   null;

    const result = await persistCommunicationPreference(supabase, {
        orgId,
        personId,
        category,
        fromState,
        toState: "opted_out",
        // Provenance the operator surface can read back: this was the recipient's own
        // decision, not an operator's, and the audit trail should never blur the two.
        source: "recipient_unsubscribe",
        method: "email_link",
        actorUserId: null,
    });
    if (!result.ok) return { ok: false, reason: "write_failed" };

    return { ok: true, category, alreadyOptedOut: fromState === "opted_out" };
}
