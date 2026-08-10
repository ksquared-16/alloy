/**
 * Communication eligibility — canonical types.
 *
 * ONE server-authoritative eligibility model, shared by the TypeScript enqueue
 * gate and the Python dispatch revalidation. Python does NOT reimplement the
 * engine: it reads the snapshot produced here and re-runs only the checks whose
 * inputs can change between enqueue and dispatch (see EligibilitySnapshot).
 *
 * Classification model (Kelly's decision, 2026-07-30) — four orthogonal axes.
 * `category` is platform-owned and closed; `purpose` is domain/tenant-owned and
 * compliance-inert.
 */

/** Who the message is addressed to. Internal never evaluates recipient consent. */
export type MessageAudience = "external" | "internal";

/**
 * Platform-owned compliance class. Closed. NOT tenant-configurable.
 *
 * transactional — necessary to complete a recipient-requested transaction or
 *   administer an active service. Not suppressible by a broad marketing
 *   opt-out, but still honors unusable channels, identity uncertainty,
 *   provider restrictions and legal delivery constraints.
 * operational   — service coordination that is useful but not strictly
 *   required. Honors operational opt-out, channel preference, quiet hours,
 *   contact priority, recipient eligibility.
 * marketing     — promotional/acquisition/campaign. Requires explicit
 *   eligibility; honors all opt-outs.
 * emergency     — narrowly defined health, safety, closure or urgent service
 *   notice. Permissioned and audited; never a convenience bypass.
 */
export type MessageCategory = "transactional" | "operational" | "marketing" | "emergency";

export const MESSAGE_CATEGORIES: readonly MessageCategory[] = [
    "transactional",
    "operational",
    "marketing",
    "emergency",
] as const;

export const MESSAGE_AUDIENCES: readonly MessageAudience[] = ["external", "internal"] as const;

export type MessageChannel = "email" | "sms" | "in_app";

/** Permission required to classify a send as `emergency`. */
export const EMERGENCY_SEND_PERMISSION_KEY = "communications.send.emergency";

export type EligibilityBlockCode =
    | "CATEGORY_MISSING"
    | "CATEGORY_INVALID"
    | "AUDIENCE_INVALID"
    | "RECIPIENT_UNRESOLVED"
    | "OPTED_OUT"
    | "MARKETING_REQUIRES_OPT_IN"
    | "QUIET_HOURS"
    | "CHANNEL_UNAVAILABLE"
    | "IDENTITY_UNUSABLE"
    | "SUPPRESSED"
    | "EMERGENCY_NOT_PERMITTED"
    | "INTERNAL_TO_PROVIDER"
    | "UNRESOLVED_INBOUND_STOP_HOLD";

export type EligibilityDecision = {
    allowed: boolean;
    /** Machine-readable reason. Null when allowed. */
    code: EligibilityBlockCode | null;
    /** Operator-safe explanation. Never leaks recipient PII. */
    reason: string;
};

export type QuietHoursWindow = {
    /** Local "HH:mm". */
    start: string;
    end: string;
    /** IANA timezone the window is expressed in. */
    timezone: string;
    /** Where the window came from — recorded for provenance, not used in the decision. */
    basis: "location" | "organization" | "platform_default";
};

export type EligibilityInput = {
    audience: MessageAudience;
    category: MessageCategory;
    channel: MessageChannel;
    purpose?: string | null;

    /** Resolved recipient. Absent means unresolved — external sends fail closed. */
    recipientPersonId?: string | null;

    /** Current preference state for the (category, channel) pair. */
    preferenceState?: "opted_in" | "opted_out" | "unset";

    /** Hard bounce / spam complaint suppression. */
    suppressed?: boolean;

    /**
     * A valid STOP arrived from this exact endpoint pair (their address ← our
     * provider destination) while Alloy could not determine which organization
     * owned it, so no Person preference could be written.
     *
     * This is NOT a Person opt-out and must never be reported as one: nobody
     * knows whose opt-out it is yet. It exists so a STOP still changes future
     * behaviour while ownership is unresolved.
     */
    unresolvedInboundStopHold?: boolean;

    /** Channel usable at all (address present, identity active and outbound-enabled). */
    channelUsable?: boolean;

    quietHours?: QuietHoursWindow | null;
    /** Evaluation instant. Injected so the decision is deterministic and testable. */
    nowIso?: string;

    /** Whether the actor holds EMERGENCY_SEND_PERMISSION_KEY. Only consulted for `emergency`. */
    emergencyPermitted?: boolean;
};

/**
 * The decision inputs frozen at enqueue.
 *
 * IMMUTABLE (authoring facts — never re-derived at dispatch):
 *   policyVersion, audience, category, purpose, recipient, authorizedBy,
 *   quietHours basis/window.
 *
 * REVALIDATED at dispatch (live facts — can change in the queue→send gap):
 *   preference state, suppression, the quiet-hours CLOCK, identity validity,
 *   structural coherence, category presence.
 *
 * The principle: classification and authorization are authoring facts;
 * recipient state and time-dependent constraints are live facts.
 */
/**
 * Bounded, observable compatibility fallback for an unclassified send.
 *
 * Direction is explicit: new sends must not silently default, and any fallback
 * must be "narrowly bounded, observable, and retired through migration". So the
 * default is never silent — every use is counted and logged with its call site,
 * a test asserts no production caller relies on it, and migration
 * 20260801100000 drops the column default so an unclassified insert then fails
 * at the database.
 */
const categoryFallbackUses = new Map<string, number>();

export function recordCategoryFallback(callSite: string): MessageCategory {
    const next = (categoryFallbackUses.get(callSite) ?? 0) + 1;
    categoryFallbackUses.set(callSite, next);
    console.warn("[comms-category-fallback] send was not explicitly classified", {
        call_site: callSite,
        uses: next,
        defaulted_to: "operational",
    });
    return "operational";
}

/** Test/observability seam: which call sites have relied on the fallback. */
export function categoryFallbackReport(): Record<string, number> {
    return Object.fromEntries(categoryFallbackUses);
}

export function resetCategoryFallbackReport(): void {
    categoryFallbackUses.clear();
}

/**
 * Snapshot SCHEMA version — distinct from the policy version.
 *
 * `policyVersion` records which rules ran. `snapshotVersion` records the SHAPE
 * of this object. Dispatch rejects a version it does not know rather than
 * guessing at missing fields, so an old queued row can never be revalidated
 * against assumptions that were not true when it was authored.
 */
export const ELIGIBILITY_SNAPSHOT_VERSION = 1;

export type EligibilitySnapshot = {
    snapshotVersion: number;
    policyVersion: string;
    decision: EligibilityDecision;
    audience: MessageAudience;
    category: MessageCategory;
    purpose: string | null;
    recipient: { personId: string | null; channel: MessageChannel };
    authorizedBy: { userId: string | null; permission: string | null };
    /** The sender identity chosen at enqueue. Revalidated at dispatch. */
    identity: { identityId: string | null; providerAccountId: string | null; bindingId: string | null };
    consentInputs: Array<{ category: string; state: string }>;
    quietHours: QuietHoursWindow | null;
    evaluatedAt: string;
};
