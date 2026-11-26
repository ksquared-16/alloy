/**
 * Record contact performed OUTSIDE Alloy (external phone, personal line, external
 * email, in-person, another authorized channel). This is an operator declaration —
 * it reuses the canonical outcome/consequence machinery (completeStageWorkWithOutcome)
 * and records provenance `external_manual`. It fabricates no communication_messages
 * row: Alloy does not pretend it executed the contact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import {
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveJourneySegment } from "@/lib/lifecycle/grainVocabulary";

export type ExternalContactChannel =
    | "phone"
    | "external_email"
    | "in_person"
    | "other";

export type ReportExternalContactInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    /** Explicit root execution Subject — never inferred from selected UI state. */
    opportunityId: string;
    stageKey: string;
    workId: string;
    /** Operator-declared outcome key (must be an authored outcome for this stage). */
    outcomeKey: string;
    channel: ExternalContactChannel;
    note?: string | null;
};

export type ReportExternalContactResult = {
    ok: boolean;
    error?: string;
    work_closed?: boolean;
    outcome_key?: string;
};

export async function reportExternalContact(
    input: ReportExternalContactInput,
): Promise<ReportExternalContactResult> {
    const opportunityId = input.opportunityId.trim();
    const stageKey = input.stageKey.trim();
    const workId = input.workId.trim();
    const outcomeKey = input.outcomeKey.trim();
    if (!opportunityId || !stageKey || !workId || !outcomeKey) {
        return { ok: false, error: "opportunityId, stageKey, workId, outcomeKey are required" };
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId: input.orgId,
        opportunityId,
    });
    if (!departmentId) return { ok: false, error: "No department for opportunity" };

    // Resolve journey_segment from config so the explicit Subject is carried, not inferred.
    const { data: dept } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    const metadata =
        dept?.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const plan = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
    // `plan` can genuinely be null here, and the old `?? "family"` then reported an external contact
    // on a CHILD-grain stage as a family. The stage's own grain answers that, and where both are
    // declared they must agree. This caller carries no child identity, so on a child stage the
    // outcome guard refuses — the honest answer for a caller that cannot name a child.
    const segment = resolveJourneySegment({
        planSegment: plan?.journey_segment,
        stageGrain: stageRecord?.grain,
    });
    if (!segment.ok) return { ok: false, error: segment.reason };
    const journeySegment = segment.segment;

    const completion = await completeStageWorkWithOutcome({
        supabase: input.supabase,
        orgId: input.orgId,
        userId: input.userId,
        departmentId,
        stageKey,
        workId,
        outcomeKey,
        subject: {
            journey_segment: journeySegment,
            opportunity_id: opportunityId,
        },
        declaration: {
            provenance: "external_manual",
            channel: input.channel,
            note: input.note ?? null,
        },
    });

    return {
        ok: completion.ok,
        error: completion.error,
        work_closed: completion.work_closed,
        outcome_key: completion.ok ? outcomeKey : undefined,
    };
}
