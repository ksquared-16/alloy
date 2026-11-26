/**
 * The parent action token — a bounded capability, NOT an identity.
 *
 * A family reaches Alloy through a link, and that link is the whole of their
 * authority. There is no parent account, no parent session, no `persons ↔
 * auth.users` linkage, and nothing here authenticates a person: this module
 * answers "may the bearer of this credential do this one thing to this one
 * child", and nothing else. Whoever holds the link holds the capability, which
 * is exactly why the capability is drawn so narrowly.
 *
 * ── IT REUSES THE PLATFORM'S TOKEN, IT DOES NOT ADD ONE ──
 *
 * `action_links` already IS a generalized bounded-action token: a hashed bearer
 * credential carrying an org, a subject (`entity_type` + `entity_id`), one
 * allowed `action_type`, an expiry and single-use consumption, with
 * `claimActionLink` providing an atomic claim. Introducing
 * `attendance_parent_tokens` beside it would mean a second token lifecycle to
 * secure, expire, revoke and audit — the same mistake as building a second
 * Attendance system for a second producer.
 *
 * The one thing that was missing is revocation, which is now a column on the
 * shared table rather than a private notion here.
 *
 * ── THE PAYLOAD CANNOT WIDEN THE TOKEN ──
 *
 * `requiredIntent` is supplied by the ROUTE, never by the request body, and the
 * subject comes from the LINK, never from the request. A caller may say what
 * they are reporting; they may not say who they are reporting it about, or what
 * kind of act it is. That is the whole security model, and it is the same shape
 * `authorizeTourAction` already uses for public tour actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

/**
 * The closed vocabulary of things a family link can authorize.
 *
 * Deliberately ONE entry. Every additional intent is a new decision about what a
 * bearer credential may do to a child's record, and the way that decision gets
 * made badly is by adding to a list that already looks like a list.
 *
 * `report_absence` covers both V1 cases — same-day sick and a future planned
 * absence — because they are the same assertion ("this child will not attend")
 * over different date ranges, not two capabilities.
 */
export const PARENT_INTENT_KINDS = ["report_absence"] as const;

export type ParentIntentKind = (typeof PARENT_INTENT_KINDS)[number];

/**
 * What each intent may DO. One capability per kind; there is no token that can
 * do two things, and emphatically none that can touch observed Attendance.
 *
 * `authorsObservedFact` exists to be permanently `false`. A parent states what
 * they EXPECT; only the nursery witnesses what HAPPENED. Writing the boundary
 * down as a field means a future intent has to set it explicitly and face the
 * question, rather than inheriting an absence of one.
 */
export const PARENT_INTENT_CAPABILITY: Record<
    ParentIntentKind,
    { proposesKnownAway: boolean; authorsObservedFact: false }
> = {
    report_absence: { proposesKnownAway: true, authorsObservedFact: false },
};

/** `action_links.entity_type` a parent intent link must carry. */
export const PARENT_INTENT_ENTITY_TYPE = "customer_member";

/** `action_links.action_type` prefix, so these links are greppable and scoped. */
export const PARENT_INTENT_ACTION_TYPE: Record<ParentIntentKind, string> = {
    report_absence: "parent_report_absence",
};

export type ParentIntentFailureCode =
    | "invalid"
    | "expired"
    | "revoked"
    | "consumed"
    | "wrong_intent"
    | "wrong_subject_kind"
    | "subject_mismatch"
    | "orgless"
    | "unresolved";

/**
 * What the bearer is told. Deliberately uniform — the differences between these
 * causes are exactly the information an attacker probing links would want, so
 * the public message never distinguishes them. The CODE stays precise for the
 * server log and the operator.
 */
const PUBLIC_MESSAGE: Record<ParentIntentFailureCode, string> = {
    invalid: "This link is no longer valid.",
    expired: "This link is no longer valid.",
    revoked: "This link is no longer valid.",
    consumed: "This link is no longer valid.",
    wrong_intent: "This link is no longer valid.",
    wrong_subject_kind: "This link is no longer valid.",
    subject_mismatch: "This link is no longer valid.",
    orgless: "This link is no longer valid.",
    unresolved: "This link could not be checked. Please try again.",
};

export type ParentIntentAuthority = {
    linkId: string;
    orgId: string;
    /** The child this link is bound to. The SUBJECT — never taken from a payload. */
    childCustomerMemberId: string;
    intent: ParentIntentKind;
    capability: (typeof PARENT_INTENT_CAPABILITY)[ParentIntentKind];
    expiresAt: string | null;
};

export type ParentIntentAuthorization =
    | { ok: true; authority: ParentIntentAuthority }
    | { ok: false; code: ParentIntentFailureCode; message: string };

const deny = (code: ParentIntentFailureCode): ParentIntentAuthorization => ({
    ok: false,
    code,
    message: PUBLIC_MESSAGE[code],
});

const LINK_COLUMNS =
    "id, org_id, action_type, entity_type, entity_id, expires_at, consumed_at, revoked_at";

/**
 * Authorize one parent intent submission.
 *
 * `assertedChildCustomerMemberId` is the caller's CLAIM about who this is for.
 * It is never used as the subject — it exists only so that a request naming a
 * different child is refused loudly instead of silently succeeding against the
 * child the link is really bound to. A request that names nobody is fine; a
 * request that names the wrong child is an escalation attempt.
 */
export async function authorizeParentIntent(args: {
    supabase: SupabaseClient;
    plaintextToken: string | null | undefined;
    requiredIntent: ParentIntentKind;
    assertedChildCustomerMemberId?: string | null;
}): Promise<ParentIntentAuthorization> {
    const token = String(args.plaintextToken ?? "").trim();
    if (!token) return deny("invalid");

    // Raw tokens are never stored. The lookup is BY digest, so this asks "does a
    // row match" rather than comparing a secret byte by byte in the application.
    const { data, error } = await args.supabase
        .from("action_links")
        .select(LINK_COLUMNS)
        .eq("token_hash", hashFormLinkToken(token))
        .maybeSingle();

    // A failed read is not an absent link. Deny, but say it was undecidable —
    // telling a parent their link is invalid because the database blinked would
    // send them to the nursery to have a perfectly good link reissued.
    if (error) return deny("unresolved");
    if (!data) return deny("invalid");

    const link = data as {
        id: string;
        org_id: string | null;
        action_type: string | null;
        entity_type: string | null;
        entity_id: string | null;
        expires_at: string | null;
        consumed_at: string | null;
        revoked_at: string | null;
    };

    // Order matters only for the log. Every branch below is a refusal, and the
    // bearer sees the same sentence whichever one fires.
    if (link.revoked_at) return deny("revoked");
    if (link.consumed_at) return deny("consumed");
    if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) return deny("expired");

    if (link.action_type !== PARENT_INTENT_ACTION_TYPE[args.requiredIntent]) return deny("wrong_intent");
    if (link.entity_type !== PARENT_INTENT_ENTITY_TYPE) return deny("wrong_subject_kind");

    // Orgless links exist in `action_links` (the column is nullable). One cannot
    // author into a tenant that was never named.
    const orgId = (link.org_id ?? "").trim();
    if (!orgId) return deny("orgless");

    const childCustomerMemberId = (link.entity_id ?? "").trim();
    if (!childCustomerMemberId) return deny("invalid");

    const asserted = (args.assertedChildCustomerMemberId ?? "").trim();
    if (asserted && asserted !== childCustomerMemberId) return deny("subject_mismatch");

    return {
        ok: true,
        authority: {
            linkId: link.id,
            orgId,
            childCustomerMemberId,
            intent: args.requiredIntent,
            capability: PARENT_INTENT_CAPABILITY[args.requiredIntent],
            expiresAt: link.expires_at,
        },
    };
}
