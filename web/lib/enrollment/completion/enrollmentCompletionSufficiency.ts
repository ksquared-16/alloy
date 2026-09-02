/**
 * Does anything still BLOCK Enrollment completion for this child?
 *
 * ## One truth, three consumers
 *
 * The requirement projection (`resolveEnrollmentParticipantProgress`) has always been able to answer
 * whether a configured requirement is satisfied — Business Process owns which requirements exist,
 * Forms owns the evidence, and that projection owns the join. It was consumed by the participant
 * runtime and by NOTHING else, so the operator surface and the completion outcome had no way to ask
 * the same question and would each have had to invent an answer.
 *
 * This is that question, asked once and shared:
 *
 * ```
 *   participant runtime          "what should I ask the parent next?"
 *   operator readiness surface   "can Enrollment be completed?"
 *   completion outcome preflight "may I execute?"
 * ```
 *
 * Nothing here re-checks a Forms submission, re-reads a packet or re-derives a requirement. It
 * classifies what the projection already established.
 *
 * ## What blocks, and why `level` decides it
 *
 * Business Process already states each requirement's enforcement level. `recommended` is guidance
 * and must not hold a family out of care; `required` and `enforced` are the ones that mean it.
 * Reading that rather than inventing a policy here keeps completion configurable by the same
 * authority that decides the requirements exist.
 *
 * `unrealized` and `unsupported` BLOCK. They are diagnostics about a packet, or about a requirement
 * kind this runtime cannot evaluate, and neither is evidence of completion — treating them as
 * non-blocking would let an incomplete packet configuration read as a finished enrolment, which is
 * the exact failure `unrealized` was invented to prevent.
 *
 * ## Exceptions are consulted, never inferred
 *
 * A governed exception makes one requirement non-blocking while leaving it visibly EXCEPTED. It is
 * never turned into a fabricated submission and the requirement's own status is untouched, so an
 * operator reading the record later can see that a person decided this. The store is supplied by the
 * caller, which keeps this pure and lets the store arrive later without changing the contract.
 *
 * Pure. No I/O.
 */

import type {
    EnrollmentParticipantProgress,
    EnrollmentRequirementProgress,
} from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";

/** Levels Business Process treats as genuinely blocking. `recommended` is guidance. */
const BLOCKING_LEVELS: ReadonlySet<string> = new Set(["required", "enforced"]);

/**
 * An approved, active exception for one requirement. Deliberately minimal.
 *
 * `approved_by` is nullable because the approver's account can later be deleted — the decision
 * survives the person. It is never null at the moment one is granted; the write seam requires an
 * actor.
 */
export type RequirementExceptionRef = {
    readonly requirement_id: string;
    readonly reason: string;
    readonly approved_by: string | null;
    readonly approved_at: string;
};

export type RequirementDisposition = "satisfied" | "excepted" | "blocking" | "not_blocking";

export type EnrollmentRequirementSufficiency = {
    readonly requirement_id: string;
    readonly artifact: EnrollmentRequirementProgress["artifact"];
    readonly level: EnrollmentRequirementProgress["level"];
    readonly status: EnrollmentRequirementProgress["status"];
    readonly disposition: RequirementDisposition;
    /** Operator-readable, present only when this requirement blocks. */
    readonly blocked_reason?: string;
    readonly exception?: RequirementExceptionRef;
};

export type EnrollmentCompletionSufficiency = {
    /** True when nothing blocks: every applicable requirement is satisfied or excepted. */
    readonly eligible: boolean;
    readonly requirements: readonly EnrollmentRequirementSufficiency[];
    readonly blocking: readonly EnrollmentRequirementSufficiency[];
    readonly counts: {
        readonly total: number;
        readonly satisfied: number;
        readonly excepted: number;
        readonly blocking: number;
    };
};

function blockedReason(requirement: EnrollmentRequirementProgress): string {
    switch (requirement.status) {
        case "outstanding":
            return "The paperwork has not been submitted yet.";
        case "unrealized":
            return requirement.reason ?? "This requirement is not in the family's packet.";
        case "unsupported":
            return requirement.reason ?? "This requirement kind cannot be evaluated automatically.";
        default:
            return "This requirement is not satisfied.";
    }
}

/**
 * Classify every configured requirement, and say whether completion may proceed.
 *
 * `eligible` answers exactly one question — "does anything still block completion?" — and it is
 * never true merely because a participant reached a final screen, because a card disappeared, or
 * because a document was generated.
 */
export function evaluateEnrollmentCompletionSufficiency(input: {
    readonly progress: Pick<EnrollmentParticipantProgress, "requirements">;
    /** Active governed exceptions by `requirement_id`. Absent means none. */
    readonly exceptions?: Readonly<Record<string, RequirementExceptionRef>>;
}): EnrollmentCompletionSufficiency {
    const exceptions = input.exceptions ?? {};

    const requirements = input.progress.requirements.map((requirement): EnrollmentRequirementSufficiency => {
        const base = {
            requirement_id: requirement.requirement_id,
            artifact: requirement.artifact,
            level: requirement.level,
            status: requirement.status,
        };

        if (requirement.status === "satisfied") return { ...base, disposition: "satisfied" };

        /*
         * An EXCEPTION is consulted before the level, and it leaves the status alone — the
         * requirement stays visibly outstanding-but-excepted rather than dressed up as submitted.
         */
        const exception = exceptions[requirement.requirement_id];
        if (exception) return { ...base, disposition: "excepted", exception };

        // Business Process decides what is merely recommended; guidance never blocks completion.
        if (!BLOCKING_LEVELS.has(requirement.level)) return { ...base, disposition: "not_blocking" };

        return { ...base, disposition: "blocking", blocked_reason: blockedReason(requirement) };
    });

    const blocking = requirements.filter((r) => r.disposition === "blocking");
    return {
        eligible: blocking.length === 0,
        requirements,
        blocking,
        counts: {
            total: requirements.length,
            satisfied: requirements.filter((r) => r.disposition === "satisfied").length,
            excepted: requirements.filter((r) => r.disposition === "excepted").length,
            blocking: blocking.length,
        },
    };
}

/**
 * The same evaluation, resolved for one journey — the call an operator surface or a completion
 * preflight makes.
 *
 * Deliberately thin: it resolves the EXISTING progress projection and classifies it. There is no
 * second requirement resolver, and a caller that already holds progress should use the pure
 * function above rather than re-resolving.
 *
 * ## Exceptions are loaded here, not asked for
 *
 * A caller that had to remember to pass exceptions is a caller that can forget, and forgetting
 * would silently re-block a requirement a person had already decided about — on one surface and not
 * another. So the standing decisions are read from their canonical owner unless the caller supplies
 * a set explicitly, which the pure tests and preview paths still do.
 *
 * The subject is the Enrollment Participation, resolved through the one journey-context resolver,
 * so both anchor shapes reach the same exceptions. An unresolvable subject yields NO exceptions:
 * absence can only ever make completion harder.
 */
export async function resolveEnrollmentCompletionSufficiency(
    supabase: import("@supabase/supabase-js").SupabaseClient,
    input: {
        readonly orgId: string;
        readonly processInstanceId: string;
        readonly exceptions?: Readonly<Record<string, RequirementExceptionRef>>;
    },
): Promise<
    | { readonly ok: true; readonly sufficiency: EnrollmentCompletionSufficiency }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } }
> {
    const { resolveEnrollmentParticipantProgress } = await import(
        "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress"
    );
    const progress = await resolveEnrollmentParticipantProgress(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
    });
    if (!progress.ok) return { ok: false, refusal: progress.refusal };

    const exceptions = input.exceptions ?? (await resolveStandingExceptions(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        stageKey: progress.value.stage_key,
    }));

    return {
        ok: true,
        sufficiency: evaluateEnrollmentCompletionSufficiency({
            progress: progress.value,
            exceptions,
        }),
    };
}

/** The standing exceptions for this journey's durable subject, at the stage being evaluated. */
async function resolveStandingExceptions(
    supabase: import("@supabase/supabase-js").SupabaseClient,
    input: { readonly orgId: string; readonly processInstanceId: string; readonly stageKey: string | null },
): Promise<Readonly<Record<string, RequirementExceptionRef>>> {
    if (!input.stageKey) return {};

    const { data } = await supabase
        .from("process_instances")
        .select("id, subject_id, context_type, context_id")
        .eq("org_id", input.orgId)
        .eq("id", input.processInstanceId)
        .maybeSingle();
    const row = data as
        | { id: string; subject_id: string | null; context_type: string | null; context_id: string | null }
        | null;
    if (!row) return {};

    const { resolveEnrollmentJourneyContext } = await import(
        "@/lib/enrollment/completion/resolveEnrollmentJourneyContext"
    );
    const journey = await resolveEnrollmentJourneyContext(supabase, {
        orgId: input.orgId,
        processInstance: row,
    });

    const { loadActiveRequirementExceptions } = await import(
        "@/lib/enrollment/completion/requirementExceptionService"
    );
    return loadActiveRequirementExceptions(supabase, {
        orgId: input.orgId,
        participationId: journey.participationId,
        stageKey: input.stageKey,
    });
}
