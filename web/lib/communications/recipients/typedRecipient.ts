/**
 * The typed recipient union — Phase 1 Slice 1.
 *
 * Phase 0 found that `/api/admin/communications/send` accepted a free-text `to`
 * with no person reference. That is why the old eligibility gate was inert by
 * construction: with no resolvable person, there is no consent to evaluate.
 *
 * The fix is not "allow it" or "ban it" — it is to make the recipient an
 * explicit, typed thing. There are exactly three kinds and no untyped fallback.
 *
 * THE LOAD-BEARING RULE: a failed Person resolution FAILS THE SEND. It never
 * silently downgrades to an external-operational recipient. A downgrade path
 * would recreate the exact defect Phase 0 closed.
 */

import type { MessageAudience, MessageCategory, MessageChannel } from "@/lib/communications/eligibility/types";

export type RecipientKind =
    | "person"
    | "internal_user"
    | "external_operational_recipient"
    /** Reply into a tenant-owned conversation whose sender is not a known Person. */
    | "canonical_thread";

export const RECIPIENT_KINDS: readonly RecipientKind[] = [
    "person",
    "internal_user",
    "external_operational_recipient",
    "canonical_thread",
] as const;

/**
 * Ordinary family/customer communication. A raw address alone is NOT valid —
 * the runtime must resolve the canonical person, their org relationship, the
 * selected channel identity, preferences and eligibility.
 */
export type PersonRecipient = {
    kind: "person";
    personId: string;
    /** Which channel identity to use. When absent the resolver selects the primary. */
    channelIdentityId?: string;
};

/**
 * Internal staff communication. External consent semantics do not apply, but
 * org membership, permissions, scope, audit and identity validity all do.
 * Internal is not a bypass.
 */
export type InternalUserRecipient = {
    kind: "internal_user";
    userId: string;
    /** Present when the user is linked to a canonical person. */
    personId?: string;
};

/**
 * The bounded exception: a real recipient who is deliberately not a canonical
 * Person — vendor, contractor, inspector, attorney, professional service
 * provider, or a contact at another organization.
 *
 * Never produced by fallback. Only by explicit caller selection.
 */
export type ExternalOperationalRecipientRole =
    | "vendor"
    | "contractor"
    | "inspector"
    | "attorney"
    | "professional_service"
    | "external_org_contact";

export const EXTERNAL_OPERATIONAL_ROLES: readonly ExternalOperationalRecipientRole[] = [
    "vendor",
    "contractor",
    "inspector",
    "attorney",
    "professional_service",
    "external_org_contact",
] as const;

export type ExternalOperationalRecipient = {
    kind: "external_operational_recipient";
    displayName: string;
    channel: Extract<MessageChannel, "email" | "sms">;
    /** Bounded: exactly one address, matching the declared channel. */
    address: string;
    recipientRole: ExternalOperationalRecipientRole;
    /** Audited free text — why a non-Person recipient was necessary. */
    reason: string;
};

/**
 * Reply into a canonical tenant conversation whose sender is not a known Person.
 *
 * A parent can text an Alloy number before Alloy knows who they are. The
 * conversation is real, tenant-owned and verified, but it anchors to
 * `communications_unknown` with no `person_id` — so a PersonRecipient cannot
 * express it, and the operator was simply unable to reply to the messages most in
 * need of a reply.
 *
 * It carries a thread id and NOTHING else. That is the entire safety property:
 * the client cannot name an address, so this cannot become the free-text
 * recipient path that typed recipients were introduced to remove. The server
 * derives the endpoint from canonical inbound truth on that thread.
 *
 * Structurally unable to reach platform quarantine: org-less and cross-org
 * ingress have no `communication_threads` row at all, so there is no thread id to
 * pass. That is a property of the data model, not a check that can be forgotten.
 */
export type CanonicalThreadRecipient = {
    kind: "canonical_thread";
    threadId: string;
};

export type TypedRecipient =
    | PersonRecipient
    | InternalUserRecipient
    | ExternalOperationalRecipient
    | CanonicalThreadRecipient;

/**
 * Purposes an external-operational send may carry. Server-owned and
 * allowlisted: a caller-supplied purpose is never honoured, because purpose
 * drives audit and must not be attacker- or accident-controlled.
 */
export const EXTERNAL_OPERATIONAL_PURPOSES = [
    "vendor_coordination",
    "service_scheduling",
    "inspection_coordination",
    "legal_correspondence",
    "document_request",
    "facility_operations",
] as const;

export type ExternalOperationalPurpose = (typeof EXTERNAL_OPERATIONAL_PURPOSES)[number];

/** Categories an external-operational send may carry. Marketing is prohibited. */
export const EXTERNAL_OPERATIONAL_CATEGORIES: readonly MessageCategory[] = [
    "operational",
    "transactional",
] as const;

export type RecipientValidationError = {
    code:
        | "missing_recipient"
        | "unknown_kind"
        | "missing_person_id"
        | "missing_user_id"
        | "missing_display_name"
        | "missing_address"
        | "missing_role"
        | "missing_reason"
        | "invalid_channel"
        | "marketing_prohibited"
        | "category_not_allowed"
        | "purpose_not_allowlisted"
        | "audience_mismatch"
        /** A canonical_thread recipient carries a thread id and nothing else. */
        | "missing_thread_id"
        /** The client tried to name an address on a thread reply. */
        | "thread_recipient_address_not_permitted";
    message: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(code: RecipientValidationError["code"], message: string): RecipientValidationError {
    return { code, message };
}

/**
 * Shape validation only. This does NOT prove the person exists, the user is an
 * org member, or the address is reachable — those are resolution concerns that
 * require I/O and live in the resolver.
 *
 * Returns null when the shape is valid.
 */
export function validateTypedRecipientShape(recipient: unknown): RecipientValidationError | null {
    if (!recipient || typeof recipient !== "object") {
        return err("missing_recipient", "A typed recipient object is required.");
    }
    const r = recipient as Record<string, unknown>;
    const kind = r.kind;

    if (kind === "person") {
        if (typeof r.personId !== "string" || !UUID_RE.test(r.personId)) {
            return err("missing_person_id", "A person recipient requires a person_id (UUID).");
        }
        return null;
    }

    if (kind === "canonical_thread") {
        if (typeof r.threadId !== "string" || !UUID_RE.test(r.threadId)) {
            return err("missing_thread_id", "A canonical_thread recipient requires a thread_id (UUID).");
        }
        // Any address-bearing field is a caller trying to choose the destination.
        // Refuse rather than ignore: silently dropping it would let a caller
        // believe they had redirected the message.
        for (const field of ["address", "to", "to_address", "phone", "email"]) {
            if (r[field] != null && String(r[field]).trim() !== "") {
                return err(
                    "thread_recipient_address_not_permitted",
                    "A canonical_thread reply derives its destination from the conversation. Remove the address."
                );
            }
        }
        return null;
    }

    if (kind === "internal_user") {
        if (typeof r.userId !== "string" || !UUID_RE.test(r.userId)) {
            return err("missing_user_id", "An internal_user recipient requires a user_id (UUID).");
        }
        return null;
    }

    if (kind === "external_operational_recipient") {
        if (typeof r.displayName !== "string" || !r.displayName.trim()) {
            return err("missing_display_name", "An external operational recipient requires a display name.");
        }
        if (r.channel !== "email" && r.channel !== "sms") {
            return err("invalid_channel", "An external operational recipient must use email or sms.");
        }
        if (typeof r.address !== "string" || !r.address.trim()) {
            return err("missing_address", "An external operational recipient requires an address.");
        }
        if (
            typeof r.recipientRole !== "string" ||
            !EXTERNAL_OPERATIONAL_ROLES.includes(r.recipientRole as ExternalOperationalRecipientRole)
        ) {
            return err("missing_role", "An external operational recipient requires an allowed recipient role.");
        }
        if (typeof r.reason !== "string" || !r.reason.trim()) {
            return err("missing_reason", "An external operational recipient requires an audited reason.");
        }
        return null;
    }

    return err("unknown_kind", `Unsupported recipient kind. Expected one of: ${RECIPIENT_KINDS.join(", ")}.`);
}

/**
 * Classification rules that depend on the recipient kind.
 *
 * Called AFTER shape validation and BEFORE enqueue. Enforces the three
 * restrictions the external-operational kind exists to bound: external audience
 * only, no marketing, and a server-owned allowlisted purpose.
 */
export function validateClassificationForRecipient(args: {
    recipient: TypedRecipient;
    audience: MessageAudience;
    category: MessageCategory;
    purpose: string;
}): RecipientValidationError | null {
    const { recipient, audience, category, purpose } = args;

    if (recipient.kind === "internal_user") {
        if (audience !== "internal") {
            return err("audience_mismatch", "An internal_user recipient requires audience=internal.");
        }
        return null;
    }

    if (audience !== "external") {
        return err("audience_mismatch", `A ${recipient.kind} recipient requires audience=external.`);
    }

    if (recipient.kind === "external_operational_recipient") {
        if (category === "marketing") {
            return err("marketing_prohibited", "Marketing may never be sent to an external operational recipient.");
        }
        if (!EXTERNAL_OPERATIONAL_CATEGORIES.includes(category)) {
            return err(
                "category_not_allowed",
                `An external operational recipient allows only: ${EXTERNAL_OPERATIONAL_CATEGORIES.join(", ")}.`
            );
        }
        if (!(EXTERNAL_OPERATIONAL_PURPOSES as readonly string[]).includes(purpose)) {
            return err(
                "purpose_not_allowlisted",
                "An external operational recipient requires a server-allowlisted purpose."
            );
        }
    }

    return null;
}

/**
 * Operator-safe guidance for a legacy free-text call.
 *
 * Deliberately actionable and deliberately NOT a fallback: the caller is told
 * how to migrate, and the send fails. Naming the three kinds here is what makes
 * "no silent fallback" survivable for whoever hits it.
 */
export const FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE =
    "This send used a free-text address, which is no longer accepted. Supply a typed recipient: " +
    "{ kind: 'person', personId } for family or customer communication, " +
    "{ kind: 'internal_user', userId } for internal staff, or " +
    "{ kind: 'external_operational_recipient', displayName, channel, address, recipientRole, reason } " +
    "for a vendor, contractor, inspector, attorney or other external professional contact. " +
    "A failed person lookup is never downgraded to an external operational recipient.";
