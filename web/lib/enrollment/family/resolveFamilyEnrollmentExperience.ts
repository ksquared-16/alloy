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

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveLiveEnrollmentContextForHousehold } from "@/lib/records/enrollmentContextResolver";
import { CONCLUDED_ENROLLMENT_PROCESS_STATES } from "@/lib/process/processInstances";
import { resolveEnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import {
    composeFamilyEnrollmentExperience,
    type FamilyChildJourney,
    type FamilyEnrollmentExperience,
    type FamilyEnrollmentFinancials,
} from "@/lib/enrollment/family/familyEnrollmentExperience";

export type FamilyExperienceRefusal =
    | { readonly code: "no_household"; readonly detail: string }
    | { readonly code: "no_live_episode"; readonly detail: string };

export type ResolveFamilyEnrollmentResult =
    | { readonly ok: true; readonly value: FamilyEnrollmentExperience }
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
        /** Injected so this resolver never reaches into Financials itself. */
        readonly financials?: FamilyEnrollmentFinancials | null;
    },
): Promise<ResolveFamilyEnrollmentResult> {
    const customerId = householdIdFromSession(input.session);
    if (!customerId) {
        return { ok: false, refusal: { code: "no_household", detail: "This session names no household." } };
    }

    const live = await resolveLiveEnrollmentContextForHousehold(supabase, input.orgId, customerId);
    if (!live.context) {
        /*
         * "No live episode" is an ordinary answer, not a failure — the context resolver says so in
         * as many words. A single child enrolling with nothing else running has no family journey to
         * show, and manufacturing one would invent a grouping nobody asked for.
         */
        return {
            ok: false,
            refusal: { code: "no_live_episode", detail: "This household has no live enrolment episode." },
        };
    }

    const { opportunityId } = live.context;

    /*
     * THE CHILDREN COME FROM THE EPISODE, NOT FROM THE HOUSEHOLD.
     *
     * A household's `customer_members` includes siblings who are not enrolling, children who
     * finished years ago, and children added by a respondent but never launched. Listing those as
     * part of THIS journey would show a parent work they do not have.
     */
    const { data: piRows, error: piErr } = await supabase
        .from("process_instances")
        .select("id, subject_id, state, stage_key")
        .eq("org_id", input.orgId)
        .in("subject_id", live.context.runningSubjectIds.length > 0 ? live.context.runningSubjectIds : ["-"]);
    if (piErr) throw new Error(piErr.message);
    const instances = ((piRows ?? []) as Array<{ id: string; subject_id: string | null; state: string | null; stage_key: string | null }>)
        .filter((p) => !CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((p.state ?? "").trim().toLowerCase()));

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
    for (const pi of instances) {
        const subject = pi.subject_id as string;
        const session = sessionByInstance.get(pi.id) ?? null;
        const submitted = (session?.status ?? "") === "submitted" || (session?.status ?? "") === "completed";

        const progress = await resolveEnrollmentParticipantProgress(supabase, {
            orgId: input.orgId,
            processInstanceId: pi.id,
        });

        children.push({
            customerMemberId: subject,
            displayName: nameById.get(subject) ?? "This child",
            processInstanceId: pi.id,
            sessionId: session?.id ?? null,
            /*
             * Each child keeps its OWN link. The family shell navigates between them; it never
             * re-points one child's token at another child's session.
             */
            participantPath: null,
            locationName: null,
            totalRequirements: progress.ok ? progress.value.total_requirements : 0,
            satisfiedRequirements: progress.ok ? progress.value.satisfied_requirements : 0,
            remainingRequirements: progress.ok ? progress.value.remaining_requirements : 0,
            submitted,
            processingState: caseBySubject.get(subject) ?? null,
        });
    }

    const { data: customerRow } = await supabase
        .from("customers")
        .select("display_name")
        .eq("org_id", input.orgId)
        .eq("id", customerId)
        .maybeSingle();
    const familyName = ((customerRow as { display_name?: string | null } | null)?.display_name ?? "").trim() || "Your family";

    return {
        ok: true,
        value: composeFamilyEnrollmentExperience({
            opportunityId,
            familyName,
            children,
            /*
             * SHARED INFORMATION IS COMPLETE WHEN THE HOUSEHOLD'S OWN FACTS ARE KNOWN.
             *
             * Derived from canonical prefill reaching every child rather than from a family-owned
             * record: if each child's session has satisfied something, the household half of the
             * packet has been answered once and reused. It is deliberately NOT a stored flag —
             * there is no family system of record to keep in sync.
             */
            sharedInformationComplete: children.length > 0 && children.every((c) => c.satisfiedRequirements > 0 || c.submitted),
            financials: input.financials ?? null,
            focusedCustomerMemberId: input.focusedCustomerMemberId ?? null,
        }),
    };
}
