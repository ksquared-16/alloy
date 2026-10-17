/**
 * WHEN A CHILD'S PAPERWORK IS DONE, ITS FEE BECOMES A CHARGE — exactly once.
 *
 * The fee bridge (`resolveEnrollmentFeeObligations`) existed with no automatic caller, so a family who
 * finished their paperwork was shown "not due yet" or nothing at all, and the fee waited for someone
 * to call an admin route by hand. This is the caller, and it is deliberately narrow:
 *
 *  - WHEN: the child's journey has no outstanding NON-financial requirement — the same rule the family
 *    projection already uses (a fee that counted itself could never come due). Asked of this child's
 *    own progress, because a per-child fee is owed when THAT child's paperwork is done.
 *  - THE DATE: the moment the child's packet session COMPLETED, as a calendar day in the organisation's
 *    zone. It is persisted by the packet authority, so a retry, a replay or a later refresh computes the
 *    same day — and the day is part of the idempotency key, so the same day means the same charge.
 *    "Today" would mint a second charge tomorrow; a page view would bill a family for looking.
 *  - WHAT: only `each_child` requirements, one obligation for this child. A family-scoped fee is owed
 *    when the whole family's paperwork is done, which is not this child's milestone; it is left to its
 *    own trigger rather than charged early here.
 *  - NOT: a withdrawn or not-enrolling journey is never charged. Reversing a fee already posted is a
 *    Financials correction, not something this function does.
 *
 * Money is never decided here. The template, the amount, the due date, posting and the ledger are all
 * Financials', through the bridge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchOrgTimeZoneIana } from "@/lib/admin/orgLocalDayBounds";
import { resolveEnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import { financialRequirementsOf } from "@/lib/enrollment/financial/readEnrollmentFeeProjection";
import {
    resolveEnrollmentFeeObligations,
    type ResolveEnrollmentFeeResult,
} from "@/lib/enrollment/financial/resolveEnrollmentFeeObligations";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

const NOT_BILLABLE_STATES = new Set(["withdrawn", "not_enrolling"]);

export type RealizeEnrollmentFeesResult =
    | { readonly status: "not_applicable"; readonly reason: string }
    | { readonly status: "not_due"; readonly outstanding: number }
    | { readonly status: "no_due_milestone" }
    | {
          readonly status: "realized";
          readonly dueOn: string;
          readonly requirements: readonly {
              readonly requirementId: string;
              readonly chargeTemplateKey: string;
              readonly result: ResolveEnrollmentFeeResult;
          }[];
      };

/** A timestamp as the calendar day it falls on in `timeZone`. */
export function calendarDayIn(timestampIso: string, timeZone: string): string | null {
    const t = new Date(timestampIso);
    if (Number.isNaN(t.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

export async function realizeEnrollmentFeesForProcessInstance(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly processInstanceId: string; readonly actorUserId?: string | null },
): Promise<RealizeEnrollmentFeesResult> {
    let requirements: readonly StageRequirementV1[] = [];
    let childId: string | null = null;
    const progress = await resolveEnrollmentParticipantProgress(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        captureLoaded: (loaded) => {
            requirements = loaded.requirements;
            childId = loaded.subjectId;
        },
    });
    if (!progress.ok) return { status: "not_applicable", reason: "no_journey_progress" };

    const perChild = financialRequirementsOf(requirements).filter((r) => r.scope === "each_child");
    if (perChild.length === 0) return { status: "not_applicable", reason: "no_per_child_fee" };

    const outstanding = progress.value.requirements.filter((r) => r.kind !== "financial" && r.status !== "satisfied").length;
    if (outstanding > 0) return { status: "not_due", outstanding };

    if (!childId) return { status: "not_applicable", reason: "no_child_subject" };
    const { data: pi } = await supabase
        .from("process_instances")
        .select("state")
        .eq("org_id", input.orgId)
        .eq("id", input.processInstanceId)
        .maybeSingle();
    const state = ((pi as { state?: string | null } | null)?.state ?? "").trim();
    if (NOT_BILLABLE_STATES.has(state)) return { status: "not_applicable", reason: `journey_${state}` };

    /*
     * THE DATE: the persisted completion of this child's packet session — never "now".
     *
     * Read directly, by status. The progress resolver's session is the CURRENT one, and "current"
     * means in_progress: at the moment of completion the session has just become history, so it was
     * never there to read and the fee never came due (found in the H3-3 census; the H3-2 unit test
     * had mocked the session the runtime does not see). The latest COMPLETED session for this journey
     * is the milestone.
     */
    const { data: sessionRows } = await supabase
        .from("form_packet_sessions")
        .select("status, completed_at")
        .eq("org_id", input.orgId)
        .eq("process_instance_id", input.processInstanceId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1);
    const session = ((sessionRows ?? []) as { status?: string | null; completed_at?: string | null }[])[0] ?? null;
    if (!session?.completed_at) return { status: "no_due_milestone" };
    const dueOn = calendarDayIn(session.completed_at, await fetchOrgTimeZoneIana(supabase, input.orgId));
    if (!dueOn) return { status: "no_due_milestone" };

    const { data: member } = await supabase
        .from("customer_members")
        .select("customer_id")
        .eq("org_id", input.orgId)
        .eq("id", childId)
        .maybeSingle();
    const customerId = ((member as { customer_id?: string | null } | null)?.customer_id ?? "").trim();
    if (!customerId) return { status: "not_applicable", reason: "child_has_no_household" };

    // The child's agreement, if any — only so a fee an earlier path wrote there is recognised.
    const { data: agreements } = await supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_member_id", childId)
        .limit(1);
    const agreementId = ((agreements ?? []) as { id: string }[])[0]?.id ?? null;

    const results: { requirementId: string; chargeTemplateKey: string; result: ResolveEnrollmentFeeResult }[] = [];
    for (const req of perChild) {
        const result = await resolveEnrollmentFeeObligations(supabase, {
            orgId: input.orgId,
            requirementId: req.requirementId,
            chargeTemplateKey: req.chargeTemplateKey,
            scope: "each_child",
            customerId,
            enrollingChildren: [{ customerMemberId: childId, agreementId }],
            dueOn,
            actorUserId: input.actorUserId ?? null,
        });
        results.push({ requirementId: req.requirementId, chargeTemplateKey: req.chargeTemplateKey, result });
    }
    return { status: "realized", dueOn, requirements: results };
}

/**
 * THE BACKSTOP. A fee that should have become a charge at packet completion and did not.
 *
 * The completion trigger is best-effort — a transient failure is logged, never a failed submit — so
 * without this a family could finish their paperwork and never be billed. This re-asks the SAME
 * realizer for recently completed sessions; it is not a second writer. Because the realizer is
 * idempotent on the child, the template and the session's own completion day, a session whose fee
 * already exists resolves to that charge and writes nothing.
 *
 * Bounded in time and count, and run from the scheduled wake. Never from a page view: rendering must
 * not bring money into existence.
 */
export async function sweepUnrealizedEnrollmentFees(
    supabase: SupabaseClient,
    opts: { readonly sinceHours?: number; readonly limit?: number; readonly now?: Date } = {},
): Promise<{ examined: number; realized: number; created: number; failed: number }> {
    const since = new Date((opts.now ?? new Date()).getTime() - (opts.sinceHours ?? 72) * 3_600_000).toISOString();
    const { data } = await supabase
        .from("form_packet_sessions")
        .select("org_id, process_instance_id")
        .eq("status", "completed")
        .not("process_instance_id", "is", null)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false })
        .limit(opts.limit ?? 25);
    const rows = (data ?? []) as { org_id: string; process_instance_id: string }[];
    let realized = 0;
    let created = 0;
    let failed = 0;
    for (const row of rows) {
        try {
            const r = await realizeEnrollmentFeesForProcessInstance(supabase, { orgId: row.org_id, processInstanceId: row.process_instance_id });
            if (r.status !== "realized") continue;
            realized += 1;
            for (const req of r.requirements) {
                for (const o of req.result.outcomes) if (o.status === "created") created += 1;
            }
        } catch {
            failed += 1;
        }
    }
    return { examined: rows.length, realized, created, failed };
}
