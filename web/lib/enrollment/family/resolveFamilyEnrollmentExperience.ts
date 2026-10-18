/**
 * WHICH CHILD ENROLLMENTS ARE ONE FAMILY JOURNEY — answered from canonical truth, not a new table.
 *
 * ── THE GROUPING AUTHORITY, AND WHY NO SCHEMA WAS ADDED ──
 *
 * The question "which sibling sessions belong to this one family experience" already has a canonical
 * answer: `resolveLiveEnrollmentContextForHousehold`. It defines a household's LIVE enrolment
 * episode as an Opportunity with at least one running `process_instances` row for the household's
 * children, refuses "the newest opportunity" by name because attaching a 2026 sibling to a finished
 * 2025 enrolment "would reopen finished history", breaks ties deterministically so grouping cannot
 * depend on row order, and returns the running children as evidence. That is exactly the grouping
 * identity this experience needs, and it is derived from process state rather than stored — so it
 * survives reload, resume, one child completing first, Processing transitions and payment with
 * nothing to keep in sync.
 *
 * Deliberately NOT used as the grouping key:
 *   · the session's `crm_snapshot` opportunity — D-95's own migration says making a CRM Opportunity
 *     load-bearing for runtime correctness is the mistake it was written to undo;
 *   · `form_packet_sessions.packet_instance_id` — that mechanism groups by sharing ONE session
 *     between recipients, which merges exactly what the grain rule forbids here;
 *   · recency, the first child, a client-side array, or name matching.
 *
 * ── SIBLING VISIBILITY IS A DELIBERATE BOUNDARY ──
 *
 * A participant arrives on ONE child's token. This returns the family's shape — who is enrolling,
 * how far each has got, what is owed — and never another child's answers. Progress and a label are
 * what a parent needs to navigate their own family; a sibling's health history is not, and a token
 * minted for one child's session is not authority over another child's evidence. Every sibling row
 * is confined to the same organization, the same household and the same live episode.
 */

import { listHouseholdChildrenForRequest } from "@/lib/enrollment/family/participantEnrollmentRequest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    groupHouseholdEnrollmentJourneys,
    journeyIsConcluded,
} from "@/lib/enrollment/family/groupHouseholdEnrollmentJourneys";
import { readShareEmbedPath } from "@/lib/admin/forms/distributionLinkReuse";
import { resolveEnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import { readFamilyEnrollmentFeeProjection } from "@/lib/enrollment/financial/readEnrollmentFeeProjection";
import type { EnrollmentFinancialRequirementProjection } from "@/lib/enrollment/financial/enrollmentFinancialRequirement";
import {
    composeFamilyEnrollmentExperience,
    familyFinancialsFromProjection,
    type FamilyChildJourney,
    type FamilyEnrollmentExperience,
    type FamilyEnrollmentFinancials,
} from "@/lib/enrollment/family/familyEnrollmentExperience";

export type FamilyExperienceRefusal =
    | { readonly code: "no_household"; readonly detail: string }
    | { readonly code: "no_live_episode"; readonly detail: string };

export type ResolveFamilyEnrollmentResult =
    | {
          readonly ok: true;
          readonly value: FamilyEnrollmentExperience;
          /**
           * The canonical fee projection this result was composed from, for a caller that needs more
           * of it than the family shell shows (the participant payment surface needs reversal state
           * and the requirement's explanation). Null when the caller injected `financials`, because
           * then no projection was read here and inventing one would be a second answer.
           */
          readonly projection: EnrollmentFinancialRequirementProjection | null;
      }
    | { readonly ok: false; readonly refusal: FamilyExperienceRefusal };

type SessionRowLike = {
    readonly id: string;
    readonly process_instance_id: string | null;
    readonly status: string | null;
    readonly crm_snapshot: Record<string, unknown> | null;
};

/** The household this session belongs to, from the snapshot the launch already stamped. */
export function householdIdFromSession(session: SessionRowLike): string | null {
    const snap = (session.crm_snapshot ?? {}) as Record<string, unknown>;
    const direct = typeof snap.customer_id === "string" ? snap.customer_id.trim() : "";
    return direct || null;
}

export async function resolveFamilyEnrollmentExperience(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly session: SessionRowLike;
        /** The child whose link the participant arrived on, so the shell can focus it. */
        readonly focusedCustomerMemberId?: string | null;
        /**
         * The link the participant arrived on. Siblings' own links are offered only when they were
         * addressed to the same person — the family shell navigates between a recipient's links, it
         * never hands one person another's.
         */
        readonly linkId?: string | null;
        /** Injected so this resolver never reaches into Financials itself. */
        readonly financials?: FamilyEnrollmentFinancials | null;
    },
): Promise<ResolveFamilyEnrollmentResult> {
    const customerId = householdIdFromSession(input.session);
    if (!customerId) {
        return { ok: false, refusal: { code: "no_household", detail: "This session names no household." } };
    }

    /*
     * THE SESSION'S OWN CHILD MUST BELONG TO THE HOUSEHOLD IT NAMES.
     *
     * The household comes from the snapshot the launch stamped, and nothing public writes it — but
     * the session's journey is the stronger fact, so the two are held to each other rather than the
     * snapshot being trusted alone. A disagreement shows no family at all.
     */
    if (input.session.process_instance_id) {
        const { data: own } = await supabase
            .from("process_instances")
            .select("subject_id")
            .eq("org_id", input.orgId)
            .eq("id", input.session.process_instance_id)
            .maybeSingle();
        const ownChild = ((own as { subject_id?: string | null } | null)?.subject_id ?? "").trim();
        if (ownChild) {
            const { data: ownMember } = await supabase
                .from("customer_members")
                .select("customer_id")
                .eq("org_id", input.orgId)
                .eq("id", ownChild)
                .maybeSingle();
            if ((ownMember as { customer_id?: string | null } | null)?.customer_id !== customerId) {
                return {
                    ok: false,
                    refusal: { code: "no_household", detail: "This session's child does not belong to the household it names." },
                };
            }
        }
    }

    const grouping = await groupHouseholdEnrollmentJourneys(supabase, { orgId: input.orgId, customerId });
    if (!grouping) {
        /*
         * Nothing running for this household, in an episode or out of one. "No live episode" is an
         * ordinary answer — there is no family journey to show, and inventing one would be worse.
         */
        return {
            ok: false,
            refusal: { code: "no_live_episode", detail: "This household has no live enrolment episode." },
        };
    }
    const opportunityId = grouping.opportunityId;
    const instances = grouping.instances;
    const subjectIds = [...new Set(instances.map((p) => p.subject_id).filter((v): v is string => Boolean(v)))];

    // Names, from the canonical member records, org-filtered.
    const { data: memberRows } = await supabase
        .from("customer_members")
        .select("id, display_name, customer_id")
        .eq("org_id", input.orgId)
        .eq("customer_id", customerId)
        .in("id", subjectIds.length > 0 ? subjectIds : ["-"]);
    const nameById = new Map(
        ((memberRows ?? []) as Array<{ id: string; display_name: string | null }>).map((m) => [
            m.id,
            (m.display_name ?? "").trim() || "This child",
        ]),
    );

    /*
     * Each child's session, read per child and never shared. `form_packet_sessions` is keyed on
     * `process_instance_id` (D-95), which is what keeps two siblings' work apart even when they are
     * executing the same packet definition.
     */
    const { data: sessionRows } = await supabase
        .from("form_packet_sessions")
        .select("id, process_instance_id, status")
        .eq("org_id", input.orgId)
        .in("process_instance_id", instances.length > 0 ? instances.map((p) => p.id) : ["-"]);
    const sessionByInstance = new Map(
        ((sessionRows ?? []) as Array<{ id: string; process_instance_id: string | null; status: string | null }>)
            .filter((s) => s.process_instance_id)
            .map((s) => [s.process_instance_id as string, s]),
    );

    // Processing state per child, from that child's OWN case. Never merged for presentation.
    const { data: caseRows } = await supabase
        .from("processing_cases")
        .select("id, subject_id, state, status")
        .eq("org_id", input.orgId)
        .in("subject_id", subjectIds.length > 0 ? subjectIds : ["-"]);
    const caseBySubject = new Map(
        ((caseRows ?? []) as Array<{ subject_id: string | null; state: string | null; status: string | null }>)
            .filter((c) => c.subject_id)
            .map((c) => [c.subject_id as string, (c.state ?? c.status ?? null)]),
    );

    /*
     * EACH CHILD'S PROGRESS IS THAT CHILD'S OWN PROJECTION, QUOTED.
     *
     * One call per child to the same resolver the child's own participant surface uses, so the
     * family list and the child's own screen cannot disagree about how far they have got. Nothing
     * is recomputed here and no rollup is stored.
     */
    const children: FamilyChildJourney[] = [];
    /*
     * EACH CHILD'S OWN REQUIREMENTS, AND EACH CHILD'S OWN DUENESS.
     *
     * Siblings can be at different stages under different revisions — Ava enrolling with a fee, Ben
     * waitlisted with fields to fill. This once kept ONE family list that the last child read
     * overwrote, so Ben's waitlist fields replaced Ava's requirements, her fee read NOT_APPLICABLE and
     * the payment step vanished; and one family-wide count of open fields held every fee back until
     * every sibling's unrelated work was done. Now each child carries its own, and the fee reader
     * decides per fee which children it belongs to.
     *
     * Dueness is over the OTHER requirements: a fee that counted itself could never come due.
     */
    const requirementsByChild = new Map<string, { requirements: readonly StageRequirementV1[]; due: boolean }>();
    const siblingPaths = await siblingParticipantPaths(supabase, {
        orgId: input.orgId,
        linkId: input.linkId ?? null,
        sessions: [...sessionByInstance.values()],
    });
    for (const pi of instances) {
        const subject = pi.subject_id as string;
        // Only the household's own children, by the canonical member record — never a fallback name
        // for a subject that is not this family's.
        if (!nameById.has(subject)) continue;
        const session = sessionByInstance.get(pi.id) ?? null;
        const submitted = (session?.status ?? "") === "submitted" || (session?.status ?? "") === "completed";
        const concluded = journeyIsConcluded(pi.state);

        let childRequirements: readonly StageRequirementV1[] = [];
        /*
         * A CONCLUDED CHILD IS SHOWN, NOT WORKED. Their outcome stands on its own; their requirements
         * are not re-projected, are not outstanding, and take no part in a sibling's fee dueness.
         */
        const progress = concluded
            ? ({ ok: false } as const)
            : await resolveEnrollmentParticipantProgress(supabase, {
                  orgId: input.orgId,
                  processInstanceId: pi.id,
                  captureLoaded: (loaded) => {
                      childRequirements = loaded.requirements;
                  },
              });
        if (progress.ok) {
            const outstanding = progress.value.requirements.filter(
                (r) => r.kind !== "financial" && r.status !== "satisfied",
            ).length;
            requirementsByChild.set(subject, { requirements: childRequirements, due: outstanding === 0 });
        }

        children.push({
            customerMemberId: subject,
            displayName: nameById.get(subject) ?? "This child",
            processInstanceId: pi.id,
            sessionId: session?.id ?? null,
            /*
             * Each child keeps its OWN link. The family shell navigates between them; it never
             * re-points one child's token at another child's session.
             */
            participantPath: session?.id ? siblingPaths.get(session.id) ?? null : null,
            state: familyChildState(pi.state, pi.stage_key),
            locationName: null,
            totalRequirements: progress.ok ? progress.value.total_requirements : 0,
            satisfiedRequirements: progress.ok ? progress.value.satisfied_requirements : 0,
            remainingRequirements: progress.ok ? progress.value.remaining_requirements : 0,
            submitted,
            processingState: caseBySubject.get(subject) ?? null,
        });
    }

    /*
     * CHILDREN THE FAMILY ASKED ABOUT, NOT YET IN A JOURNEY.
     *
     * A request (`participantEnrollmentRequest`) is a participation the school is considering, with no
     * Enrollment journey yet — so it would otherwise be invisible to the family that made it. Shown as
     * requested, never as Enrolling, with no requirements and no part in any fee.
     */
    {
        const shown = new Set(children.map((c) => c.customerMemberId));
        const household = await listHouseholdChildrenForRequest(supabase, { orgId: input.orgId, customerId });
        for (const c of household) {
            if (shown.has(c.customerMemberId) || c.status !== "being_reviewed") continue;
            children.push({
                customerMemberId: c.customerMemberId,
                displayName: c.displayName,
                processInstanceId: null,
                sessionId: null,
                participantPath: null,
                state: "requested",
                locationName: null,
                totalRequirements: 0,
                satisfiedRequirements: 0,
                remainingRequirements: 0,
                submitted: false,
                processingState: null,
            });
        }
    }

    /*
     * `customers.name` is the household's name — the same column `resolveChargeDetail` reads for
     * `householdName`. Reading `display_name` here silently fell back to "Your family" for every
     * household, which is the failure mode of a wrong column name: plausible output, no error.
     */
    /*
     * Each child's agreement, which is the billable source a child-scoped fee hangs from. Read here
     * rather than inside the financial reader so that reader stays a pure consumer of identity it was
     * handed, and so a family-scoped fee costs no extra query.
     */
    const { data: agreementRows } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id")
        .eq("org_id", input.orgId)
        .in("customer_member_id", subjectIds.length > 0 ? subjectIds : ["-"]);
    const agreementByChild = new Map(
        ((agreementRows ?? []) as Array<{ id: string; customer_member_id: string | null }>)
            .filter((a) => a.customer_member_id)
            .map((a) => [a.customer_member_id as string, a.id]),
    );

    /*
     * READ, never materialize. A participant opening their family page must not bring money into
     * existence — creating a charge on a GET would bill a family for looking. An injected projection
     * still wins, which is how a caller that already holds one avoids a second read.
     */
    /*
     * The RAW projection is kept as well as the family-shaped one.
     *
     * The participant payment surface needs what the family shell does not show — which obligations
     * are reversed, and the requirement's own explanation — and it must not recompute dueness or the
     * authored requirement set to get them. Re-deriving either in a second place is how the screen a
     * parent pays from would eventually disagree with the screen that told them they owed something.
     * So it is captured here, where it was already read, and handed out unchanged.
     */
    const rawProjection =
        input.financials ? null
        :   await readFamilyEnrollmentFeeProjection(supabase, {
                orgId: input.orgId,
                customerId,
                // A child whose progress could not be read contributes no fee rather than a guessed one.
                children: children.flatMap((c) => {
                    const own = requirementsByChild.get(c.customerMemberId);
                    return own
                        ? [{
                              customerMemberId: c.customerMemberId,
                              agreementId: agreementByChild.get(c.customerMemberId) ?? null,
                              requirements: own.requirements,
                              due: own.due,
                          }]
                        : [];
                }),
            });
    const financials =
        input.financials ?? (rawProjection ? familyFinancialsFromProjection(rawProjection) : null);

    const { data: customerRow } = await supabase
        .from("customers")
        .select("name")
        .eq("org_id", input.orgId)
        .eq("id", customerId)
        .maybeSingle();
    const familyName = ((customerRow as { name?: string | null } | null)?.name ?? "").trim() || "Your family";

    return {
        ok: true,
        projection: rawProjection,
        value: composeFamilyEnrollmentExperience({
            opportunityId,
            familyName,
            children,
            /*
             * SHARED INFORMATION IS COMPLETE WHEN THE HOUSEHOLD'S OWN FACTS ARE KNOWN.
             *
             * SOME, not EVERY — because the household's facts are answered ONCE and reused.
             *
             * `every` conflated two different things: a household that has not told us who its
             * guardians are, and a child who simply has not started yet. A newly added sibling with
             * nothing done would have reset "Family information" to incomplete for a family that had
             * already given it, and asked them for it again — the exact re-entry this shell exists
             * to remove. Deliberately not a stored flag: there is no family system of record.
             */
            sharedInformationComplete: children.some((c) => c.satisfiedRequirements > 0 || c.submitted),
            /*
             * READ, never materialize. A participant opening their family page must not bring money
             * into existence — creating a charge on a GET would bill a family for looking. An injected
             * projection still wins, which is how a caller that already holds one avoids a second read.
             */
            financials,
            focusedCustomerMemberId: input.focusedCustomerMemberId ?? null,
        }),
    };
}

/** The family-facing state of one child's journey. Never an internal status key. */
function familyChildState(state: string | null, stageKey: string | null): FamilyChildJourney["state"] {
    const st = (state ?? "").trim().toLowerCase();
    if (st === "enrolled") return "enrolled";
    if (st === "withdrawn") return "withdrawn";
    if (st === "not_enrolling") return "not_enrolling";
    if ((stageKey ?? "").trim().toLowerCase() === "waitlist") return "waitlisted";
    return "in_progress";
}

/**
 * Each sibling session's participant path — offered only when its link was addressed to the SAME
 * person as the link the participant arrived on. Links are per child and per recipient; the family
 * shell may move a recipient between their own links, never into someone else's.
 */
async function siblingParticipantPaths(
    supabase: SupabaseClient,
    input: { orgId: string; linkId: string | null; sessions: ReadonlyArray<{ id: string }> },
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!input.linkId || input.sessions.length === 0) return out;
    const recipientOf = (metadata: unknown) => {
        const v = (metadata as Record<string, unknown> | null)?.recipient_person_id;
        return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const { data: own } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("org_id", input.orgId)
        .eq("id", input.linkId)
        .maybeSingle();
    const recipient = recipientOf((own as { metadata?: unknown } | null)?.metadata);
    if (!recipient) return out;

    const { data: sessionLinks } = await supabase
        .from("form_packet_sessions")
        .select("id, started_via_public_link_id")
        .eq("org_id", input.orgId)
        .in("id", input.sessions.map((s) => s.id));
    const linkBySession = new Map(
        ((sessionLinks ?? []) as Array<{ id: string; started_via_public_link_id: string | null }>)
            .filter((r) => r.started_via_public_link_id)
            .map((r) => [r.id, r.started_via_public_link_id as string]),
    );
    if (linkBySession.size === 0) return out;
    const { data: links } = await supabase
        .from("form_public_links")
        .select("id, metadata")
        .eq("org_id", input.orgId)
        .in("id", [...new Set(linkBySession.values())]);
    const linkById = new Map(((links ?? []) as Array<{ id: string; metadata: unknown }>).map((l) => [l.id, l.metadata]));
    for (const [sessionId, linkId] of linkBySession) {
        const metadata = linkById.get(linkId);
        if (recipientOf(metadata) !== recipient) continue;
        const path = readShareEmbedPath(metadata);
        if (path) out.set(sessionId, path);
    }
    return out;
}
