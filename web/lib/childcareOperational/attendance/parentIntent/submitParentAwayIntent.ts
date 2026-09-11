/**
 * A family reports that a child will be away.
 *
 * The whole of Thread 6's parent capability, and deliberately a small thing: a
 * bounded link authorizes ONE assertion about ONE child, and that assertion
 * enters the ledger as a `proposed` Operational Expectation for the nursery to
 * ratify. A parent states what they EXPECT. They never author what HAPPENED.
 *
 *   token → bounded capability → child (from the link)
 *         → markChildAway → authorOperationalExpectation → standing `proposed`
 *         → operator ratification → binding
 *
 * ── WHY THIS IS A PURPOSE-SCOPED DOOR ──
 *
 * The same reasoning `authorServiceDayException` already records. The generic
 * intake governs any modality about any subject and requires a capability seeded
 * to org admins; a parent has no capability at all. This door reaches the same
 * intake, the same validation and the same atomic commit, and it can only ever
 * author the attendance service-day vocabulary, because `markChildAway` is the
 * only way in and it hard-codes the purpose. Nothing here can express anything
 * else, whatever the request body contains.
 *
 * ── WHY IT MAY AUTHOR AT ALL ──
 *
 * The intake requires `actorAuthenticated`, documented as "a server/service
 * principal permitted to reach the intake". That is what this is. The parent is
 * NOT authenticated and never becomes an org actor: the server verifies a
 * credential it issued, resolves the org and child from its own records, and
 * authors under an `external` authority naming the link. The bearer supplies the
 * content of the assertion and nothing else — not the org, not the child, not
 * the standing.
 *
 * ── WHY IT CANNOT BIND ──
 *
 * Standing is derived, never chosen: an `intended` expectation lands `proposed`
 * and `binding` is unreachable from the intake. So a family cannot make a
 * binding claim about a nursery's day even if this module were wrong about
 * everything else — the ledger's own grammar refuses it. Ratification is a
 * separate act requiring an authenticated org actor with the ratify capability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { ATTENDANCE_EXPECTATION_PURPOSE } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { markChildAway } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { resolveAttendanceSubject } from "@/lib/childcareOperational/attendance/resolveAttendanceSubject";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import type { AuthoringGateway } from "@/lib/operationalExpectations/intake/authoringGateway";
import type { AuthoringResult } from "@/lib/operationalExpectations/intake/authoringTypes";
import {
    authorizeParentIntent,
    type ParentIntentFailureCode,
} from "@/lib/childcareOperational/attendance/parentIntent/parentIntentAuthority";

/**
 * The governed authority a family submission is filed under.
 *
 * STABLE, not per-link, and that is a correctness requirement rather than a
 * preference. Ratification resolves held authority against the EXPECTATION's own
 * authority key: a key like `parent_link:<id>` would demand that the
 * organization register a governed authority and grant it to staff for every
 * link it ever issues, which means family intent that no one can ever ratify.
 * One stable key is a thing an org can actually govern — register it once, grant
 * "may ratify family intent" to the people whose job that is.
 *
 * A family never holds an assignment on it. The authoring RPC self-ratifies to
 * `binding` only when the AUTHOR holds the authority, and a parent submission
 * carries no holder at all (`authorityHolderId` is the authenticated actor, and
 * there isn't one) — so the act lands `proposed` and stays there until a human
 * with a real grant ratifies it.
 *
 * WHAT THIS DOES NOT CARRY: which link submitted it. The expectation grammar has
 * no provenance slot, and neither the Condition (a predicate about reality) nor
 * `configVersionRef` is one. The link is recoverable from `action_links` and the
 * authoring act; storing it properly is follow-up, not something to smuggle into
 * a facet that means something else.
 */
export const FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY = "family_submitted_intent";

/** The reasons a family may give. Closed: free text belongs in `note`. */
export const PARENT_ABSENCE_REASON_KEYS = ["sick", "holiday", "family", "other"] as const;

export type ParentAbsenceReasonKey = (typeof PARENT_ABSENCE_REASON_KEYS)[number];

export type ParentAwayIntentDenial = {
    status: "denied";
    httpStatus: 401 | 403 | 400;
    code: ParentIntentFailureCode | "invalid_dates" | "invalid_reason" | "subject_unavailable";
    message: string;
};

export type ParentAwayIntentOutcome = AuthoringResult | ParentAwayIntentDenial;

const denied = (
    httpStatus: ParentAwayIntentDenial["httpStatus"],
    code: ParentAwayIntentDenial["code"],
    message: string,
): ParentAwayIntentDenial => ({ status: "denied", httpStatus, code, message });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Submit a known-away intent on behalf of a family.
 *
 * `childCustomerMemberId` is NOT a parameter. The subject comes from the link,
 * so there is nowhere in this signature to name a different child — the strongest
 * form of the guarantee, since it cannot be forgotten at a call site. A caller
 * that wants to assert who this is about passes `assertedChildCustomerMemberId`,
 * which is only ever CHECKED against the link and never used.
 */
export async function submitParentAwayIntent(params: {
    supabase: SupabaseClient;
    plaintextToken: string | null | undefined;
    fromDate: string;
    toDate?: string | null;
    reasonKey: ParentAbsenceReasonKey | string;
    note?: string | null;
    /** The caller's claim about the subject. Checked, never trusted, never used. */
    assertedChildCustomerMemberId?: string | null;
    gateway?: AuthoringGateway;
}): Promise<ParentAwayIntentOutcome> {
    const auth = await authorizeParentIntent({
        supabase: params.supabase,
        plaintextToken: params.plaintextToken,
        requiredIntent: "report_absence",
        assertedChildCustomerMemberId: params.assertedChildCustomerMemberId,
    });
    if (!auth.ok) {
        // `unresolved` is the only retryable one; the rest are settled refusals.
        return denied(auth.code === "unresolved" ? 403 : 401, auth.code, auth.message);
    }
    const { authority } = auth;

    // A capability that could author observed facts would be a different product.
    // Asserted rather than assumed, so the day it changes, it changes loudly.
    if (authority.capability.authorsObservedFact) {
        return denied(403, "wrong_intent", "This link cannot record attendance.");
    }

    const fromDate = String(params.fromDate ?? "").trim();
    const toDate = String(params.toDate ?? "").trim() || null;
    if (!ISO_DATE.test(fromDate) || (toDate && !ISO_DATE.test(toDate))) {
        return denied(400, "invalid_dates", "A valid date is required.");
    }
    if (toDate && Date.parse(toDate) < Date.parse(fromDate)) {
        return denied(400, "invalid_dates", "The last day cannot be before the first day.");
    }

    const reasonKey = String(params.reasonKey ?? "").trim();
    if (!(PARENT_ABSENCE_REASON_KEYS as readonly string[]).includes(reasonKey)) {
        return denied(400, "invalid_reason", "That is not a reason this link can report.");
    }

    /*
     * The child must be someone this org can actually hold an expectation about.
     * Resolving the subject here also means a link that outlived an enrolment
     * stops working without anyone having to remember to revoke it.
     */
    const subject = await resolveAttendanceSubject(params.supabase, authority.orgId, authority.childCustomerMemberId);
    if (!subject.ok) {
        return denied(403, "subject_unavailable", subject.message);
    }

    const gateway =
        params.gateway ?? createSupabaseAuthoringGateway(createAdminClient(), ATTENDANCE_EXPECTATION_PURPOSE);

    return authorOperationalExpectation(
        markChildAway({
            /*
             * IDEMPOTENCY. The key is the link plus the assertion's content, so a
             * double-tapped submit or a retried request converges on the one act
             * the intake already committed, while a genuinely different report
             * from the same family is a new expectation rather than a silent
             * no-op. The intake is idempotent per (org, key) and treats the same
             * key with different content as a conflict, which is the honest
             * outcome for a key that means what this one means.
             */
            idempotencyKey: `parent_link:${authority.linkId}:away:${fromDate}:${toDate ?? fromDate}:${reasonKey}`,
            // No org user asserted this, and pretending one did would put a
            // staff member's name on a family's statement.
            actorUserId: "",
            authority: {
                authorityKey: FAMILY_SUBMITTED_INTENT_AUTHORITY_KEY,
                // A family is outside the organization. `external` is also what
                // keeps this out of the `human` holder space the ratifier uses.
                authorClass: "external",
            },
            reasonKey,
            note: params.note ?? null,
            childId: authority.childCustomerMemberId,
            range: { fromDate, toDate },
        }),
        {
            orgId: authority.orgId,
            actorUserId: null,
            actorLabel: "Family (link)",
            // The SERVER is the authenticated principal here, not the family.
            actorAuthenticated: true,
        },
        gateway,
    );
}
