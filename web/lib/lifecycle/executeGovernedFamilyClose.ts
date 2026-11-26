/**
 * Governed family close — one operator action, several records, one saga.
 *
 * ORDER IS NOT CONFIGURABLE: every child close first, the family second. That is not a preference,
 * it is what makes the operation safe. `applyStageOutcomeRuleTarget`'s `update_family_case_status`
 * branch already refuses to close a family while a child track is live, and this operation does NOT
 * bypass it. By the time the family write runs, the children it was worried about are terminal, so
 * the guard passes on the evidence.
 *
 * That ordering turns the existing guard into the last line of defence rather than an obstacle: if
 * a child write silently fails to land, the family write is refused BY THE GUARD, the saga
 * compensates, and the family stays open. There is no path through this module that closes a family
 * whose children are still live — not because this module promises not to, but because the thing
 * that would have to allow it still says no.
 *
 * NOT ATOMIC. This is the Platform Transaction Contract, which is a SAGA: forward steps with
 * compensating inverses applied in reverse on abort. Its endings include `partially_committed`, and
 * when a compensation cannot be applied the result carries `integrity_breach` and the operation is
 * NOT reported as successful. A close that half-happened is the worst outcome here, so it is the
 * one the result is most explicit about.
 *
 * The classification, the closable set and the blocks all come from `planGovernedFamilyClose` —
 * the same pure function the preview calls. Preview and execution cannot disagree because they are
 * not two implementations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyStageOutcomeRuleTarget,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import {
    applyParticipantDecisionInputs,
    type ParticipantDecisionInputIssue,
} from "@/lib/lifecycle/applyParticipantDecisionInputs";
import {
    planGovernedFamilyClose,
    type FamilyCloseAffectedChild,
    type FamilyCloseBlock,
    type GovernedFamilyClosePlan,
} from "@/lib/lifecycle/planGovernedFamilyClose";
import type {
    StageOperatingPlanV1,
    StageWorkFamilyCloseV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { readEnrollmentInstancesForLead } from "@/lib/process/processInstances";
import {
    runPlatformTransaction,
    type PlatformTransactionResult,
    type PlatformTransactionStep,
    type PlatformTransactionTrace,
} from "@/lib/platform/transaction/platformTransaction";

/** Capability identity the transaction trace records this under. */
export const GOVERNED_FAMILY_CLOSE_CAPABILITY = "close_lead" as const;

export type GovernedFamilyCloseRefusalCode =
    | "not_configured"
    | "unavailable"
    | "blocked"
    | "inputs_invalid"
    | "execution_failed";

/** Refresh contract — the family, and every child the operation actually touched. */
export type GovernedFamilyCloseAffected = {
    opportunity_id: string;
    children: Array<{ customer_member_id: string; process_instance_id: string }>;
};

export type GovernedFamilyCloseResult =
    | {
          ok: true;
          affected: GovernedFamilyCloseAffected;
          plan: GovernedFamilyClosePlan;
          degraded: string[];
          correlation_id: string;
          transaction: PlatformTransactionResult<undefined>;
      }
    | {
          ok: false;
          code: GovernedFamilyCloseRefusalCode;
          message: string;
          blocks?: FamilyCloseBlock[];
          plan?: GovernedFamilyClosePlan;
          input_issues?: ParticipantDecisionInputIssue[];
          affected?: GovernedFamilyCloseAffected;
          /** True only when durable state may have changed and rollback did not prove otherwise. */
          changed?: boolean;
          integrity_breach?: PlatformTransactionResult<undefined>["integrity_breach"];
          correlation_id?: string;
          transaction?: PlatformTransactionResult<undefined>;
      };

export type GovernedFamilyCloseInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    stageKey: string;
    plan: StageOperatingPlanV1;
    templateKey: string;
    opportunityId: string;
    inputValues?: Record<string, unknown> | null;
    correlationId?: string | null;
    onTrace?: (trace: PlatformTransactionTrace) => void;
};

/** Read child names for the preview. Display only — never used to resolve a subject. */
export async function readChildNamesForLead(
    supabase: SupabaseClient,
    params: { orgId: string; customerMemberIds: readonly string[] },
): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const ids = [...new Set(params.customerMemberIds.filter(Boolean))];
    if (!ids.length) return names;
    const { data } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name")
        .eq("org_id", params.orgId)
        .in("id", ids);
    for (const row of data ?? []) {
        const r = row as { id: string; first_name?: string | null; last_name?: string | null };
        const name = [r.first_name?.trim(), r.last_name?.trim()].filter(Boolean).join(" ");
        if (name) names.set(r.id, name);
    }
    return names;
}

export function resolveFamilyCloseConfig(
    plan: StageOperatingPlanV1,
    templateKey: string,
): StageWorkFamilyCloseV1 | null {
    const template = plan.work_templates.find((t) => t.template_key === templateKey.trim());
    return template?.family_close ?? null;
}

/**
 * Build the preview. Reads, classifies, names — writes nothing.
 *
 * The route calls this to render the confirmation, and `executeGovernedFamilyClose` calls it again
 * inside `validate`. Re-planning at execution is deliberate: the operator's preview was a snapshot,
 * and a child may have been enrolled by someone else in between.
 */
export async function previewGovernedFamilyClose(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<GovernedFamilyClosePlan> {
    const read = await readEnrollmentInstancesForLead(params.supabase, {
        orgId: params.orgId,
        opportunityId: params.opportunityId,
    });
    const childNames =
        read.ok ?
            await readChildNamesForLead(params.supabase, {
                orgId: params.orgId,
                customerMemberIds: read.rows.map((r) => r.subject_id?.trim() ?? "").filter(Boolean),
            })
        :   new Map<string, string>();
    return planGovernedFamilyClose({ read, childNames });
}

export async function executeGovernedFamilyClose(
    input: GovernedFamilyCloseInput,
): Promise<GovernedFamilyCloseResult> {
    const opportunityId = input.opportunityId.trim();
    const config = resolveFamilyCloseConfig(input.plan, input.templateKey);

    if (!config) {
        return {
            ok: false,
            code: "not_configured",
            message: "Closing this lead is not something this step offers.",
        };
    }
    if (config.available === false) {
        return { ok: false, code: "unavailable", message: "Closing this lead is not currently available." };
    }

    // Inputs are validated and bound BEFORE anything is read or written. A missing close reason is
    // an operator matter, not a rollback. The SAME bound values are used for every child and for
    // the family, so one reason cannot drift between them.
    const childBinding = applyParticipantDecisionInputs({
        decision: { targets: config.child_targets, required_inputs: config.required_inputs },
        values: input.inputValues,
    });
    if (!childBinding.ok) {
        return {
            ok: false,
            code: "inputs_invalid",
            message: childBinding.issues[0]?.message ?? "Some required details are missing.",
            input_issues: childBinding.issues,
        };
    }

    // The family half binds the same operator values onto its own targets. `update_family_case_status`
    // is a declared acceptor of `close_reason_key`, so the reason lands on the case as well as on
    // each child — one operator answer, one meaning, everywhere it is recorded.
    const familyBinding = applyParticipantDecisionInputs({
        decision: {
            targets: config.family_targets,
            // Only bindings the family targets can actually carry. Re-validating the operator's
            // other answers here would report the same missing input twice.
            required_inputs: (config.required_inputs ?? []).filter(
                (i) => i.binds_to_target_field === "close_reason_key",
            ),
        },
        values: input.inputValues,
    });
    if (!familyBinding.ok) {
        return {
            ok: false,
            code: "inputs_invalid",
            message: familyBinding.issues[0]?.message ?? "Some required details are missing.",
            input_issues: familyBinding.issues,
        };
    }

    const preview = await previewGovernedFamilyClose({
        supabase: input.supabase,
        orgId: input.orgId,
        opportunityId,
    });
    if (!preview.allowed) {
        return {
            ok: false,
            code: "blocked",
            message: preview.blocks[0]?.message ?? "This family cannot be closed.",
            blocks: preview.blocks,
            plan: preview,
        };
    }

    const affected: GovernedFamilyCloseAffected = {
        opportunity_id: opportunityId,
        children: preview.closing.map((c) => ({
            customer_member_id: c.customer_member_id,
            process_instance_id: c.process_instance_id,
        })),
    };

    const degraded: string[] = [];
    /**
     * ONE INVERSE LIST PER STEP, not one shared list.
     *
     * A shared list technically unwinds correctly — the later step's compensation would drain
     * everything and the earlier one would find nothing left — but it makes each step's failure
     * message describe writes it does not own, so "family close not fully reverted" could actually
     * be a child inverse that failed. Separate lists keep each step's compensation, and each step's
     * breach report, about its own writes.
     */
    const childUndo: Array<{ run: () => Promise<void> }> = [];
    const familyUndo: Array<{ run: () => Promise<void> }> = [];

    const subjectFor = (child: FamilyCloseAffectedChild): StageOutcomeExecutionSubject => ({
        journey_segment: "child",
        opportunity_id: opportunityId,
        customer_member_id: child.customer_member_id,
        process_instance_id: child.process_instance_id,
        participant_label: child.label,
    });

    const transaction = await runPlatformTransaction({
        capability: GOVERNED_FAMILY_CLOSE_CAPABILITY,
        correlationId: input.correlationId ?? null,
        actorUserId: input.userId,
        subject: {
            opportunity_id: opportunityId,
            stage_key: input.stageKey,
            child_count: String(preview.closing.length),
        },
        // A double-submitted close joins the running transaction instead of executing twice.
        idempotencyKey: `${input.orgId}:${opportunityId}:family_close`,
        onTrace: input.onTrace,
        steps: (): PlatformTransactionStep[] => [
            {
                name: "close_child_tracks",
                stage: "business_process",
                // Several children, several writes each; a failure partway through must still undo
                // the ones that landed.
                compensateOnFailure: true,
                run: async () => {
                    let closed = 0;
                    for (const child of preview.closing) {
                        for (const target of childBinding.targets) {
                            const result = await applyStageOutcomeRuleTarget(input.supabase, {
                                orgId: input.orgId,
                                userId: input.userId,
                                departmentId: input.departmentId,
                                stageKey: input.stageKey,
                                plan: input.plan,
                                subject: subjectFor(child),
                                target,
                            });
                            // Record the inverse BEFORE inspecting the error — a write-count failure
                            // can arrive together with an undo for rows that were written.
                            if (result.undo) childUndo.push({ run: result.undo });
                            if (result.degraded) degraded.push(result.degraded);
                            // Named, so a partial failure says WHICH child stopped it.
                            if (result.error) throw new Error(`${child.label}: ${result.error}`);
                        }
                        closed += 1;
                    }
                    return closed;
                },
                compensate: async () => {
                    const failures = await unwind(childUndo);
                    if (failures.length) {
                        throw new Error(`child closes not fully reverted — ${failures.join("; ")}`);
                    }
                },
            },
            {
                name: "close_family_case",
                stage: "business_process",
                compensateOnFailure: true,
                run: async () => {
                    for (const target of familyBinding.targets) {
                        const result = await applyStageOutcomeRuleTarget(input.supabase, {
                            orgId: input.orgId,
                            userId: input.userId,
                            departmentId: input.departmentId,
                            stageKey: input.stageKey,
                            plan: input.plan,
                            subject: { journey_segment: "family", opportunity_id: opportunityId },
                            target,
                        });
                        if (result.undo) familyUndo.push({ run: result.undo });
                        if (result.degraded) degraded.push(result.degraded);
                        // Includes the family-close guard's own refusal. If a child write did not
                        // land, this is where the operation stops — and it stops with the children
                        // still compensable.
                        if (result.error) throw new Error(result.error);
                    }
                    return true;
                },
                compensate: async () => {
                    const failures = await unwind(familyUndo);
                    if (failures.length) {
                        throw new Error(`family close not fully reverted — ${failures.join("; ")}`);
                    }
                },
            },
        ],
    });

    if (!transaction.ok) {
        return {
            ok: false,
            code: "execution_failed",
            message: transaction.message ?? "Could not close this family.",
            plan: preview,
            affected,
            changed: transaction.changed,
            integrity_breach: transaction.integrity_breach,
            correlation_id: transaction.correlation_id,
            transaction,
        };
    }

    return {
        ok: true,
        affected,
        plan: preview,
        degraded,
        correlation_id: transaction.correlation_id,
        transaction,
    };
}

/**
 * Apply inverses in reverse order, collecting every failure.
 *
 * Deliberately does NOT stop at the first failure: one un-revertible write must not prevent the
 * others from being reverted, and the caller needs the full list to describe the breach honestly.
 */
async function unwind(applied: Array<{ run: () => Promise<void> }>): Promise<string[]> {
    const failures: string[] = [];
    for (let i = applied.length - 1; i >= 0; i -= 1) {
        try {
            await applied[i]!.run();
        } catch (e) {
            failures.push(e instanceof Error ? e.message : String(e));
        }
    }
    applied.length = 0;
    return failures;
}
