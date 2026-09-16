/**
 * ENROLLMENT — keeping the record, and deciding the outcome.
 *
 * Eighteen mutations ran an organization's enrollment with no functional authority at all. Sixteen
 * were reachable through PORTAL ADMISSION ALONE — `requireAdminOrOps()` resolves admission and no
 * role, as its own docstring records — one asked only for a session, and one (`lead-location`) had
 * no gate of any kind. So who could edit a family's inquiry, move a child up the waitlist, cancel an
 * enrollment agreement or mark a child Enrolled was decided by who could reach the portal.
 *
 * ── THE SPLIT ──
 *
 * `enrollment.record.manage`  keeps the enrollment RECORD: the inquiry, the children on it, and
 *                             their requested program, room, site, start date and tuition quote.
 *                             Maintaining a candidacy while the decision is still open.
 *
 * `enrollment.decide`         changes the enrollment OUTCOME: admitted, waitlisted, placed, ended;
 *                             the agreement that binds it; and waitlist position, which decides who
 *                             is offered the next spot.
 *
 * Neither implies the other. A front desk that corrects a requested start date is not thereby
 * trusted to mark the family Enrolled, and an enrollment director who decides admissions need not
 * hold the authority to rewrite the record's fields.
 *
 * The package follows the estate rather than the labels: admin and ops each hold BOTH. Ops is
 * already seeded the whole Inquiry product — `crm.customers.write`, and all four legacy Opportunity
 * keys — so operating enrollment is ops's day job, and the two roles that are NOT seeded
 * (`school_director`, `regional_lead`) hold no `portal.access` and so could never reach these routes
 * at all. Custom roles receive nothing automatically.
 *
 * ── WHY PLACEMENT IS NOT A THIRD KEY ──
 *
 * "Placement" names three unrelated acts in this estate, and only two are enrollment. Waitlist
 * candidate ordering (`manual-position`, `overrides`, `release`) and post-agreement room assignment
 * (`child-placements`) both answer *who gets in, and when* — the same question the status transition
 * answers, so they are the same authority. `action-placements` is not placement at all: it decides
 * where an action-definition BUTTON renders, and belongs to configuration.
 *
 * Splitting placement out would produce two keys that cannot usefully be held apart: a role with
 * `decide` but not placement cannot complete an enrollment, and a role with placement alone decides
 * who is offered the next spot regardless.
 *
 * ── FIVE THINGS THIS IS NOT ──
 *
 * NOT `enrollment.configure`, which does not exist and must not. No Enrollment-specific
 * configuration power exists independently: process and stage design is `business_process.configure`
 * / `.activate`, forms are `forms.*`, program and room vocabulary is programs configuration, and the
 * legacy pipeline tables are CRM configuration awaiting retirement. A key for it would be a control
 * that changes nothing another key does not already decide.
 *
 * NOT Business Process. Those keys change what a process WOULD do, or which configuration is live;
 * these change what the process DECIDED for one family. Work Authority V1 drew the same line for
 * stage work, and Enrollment stands in the same relation to Work that Work stands in to Business
 * Process.
 *
 * NOT `work.operate`. Clearing a generic stage work item is not recording an admission outcome:
 * `execute` carries requirement preflight and a `bypass_reason` that can force a transition past
 * unmet requirements, which no work item does.
 *
 * NOT CRM customer authority. `opportunity_customer_members` PATCH *refuses* child profile keys
 * outright (`assertNoChildProfileKeysOnOcmPatch`) and writes candidacy columns only, so
 * `crm.customers.write` is disproven for it rather than merely unchosen.
 *
 * NOT Forms or Financials. `enrollmentAgreementService` touches exactly one table and emits three
 * events — no forms table, no documents table, no financial table. An agreement may RENDER through
 * a form; the business act is committing to enroll a child from a date at a site, and authority
 * follows the act.
 *
 * ── THE ONE HANDLER THIS MODULE OWNS CONDITIONALLY ──
 *
 * `PATCH /api/admin/opportunity-customer-members/[id]` carries two business powers in one route.
 * Candidacy fields (`program_category_id`, `program_room_cohort_key`, `start_date`, `location_id`,
 * `notes`) are record management. `outcome_status_key` is a decision: the route diverts it into
 * `updateOpportunityCustomerMemberLifecycleStatus` and returns early when it is the only field.
 * {@link requiredOcmPatchCapability} is that fork, and it is deliberately not flattened onto one
 * key — a body that decides an outcome must not be admitted by the authority to fix a typo. Precedent
 * for one route with two owners is `departments` PATCH under `businessProcessAuthority`.
 *
 * ── WHAT SLICE 1 DELIBERATELY DOES NOT CATALOG ──
 *
 * `enrollment.record.delete` is approved by the Director and is NOT created here. Cataloguing a key
 * whose enforcement lands in a later slice would put an inert row in the role editor — a control an
 * administrator can set that changes nothing, which is exactly the revocation theatre `W-50`/`IA-R8`
 * forbid and which `unenforcedPermissionKeys.json` exists to record as debt. It is catalogued in
 * Slice 2, beside the gate that enforces it. Hard Delete Lead keeps its current authority until then.
 */
import { NextResponse } from "next/server";

/** Keeping the enrollment record: the inquiry, its children, and their requested terms. */
export const ENROLLMENT_RECORD_MANAGE = "enrollment.record.manage" as const;

/** Deciding the enrollment outcome: status, agreement, placement, waitlist position. */
export const ENROLLMENT_DECIDE = "enrollment.decide" as const;

export type EnrollmentCapability = typeof ENROLLMENT_RECORD_MANAGE | typeof ENROLLMENT_DECIDE;

/** The closed Slice-1 set. The lock reads this to prove no third Enrollment key appeared. */
export const ENROLLMENT_CAPABILITIES = [ENROLLMENT_RECORD_MANAGE, ENROLLMENT_DECIDE] as const;

/*
 * THE SLICE-2 DELETE KEY IS DELIBERATELY NOT SPELLED IN THIS MODULE, not even as an unused
 * constant naming what Slice 2 will add.
 *
 * `scanEnforcement` counts a key as ENFORCED when any source under `web/app`, `web/lib`,
 * `web/components` or `web/scripts` names it on an executable line. A constant here would
 * therefore make the reconciliation report an enforced key with no catalog row — the same
 * false reading `capabilityTaxonomy.ts` keeps the word "p-e-r-m-i-s-s-i-o-n" out of its
 * executable text to avoid. RL-25 asserts the key's absence from its own file, which the scan
 * does not read.
 */

/** Pure: does this resolved context carry the Enrollment authority named? */
export function hasEnrollmentCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: EnrollmentCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * Refuse unless the caller holds this Enrollment authority, naming the key so a denial is debuggable.
 *
 * No role title, no portal-admission fallback, no legacy Opportunity key: admitted by grant or not
 * at all, identically everywhere.
 */
export function requireEnrollmentCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: EnrollmentCapability,
): NextResponse | null {
    if (hasEnrollmentCapability(ctx, capability)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: capability },
        { status: 403 },
    );
}

/**
 * The decision-bearing fields of an `opportunity_customer_members` PATCH body.
 *
 * Only `outcome_status_key` today. A set rather than a comparison so a second decision field added
 * later is a one-line change here instead of a silently-unguarded body shape.
 */
export const OCM_DECISION_BEARING_FIELDS = ["outcome_status_key"] as const;

/**
 * Which Enrollment authority THIS `opportunity_customer_members` PATCH body requires.
 *
 * A body that carries any decision-bearing field requires {@link ENROLLMENT_DECIDE}, whatever else
 * it carries alongside — the stricter power wins, because a mixed body still decides an outcome.
 * Everything else is ordinary candidacy maintenance.
 *
 * Presence is what counts, not value: sending `outcome_status_key: null` CLEARS the outcome, which
 * is a decision. `Object.prototype.hasOwnProperty` rather than a truthiness test, for that reason.
 */
export function requiredOcmPatchCapability(body: unknown): EnrollmentCapability {
    if (body && typeof body === "object" && !Array.isArray(body)) {
        for (const field of OCM_DECISION_BEARING_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, field)) return ENROLLMENT_DECIDE;
        }
    }
    return ENROLLMENT_RECORD_MANAGE;
}
