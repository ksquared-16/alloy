/**
 * Server-owned purpose registry — Phase 1 Slice 1, step 3.
 *
 * `purpose` is domain vocabulary and is COMPLIANCE-INERT: it describes why a
 * message was sent, and no consent rule may key off it (a tenant must not be
 * able to configure their way out of consent law). What it does govern is
 * audit, and what a capability is permitted to emit.
 *
 * Because it drives audit, it is server-owned. A caller-supplied purpose is
 * never honoured. Unknown purposes FAIL CLOSED.
 *
 * This registry is deliberately code-owned, not tenant-editable. Tenant-editable
 * purpose configuration is out of scope for this slice.
 */

import type { MessageAudience, MessageCategory, MessageChannel } from "@/lib/communications/eligibility/types";
import type { RecipientKind } from "@/lib/communications/recipients/typedRecipient";

export type PurposeDefinition = {
    key: string;
    /** The capability or domain that owns this purpose. */
    source: string;
    audiences: readonly MessageAudience[];
    categories: readonly MessageCategory[];
    channels: readonly MessageChannel[];
    recipientKinds: readonly RecipientKind[];
    /**
     * Whether an operator may author free-text under this purpose. False means
     * the platform composes the content (templated or system-built).
     */
    allowsUserAuthored: boolean;
    /** Whether an external_operational_recipient may receive this purpose. */
    allowsExternalOperational: boolean;
};

const EXTERNAL: readonly MessageAudience[] = ["external"] as const;
const INTERNAL: readonly MessageAudience[] = ["internal"] as const;
const OPS_TX: readonly MessageCategory[] = ["operational", "transactional"] as const;
const ALL_CHANNELS: readonly MessageChannel[] = ["email", "sms", "in_app"] as const;
const EXTERNAL_CHANNELS: readonly MessageChannel[] = ["email", "sms"] as const;

/**
 * Covers exactly the four converging routes plus the existing canonical
 * callers. Deliberately minimal — an unused purpose is a liability, because it
 * widens what a compromised or mistaken caller may emit.
 */
export const PURPOSE_REGISTRY: readonly PurposeDefinition[] = [
    // --- /api/admin/communications/send (operator-composed) -----------------
    {
        key: "operator_direct_message",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: ["operational", "transactional", "marketing"],
        channels: EXTERNAL_CHANNELS,
        // `canonical_thread` is an operator answering a conversation whose sender
        // Alloy has not identified. It belongs to THIS purpose and no other: the
        // same human, composing the same kind of message, into a conversation the
        // organization already received.
        //
        // Without it the entire thread-bound reply path was unreachable. Recipient
        // resolution, the route contract and the eligibility gate all existed, and
        // every real attempt died here — which is how the path could be described
        // as implemented while never having sent a single message. Only browser
        // certification surfaced it.
        //
        // This widens reach, not policy. Two controls already stand in front of it,
        // unchanged: `THREAD_REPLY_CAPABILITIES` in canonicalSend admits only
        // operator send capabilities, so automation and broadcasts are still
        // refused; and eligibility treats absent consent as unevaluable, so
        // `marketing` stays blocked for an unidentified sender while quiet hours and
        // the unresolved STOP hold continue to apply.
        recipientKinds: ["person", "canonical_thread"],
        allowsUserAuthored: true,
        allowsExternalOperational: false,
    },
    {
        key: "internal_operator_message",
        source: "communications.send",
        audiences: INTERNAL,
        categories: ["operational", "transactional"],
        channels: ALL_CHANNELS,
        recipientKinds: ["internal_user"],
        allowsUserAuthored: true,
        allowsExternalOperational: false,
    },

    // --- bounded external-operational purposes ------------------------------
    // Mirrors EXTERNAL_OPERATIONAL_PURPOSES in the recipient contract. Kept in
    // both places deliberately: the recipient contract bounds the *kind*, this
    // registry bounds what a *capability* may emit. Parity is asserted by test.
    {
        key: "vendor_coordination",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: OPS_TX,
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["external_operational_recipient"],
        allowsUserAuthored: true,
        allowsExternalOperational: true,
    },
    {
        key: "service_scheduling",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: OPS_TX,
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["external_operational_recipient"],
        allowsUserAuthored: true,
        allowsExternalOperational: true,
    },
    {
        key: "inspection_coordination",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: OPS_TX,
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["external_operational_recipient"],
        allowsUserAuthored: true,
        allowsExternalOperational: true,
    },
    {
        key: "legal_correspondence",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: OPS_TX,
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["external_operational_recipient"],
        allowsUserAuthored: true,
        allowsExternalOperational: true,
    },
    {
        key: "document_request",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: OPS_TX,
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["external_operational_recipient"],
        allowsUserAuthored: true,
        allowsExternalOperational: true,
    },
    {
        key: "facility_operations",
        source: "communications.send",
        audiences: EXTERNAL,
        categories: OPS_TX,
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["external_operational_recipient"],
        allowsUserAuthored: true,
        allowsExternalOperational: true,
    },

    // --- /api/admin/communications/family-send ------------------------------
    {
        key: "family_communication",
        source: "communications.family_send",
        audiences: EXTERNAL,
        categories: ["operational", "transactional"],
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["person"],
        allowsUserAuthored: true,
        allowsExternalOperational: false,
    },

    // --- /api/admin/ai/task-assist/apply ------------------------------------
    // BOS proposes; the operator confirms; the server re-resolves and re-renders.
    {
        key: "assisted_operator_message",
        source: "ai.task_assist",
        audiences: EXTERNAL,
        categories: ["operational", "transactional"],
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["person"],
        allowsUserAuthored: true,
        allowsExternalOperational: false,
    },

    // --- /api/admin/opportunities/[id]/form-deliver -------------------------
    {
        key: "form_delivery",
        source: "opportunities.form_deliver",
        audiences: EXTERNAL,
        categories: ["transactional"],
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["person"],
        // The platform composes the envelope and owns the link, but the route
        // genuinely lets an operator prepend a custom message — so this is
        // user-authored in part. Marked true to match the behaviour rather than
        // the aspiration.
        allowsUserAuthored: true,
        allowsExternalOperational: false,
    },

    // --- existing canonical callers -----------------------------------------
    {
        key: "enrollment_packet",
        source: "opportunities.enrollment_packet_launch",
        audiences: EXTERNAL,
        categories: ["transactional"],
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["person"],
        allowsUserAuthored: false,
        allowsExternalOperational: false,
    },
    {
        key: "tour_coordination",
        source: "tours.comms_orchestrator",
        audiences: EXTERNAL,
        categories: ["transactional"],
        channels: EXTERNAL_CHANNELS,
        recipientKinds: ["person"],
        allowsUserAuthored: false,
        allowsExternalOperational: false,
    },
] as const;

const BY_KEY = new Map(PURPOSE_REGISTRY.map((p) => [p.key, p]));

export function findPurpose(key: string): PurposeDefinition | null {
    return BY_KEY.get(key) ?? null;
}

export type PurposeViolation = {
    code:
        | "purpose_unknown"
        | "purpose_audience_not_allowed"
        | "purpose_category_not_allowed"
        | "purpose_channel_not_allowed"
        | "purpose_recipient_kind_not_allowed"
        | "purpose_external_operational_not_allowed"
        | "purpose_user_authored_not_allowed";
    message: string;
};

/**
 * Validate a send against its declared purpose. Fails closed on an unknown key.
 *
 * Note this checks the purpose is PERMITTED to carry the classification — it is
 * not a consent decision. Consent is evaluated separately by the eligibility
 * evaluator, which never reads purpose.
 */
export function validatePurpose(args: {
    purpose: string;
    audience: MessageAudience;
    category: MessageCategory;
    channel: MessageChannel;
    recipientKind: RecipientKind;
    userAuthored: boolean;
}): PurposeViolation | null {
    const def = findPurpose(args.purpose);
    if (!def) {
        return {
            code: "purpose_unknown",
            message: `Unknown purpose "${args.purpose}". Purposes are server-owned and must be registered.`,
        };
    }
    if (!def.audiences.includes(args.audience)) {
        return {
            code: "purpose_audience_not_allowed",
            message: `Purpose "${def.key}" does not permit audience "${args.audience}".`,
        };
    }
    if (!def.categories.includes(args.category)) {
        return {
            code: "purpose_category_not_allowed",
            message: `Purpose "${def.key}" does not permit category "${args.category}".`,
        };
    }
    if (!def.channels.includes(args.channel)) {
        return {
            code: "purpose_channel_not_allowed",
            message: `Purpose "${def.key}" does not permit channel "${args.channel}".`,
        };
    }
    if (!def.recipientKinds.includes(args.recipientKind)) {
        return {
            code: "purpose_recipient_kind_not_allowed",
            message: `Purpose "${def.key}" does not permit recipient kind "${args.recipientKind}".`,
        };
    }
    if (args.recipientKind === "external_operational_recipient" && !def.allowsExternalOperational) {
        return {
            code: "purpose_external_operational_not_allowed",
            message: `Purpose "${def.key}" may not target an external operational recipient.`,
        };
    }
    if (args.userAuthored && !def.allowsUserAuthored) {
        return {
            code: "purpose_user_authored_not_allowed",
            message: `Purpose "${def.key}" is platform-composed and does not accept operator-authored content.`,
        };
    }
    return null;
}
