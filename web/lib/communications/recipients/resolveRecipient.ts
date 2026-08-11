/**
 * Server-authoritative recipient resolution — Phase 1 Slice 1, step 2.
 *
 * Shape validation (typedRecipient.ts) proves the request is well-formed.
 * THIS proves the recipient actually exists, belongs to the org, and has a
 * usable channel. The two stay separate because only this half needs I/O.
 *
 * THE INVARIANT: a failed person resolution returns `blocked` or `invalid`.
 * It NEVER returns an external_operational_recipient. There is no code path
 * here that converts one kind into another.
 *
 * SCHEMA NOTE, stated because it shapes `needs_selection`: `persons` carries a
 * single `email` and a single `phone`. There is no per-person multi-address
 * table today. So ambiguity is never "which of three emails" — it is "the
 * caller did not say email or sms, and this person has both". Resolution is
 * therefore deterministic by construction, and we return needs_selection rather
 * than picking a channel on the caller's behalf.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MessageChannel } from "@/lib/communications/eligibility/types";
import type { TypedRecipient } from "@/lib/communications/recipients/typedRecipient";

export type RecipientResolutionStatus = "resolved" | "needs_selection" | "blocked" | "invalid";

/**
 * The canonical facts downstream needs — and nothing else. Deliberately does
 * not carry the person row, permission internals, or unrelated contact data.
 */
export type ResolvedRecipientFacts = {
    kind: TypedRecipient["kind"];
    /** Present for person and (where linked) internal_user. */
    personId: string | null;
    /** Present for internal_user. */
    userId: string | null;
    channel: MessageChannel;
    /** The address the send will actually use. Server-selected, never caller-supplied. */
    toAddress: string;
    displayName: string | null;
    /** Audit only — present for external operational recipients. */
    recipientRole: string | null;
    reason: string | null;
};

export type RecipientResolution =
    | { status: "resolved"; facts: ResolvedRecipientFacts }
    | { status: "needs_selection"; availableChannels: MessageChannel[]; message: string }
    | { status: "blocked"; code: string; message: string }
    | { status: "invalid"; code: string; message: string };

function blocked(code: string, message: string): RecipientResolution {
    return { status: "blocked", code, message };
}
function invalid(code: string, message: string): RecipientResolution {
    return { status: "invalid", code, message };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

function normalizeAddress(channel: MessageChannel, raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (channel === "email") return EMAIL_RE.test(v) ? v.toLowerCase() : null;
    if (channel === "sms") {
        const digits = v.replace(/[^\d+]/g, "");
        const e164 = digits.startsWith("+") ? digits : digits.length === 10 ? `+1${digits}` : `+${digits}`;
        return E164_RE.test(e164) ? e164 : null;
    }
    return null;
}

/**
 * Resolve a typed recipient against the live org.
 *
 * `requestedChannel` is the channel the caller intends. When omitted for a
 * person with both an email and a phone, the result is `needs_selection` —
 * never a guess.
 */
export async function resolveRecipient(params: {
    supabase: SupabaseClient;
    orgId: string;
    recipient: TypedRecipient;
    requestedChannel?: MessageChannel | null;
}): Promise<RecipientResolution> {
    const { supabase, orgId, recipient, requestedChannel } = params;

    // ------------------------------------------------------- canonical thread
    //
    // Reply into an existing tenant conversation whose sender is not a known
    // Person. The destination comes from canonical inbound truth on that thread
    // and never from the caller — that is what keeps this from becoming the
    // free-text recipient path typed recipients removed.
    if (recipient.kind === "canonical_thread") {
        const { data: thread, error: tErr } = await supabase
            .from("communication_threads")
            .select("id, org_id, channel, primary_entity_type, primary_entity_id")
            .eq("id", recipient.threadId)
            // Org isolation is enforced HERE, server-side, on the same query that
            // fetches the thread — not as a separate check a later edit could drop.
            .eq("org_id", orgId)
            .maybeSingle();

        if (tErr) {
            return blocked("thread_lookup_failed", "Could not verify the conversation. The reply was not sent.");
        }
        if (!thread) {
            return blocked(
                "thread_not_accessible",
                "That conversation was not found in this organization. Nothing was sent."
            );
        }

        const threadRow = thread as Record<string, unknown>;
        const channel = String(threadRow.channel ?? "").trim() as MessageChannel;
        if (channel !== "sms" && channel !== "email") {
            return blocked("thread_channel_unsupported", "This conversation has no external channel to reply on.");
        }
        if (requestedChannel && requestedChannel !== channel) {
            return blocked(
                "thread_channel_mismatch",
                "A reply must use the channel the conversation is on."
            );
        }

        // The endpoint is whoever actually wrote to us on this thread. Using the
        // most recent INBOUND message means the reply goes to the address that
        // last contacted the organization, which is the only defensible reading
        // when no Person is known.
        const { data: inbound, error: mErr } = await supabase
            .from("communication_messages")
            .select("from_address, created_at")
            .eq("thread_id", recipient.threadId)
            .eq("org_id", orgId)
            .eq("direction", "inbound")
            .order("created_at", { ascending: false })
            .limit(1);

        if (mErr) {
            return blocked("thread_endpoint_lookup_failed", "Could not read the conversation. The reply was not sent.");
        }
        const latest = Array.isArray(inbound) && inbound.length > 0 ? (inbound[0] as Record<string, unknown>) : null;
        const rawFrom = typeof latest?.from_address === "string" ? latest.from_address : "";
        const toAddress = rawFrom ? normalizeAddress(channel, rawFrom) : null;
        if (!toAddress) {
            // No inbound message means there is no verified endpoint to answer.
            // A thread Alloy only ever spoke into is not a reply-by-thread case.
            return blocked(
                "thread_has_no_inbound_endpoint",
                "This conversation has no received message to reply to."
            );
        }

        return {
            status: "resolved",
            facts: {
                kind: "canonical_thread",
                // Deliberately null. No Person is asserted, and downstream policy
                // must see the absence rather than a fabricated identity.
                personId: null,
                userId: null,
                channel,
                toAddress,
                displayName: null,
                recipientRole: null,
                reason: "reply_to_canonical_thread",
            },
        };
    }

    // ---------------------------------------------------------------- person
    if (recipient.kind === "person") {
        const { data, error } = await supabase
            .from("persons")
            .select("id, org_id, email, phone, full_name, first_name, last_name")
            .eq("id", recipient.personId)
            .eq("org_id", orgId)
            .maybeSingle();

        // Fail closed: a lookup error is not "not found", and must not proceed.
        if (error) return blocked("person_lookup_failed", "Could not verify the recipient. The send was not attempted.");
        if (!data) {
            return blocked(
                "person_not_accessible",
                "That person was not found in this organization. Communication was not sent."
            );
        }

        const row = data as Record<string, unknown>;
        const email = typeof row.email === "string" ? normalizeAddress("email", row.email) : null;
        const phone = typeof row.phone === "string" ? normalizeAddress("sms", row.phone) : null;

        const available: MessageChannel[] = [];
        if (email) available.push("email");
        if (phone) available.push("sms");

        if (available.length === 0) {
            return blocked(
                "no_usable_identity",
                "This person has no usable email address or phone number on file."
            );
        }

        let channel = requestedChannel ?? null;
        if (!channel) {
            if (available.length > 1) {
                return {
                    status: "needs_selection",
                    availableChannels: available,
                    message: "This person can be reached by email or text. Choose which to use.",
                };
            }
            channel = available[0];
        }

        if (!available.includes(channel)) {
            return blocked(
                channel === "email" ? "no_usable_email" : "no_usable_phone",
                channel === "email"
                    ? "This person has no usable email address on file."
                    : "This person has no usable phone number on file."
            );
        }

        const toAddress = channel === "email" ? email : phone;
        if (!toAddress) {
            return blocked("no_usable_identity", "This person has no usable address for the selected channel.");
        }

        const displayName =
            (typeof row.full_name === "string" && row.full_name.trim()) ||
            [row.first_name, row.last_name].filter((p) => typeof p === "string" && p).join(" ").trim() ||
            null;

        return {
            status: "resolved",
            facts: {
                kind: "person",
                personId: recipient.personId,
                userId: null,
                channel,
                toAddress,
                displayName,
                recipientRole: null,
                reason: null,
            },
        };
    }

    // --------------------------------------------------------- internal_user
    if (recipient.kind === "internal_user") {
        // Org membership is the authority. `user_roles` is the membership table.
        const { data, error } = await supabase
            .from("user_roles")
            .select("user_id, org_id, role")
            .eq("user_id", recipient.userId)
            .eq("org_id", orgId)
            .maybeSingle();

        if (error) return blocked("user_lookup_failed", "Could not verify the internal recipient.");
        if (!data) {
            return blocked(
                "user_not_in_org",
                "That user is not a member of this organization. Internal message not sent."
            );
        }

        // Internal delivery is in_app in this slice. External consent semantics
        // deliberately do NOT apply — but org scope, above, does.
        return {
            status: "resolved",
            facts: {
                kind: "internal_user",
                personId: recipient.personId ?? null,
                userId: recipient.userId,
                channel: "in_app",
                toAddress: recipient.userId,
                displayName: null,
                recipientRole: null,
                reason: null,
            },
        };
    }

    // ------------------------------------------ external_operational_recipient
    // Resolved purely from the explicit bounded shape. No lookup, no inference,
    // no Person creation, no household or customer relationship implied.
    const normalized = normalizeAddress(recipient.channel, recipient.address);
    if (!normalized) {
        return invalid(
            "malformed_address",
            recipient.channel === "email"
                ? "That email address is not valid."
                : "That phone number is not a valid mobile number."
        );
    }

    return {
        status: "resolved",
        facts: {
            kind: "external_operational_recipient",
            personId: null,
            userId: null,
            channel: recipient.channel,
            toAddress: normalized,
            displayName: recipient.displayName.trim(),
            recipientRole: recipient.recipientRole,
            reason: recipient.reason.trim(),
        },
    };
}
