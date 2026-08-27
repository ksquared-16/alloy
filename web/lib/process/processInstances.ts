/**
 * process_instances — the generic runtime primitive for a running operational journey.
 *
 * A Process Instance is a SUBJECT moving through a PROCESS within a CONTEXT. It owns the
 * runtime position (`stage_key`), durable `state`, and domain participation payload (`metadata`).
 * For Enrollment it REPLACES opportunity_customer_members (OCM) as the runtime owner of child
 * participation. OCM is a temporary legacy data source only (see the OCM removal plan).
 *
 * Doctrine: Lead/opportunity is context; Child is subject; Process Instance is the journey;
 * Work attaches to the instance; Outcomes move the instance; Work Views read instances.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { stageEnteredAtNowIso } from "@/lib/lifecycle/operationalStateEnteredAt";
import {
    resolveCurrentEnrollmentBusinessProcessRevision,
    type EnrollmentBusinessProcessRevision,
    type EnrollmentRevisionPinOutcome,
} from "@/lib/process/resolveEnrollmentBusinessProcessRevision";

export const PROCESS_INSTANCES_TABLE = "process_instances" as const;

/** Enrollment subject/context vocabulary (generic table, enrollment binding). */
export const ENROLLMENT_SUBJECT_TYPE = "child" as const;
export const ENROLLMENT_CONTEXT_TYPE = "opportunity" as const;

/**
 * The context an Enrollment journey anchors to: its Enrollment Participation.
 *
 * `opportunity_customer_members` is the durable owner of a child's Enrollment state, and a journey
 * needs that subject whether or not the family arrived through acquisition. The older shape put an
 * OPPORTUNITY in the context pair, which cannot describe a legitimate context-free enrolment — and
 * overloading `"opportunity"` with an OCM id would make `context_id` mean two different things
 * depending on who wrote it.
 *
 * So this is a second, precise type on the SAME generic pair. `context_type` exists to discriminate;
 * the column's own comment calls the context "generic, optional". New Enrollment journeys use this
 * one; instances written under the older shape are still read (see
 * `resolveEnrollmentJourneyContext`), which is what lets the two converge without a flag day.
 */
export const ENROLLMENT_PARTICIPATION_CONTEXT_TYPE = "enrollment_participation" as const;

/** Durable enrollment process state (replaces OCM.outcome_status_key). null = in-process pre-outcome. */
export type EnrollmentProcessState =
    | "waitlisted"
    | "enrolling"
    | "enrolled"
    | "withdrawn"
    | "not_enrolling";

export type ProcessInstanceRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
    subject_id: string;
    context_type: string | null;
    context_id: string | null;
    stage_key: string | null;
    /** When the instance entered its current stage_key (null before first stage write / backfill). */
    stage_entered_at: string | null;
    state: string | null;
    close_reason_key: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

/** Enrollment participation payload carried in metadata (canonical fields; no OCM dependency). */
export type EnrollmentParticipationMetadata = {
    /** Family preferred start timing (Requested Start) — never rewritten by commitment. */
    start_date?: string | null;
    schedule_type?: string | null;
    program_category_id?: string | null;
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    notes?: string | null;
    /**
     * Requested care intensity before exact weekdays are known.
     * Distinct from preferred weekdays (`weekdays`) and from committed schedule_assignments.
     */
    requested_days_per_week?: number | null;
    /** Preferred weekdays (0=Sun…6=Sat) — intent only until a proposed/committed assignment exists. */
    weekdays?: number[] | null;
};

/**
 * Focus Panel truth bag: customer_member_id → process_instances.metadata.
 * Lets Assignments card / buildAssignmentCardModelFromTruth read requested_days and quotes
 * without inventing a parallel fetch.
 */
export function buildEnrollmentParticipationByMemberMap(
    instances: Array<{ subject_id: string; metadata?: Record<string, unknown> | null }>,
): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const pi of instances) {
        const subjectId = typeof pi.subject_id === "string" ? pi.subject_id.trim() : "";
        if (!subjectId) continue;
        const meta =
            pi.metadata && typeof pi.metadata === "object" && !Array.isArray(pi.metadata)
                ? { ...pi.metadata }
                : {};
        out[subjectId] = meta;
    }
    return out;
}

/**
 * Build the insert row for an enrollment process instance.
 *
 * ── CONTEXT IS OPTIONAL, AS THE SCHEMA ALWAYS SAID ──
 *
 * `context_id` is nullable and the column's own comment calls the context "generic, optional".
 * This helper nonetheless REQUIRED an opportunity, which made a code-level constraint look like a
 * platform one — it is why Start Enrollment was previously judged impossible from a durable Child
 * record. A child added to Records has no acquisition episode, and inventing an Opportunity to
 * satisfy a helper would have manufactured an acquisition that never happened.
 *
 * When `contextId` is absent, `context_type` is omitted too: a context type naming nothing is a
 * dangling label, and the pair is meaningful only together.
 */
export function buildEnrollmentProcessInstanceInsert(args: {
    orgId: string;
    /** child = customer_members.id */
    subjectId: string;
    /** The context id — an Enrollment Participation, or an Opportunity under the older shape. */
    contextId?: string | null;
    /**
     * What `contextId` IS. Defaults to the older opportunity shape so existing callers are
     * unchanged; Enrollment journeys pass the participation type.
     */
    contextType?: string | null;
    /**
     * The acquisition Opportunity this journey came from, when one exists.
     *
     * Separate from the context on purpose. The context says what the journey IS ANCHORED TO; this
     * says where the family came from. They were the same value while Enrollment anchored to an
     * Opportunity, and conflating them is exactly what would put an OCM id into an Opportunity
     * lookup. Null for a context-free start, which is an ordinary answer.
     */
    acquisitionOpportunityId?: string | null;
    /** Initial stage; a brand-new lead's child rides the family track → null until a decision. */
    stageKey?: string | null;
    /** Initial durable state; null at intake (no enrollment outcome yet). */
    state?: EnrollmentProcessState | null;
    participation?: EnrollmentParticipationMetadata;
    /** Provenance. Defaults to `create_lead`, this helper's original and still-largest caller. */
    source?: string;
    /**
     * D-96. The immutable Business Process revision that governs this journey, resolved by
     * {@link createEnrollmentProcessInstance} and included in THIS insert.
     *
     * Part of the row rather than a follow-up UPDATE on purpose: between an insert and a patch the
     * instance would exist unpinned, and anything reading it in that window would resolve live
     * configuration — the exact drift the pin removes. The database also refuses the repoint, so a
     * create-then-patch design would be racing a trigger built to stop it.
     */
    businessProcessRevisionId?: string | null;
}): Record<string, unknown> {
    const metadata: Record<string, unknown> = { source: args.source ?? "create_lead" };
    for (const [k, v] of Object.entries(args.participation ?? {})) {
        if (v !== undefined && v !== null && v !== "") metadata[k] = v;
    }
    const stageKey = args.stageKey ?? null;
    const contextId = (args.contextId ?? "").trim() || null;
    const revisionId = (args.businessProcessRevisionId ?? "").trim() || null;
    return {
        org_id: args.orgId,
        process_key: ENROLLMENT_PROCESS_KEY,
        subject_type: ENROLLMENT_SUBJECT_TYPE,
        subject_id: args.subjectId,
        ...(contextId
            ? { context_type: (args.contextType ?? "").trim() || ENROLLMENT_CONTEXT_TYPE, context_id: contextId }
            : {}),
        stage_key: stageKey,
        // Only stamp entry when the instance starts with an explicit stage membership.
        ...(stageKey ? { stage_entered_at: stageEnteredAtNowIso() } : {}),
        state: args.state ?? null,
        // Omitted rather than sent as null when unresolved, so the column stays absent from the
        // upsert's SET list and a re-run can never clear a pin the database already refuses to clear.
        ...(revisionId ? { business_process_revision_id: revisionId } : {}),
        metadata,
    };
}

/**
 * Create an enrollment process instance for a child. Idempotent.
 *
 * Two different idempotency mechanisms, because the database offers two:
 *
 *   • WITH a context — `ux_process_instances_scope` is a plain unique index, so the upsert's
 *     conflict target matches and the duplicate is ignored. Unchanged.
 *   • CONTEXT-FREE — that index cannot constrain NULL `context_id` (SQL treats NULLs as
 *     distinct), so the guarantee comes from the partial index
 *     `ux_process_instances_open_context_free`. PostgREST cannot name a partial index as an
 *     `onConflict` target, so the open journey is looked up first and a lost race is recovered
 *     from the unique violation rather than pretended away.
 *
 * ── D-96: THE GOVERNING REVISION IS PINNED IN THIS INSERT ──
 *
 * This is the sole production creator of an Enrollment journey, so it is the only place the pin has
 * to be applied — Start Enrollment, Create Lead child persistence and the Processing identity ports
 * all inherit it without passing anything. The revision id is resolved BEFORE the insert and rides
 * the same statement; there is deliberately no create-then-patch, because an instance that exists
 * unpinned for even one statement resolves live configuration in that window.
 *
 * When no revision can be resolved the instance is still created — a tenant that has never published
 * an Enrollment configuration has nothing to pin, and refusing to start their journeys would be a
 * far worse failure. It is never SILENT: the result carries `revisionPinOutcome` naming why.
 */
export async function createEnrollmentProcessInstance(
    supabase: SupabaseClient,
    args: Parameters<typeof buildEnrollmentProcessInstanceInsert>[0],
): Promise<{
    id: string | null;
    error?: string;
    reused?: boolean;
    /** D-96. Always reported, so "created unpinned" can never pass unnoticed. */
    revisionPinOutcome?: EnrollmentRevisionPinOutcome;
    businessProcessRevisionId?: string | null;
}> {
    // An explicit id from the caller wins — the certification harness pins deliberately — otherwise
    // the org's currently authoritative published Enrollment revision is resolved here.
    /*
     * The Opportunity this journey came from, if any — distinct from the journey's context.
     * Callers that still anchor to an Opportunity get it from the context, unchanged.
     */
    const acquisitionOpportunityId =
        (args.acquisitionOpportunityId ?? "").trim() ||
        ((args.contextType ?? "").trim() === ENROLLMENT_PARTICIPATION_CONTEXT_TYPE
            ? null
            : ((args.contextId ?? "").trim() || null));

    const pin =
        args.businessProcessRevisionId !== undefined
            ? ({
                  revisionId: (args.businessProcessRevisionId ?? "").trim() || null,
                  departmentId: null,
                  outcome: args.businessProcessRevisionId
                      ? "pinned"
                      : "no_published_enrollment_configuration",
                  selector: "none",
                  candidateDepartmentIds: [],
              } satisfies EnrollmentBusinessProcessRevision)
            : await resolveCurrentEnrollmentBusinessProcessRevision(supabase, args.orgId, {
                  /*
                   * Gate 0B. The journey's own Opportunity selects the department canonically
                   * (Org -> Department -> Work unit -> Record), so a multi-department org pins
                   * correctly instead of refusing. Absent for a context-free start, which then
                   * falls back to "exactly one Enrollment department, or refuse".
                   *
                   * Read from the ACQUISITION, never from `context_id`. Once the journey anchors to
                   * its Enrollment Participation the context id is an OCM id, and passing it here
                   * would look up an Opportunity that cannot exist — silently demoting every
                   * multi-department org to the refusal path, with only a D-96 warning to show for
                   * it.
                   */
                  opportunityId: acquisitionOpportunityId,
              });

    if (pin.outcome !== "pinned") {
        // Observable, not swallowed. A journey running on live configuration is a governance fact
        // an operator may have to explain later, so it is stated at the moment it happens.
        console.warn(
            `[D-96] enrollment process instance created WITHOUT a governing revision pin (org=${args.orgId}, subject=${args.subjectId}, reason=${pin.outcome})`,
        );
    }

    const row = buildEnrollmentProcessInstanceInsert({
        ...args,
        businessProcessRevisionId: pin.revisionId,
    });
    const contextId = (args.contextId ?? "").trim() || null;
    const pinResult = {
        revisionPinOutcome: pin.outcome,
        businessProcessRevisionId: pin.revisionId,
    };

    if (!contextId) {
        const existing = await findOpenContextFreeEnrollmentInstance(supabase, args.orgId, args.subjectId);
        // A reused journey keeps ITS OWN pin. Re-reporting the freshly resolved one would claim a
        // governance fact that is not true of that instance.
        if (existing) return { id: existing, reused: true };

        const { data, error } = await supabase
            .from(PROCESS_INSTANCES_TABLE)
            .insert(row)
            .select("id")
            .maybeSingle();
        if (error) {
            // The partial index did its job against a concurrent writer.
            if (error.code === "23505") {
                const raced = await findOpenContextFreeEnrollmentInstance(
                    supabase,
                    args.orgId,
                    args.subjectId,
                );
                if (raced) return { id: raced, reused: true };
            }
            return { id: null, error: error.message };
        }
        return { id: data ? String((data as { id: string }).id) : null, ...pinResult };
    }

    /*
     * A journey written under the OLDER shape is still this child's journey.
     *
     * Checked before the upsert, because the upsert can only conflict on an identical `context_id`.
     * Without this, converging the anchor would have quietly created a second live journey for every
     * child who already had one — the worst possible failure here, since both would look valid.
     */
    if ((args.contextType ?? "").trim() === ENROLLMENT_PARTICIPATION_CONTEXT_TYPE) {
        const priorShape = await findOpenEnrollmentInstance(supabase, args.orgId, args.subjectId);
        if (priorShape) return { id: priorShape, reused: true };
    }

    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .upsert(row, { onConflict: "org_id,process_key,subject_id,context_id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();
    if (error) return { id: null, error: error.message };
    if (data) return { id: String((data as { id: string }).id), ...pinResult };

    /**
     * `ignoreDuplicates` means a conflict returns NO ROW. That is not a failure — the journey this
     * call asked for already exists — but returning `{ id: null }` made it indistinguishable from
     * one, and every caller treats a null id as "could not start the enrollment process". Pressing
     * Start Enrollment twice therefore produced a red error on a child whose journey was fine, which
     * is exactly what live QA saw.
     *
     * So the existing row is resolved and reported as a REUSE, the same shape the context-free
     * branch above has always returned. The two branches now answer the same question the same way.
     *
     * No pin is reported, deliberately: nothing was created, so the freshly resolved revision does
     * NOT govern this instance. Claiming it would assert a governance fact that is not true of the
     * journey the caller just got back.
     */
    const { data: existingRow, error: existingError } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", args.subjectId)
        .eq("context_id", contextId)
        .maybeSingle();
    if (existingError) return { id: null, error: existingError.message };
    if (existingRow) return { id: String((existingRow as { id: string }).id), reused: true };

    // Conflict reported, yet nothing to reuse. Rather than return a bare null the caller would
    // render as "could not start", say what happened.
    return { id: null, error: "The enrollment journey could not be created or resolved for this child." };
}

/**
 * The child's OPEN context-free enrollment journey, if one exists.
 *
 * "Open" matches the partial index exactly: concluded journeys are excluded so a later
 * re-enrollment episode is legal rather than blocked by the child's own history.
 */
export async function findOpenContextFreeEnrollmentInstance(
    supabase: SupabaseClient,
    orgId: string,
    subjectId: string,
): Promise<string | null> {
    return findOpenEnrollmentInstance(supabase, orgId, subjectId, { contextFreeOnly: true });
}

/**
 * The child's OPEN enrollment journey, under ANY context shape.
 *
 * The bridge that lets the participation anchor land without a flag day. Reuse used to key on the
 * literal `context_id`, so once Start Enrollment began writing a participation id, a journey already
 * running under the older opportunity shape stopped matching — and pressing Start Enrollment on that
 * child would have opened a SECOND live journey for them. The backfill closes the gap in the data;
 * this closes it in the code, so the two are not required to land together.
 *
 * "Open" is the same predicate everywhere: concluded journeys are excluded, so a later episode is
 * still legal. Within an episode a child has one journey, which is the grain the participation
 * already has.
 */
export async function findOpenEnrollmentInstance(
    supabase: SupabaseClient,
    orgId: string,
    subjectId: string,
    opts?: { contextFreeOnly?: boolean },
): Promise<string | null> {
    const base = supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id, state, context_id")
        .eq("org_id", orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", subjectId);
    const { data, error } = await (opts?.contextFreeOnly ? base.is("context_id", null) : base);
    if (error) throw new Error(error.message);
    const open = ((data ?? []) as { id: string; state: string | null }[]).find(
        (r) => !CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((r.state ?? "").trim().toLowerCase()),
    );
    return open ? String(open.id) : null;
}

/**
 * Journey-ending states. Must stay in step with the predicate of
 * `ux_process_instances_open_context_free` — if they drift, the code and the database disagree
 * about what "already running" means and one of them starts losing.
 */
export const CONCLUDED_ENROLLMENT_PROCESS_STATES: readonly string[] = [
    "enrolled",
    "withdrawn",
    "not_enrolling",
];

/** Move a process instance's stage (outcome execution is the only caller). */
export async function moveProcessInstanceStage(
    supabase: SupabaseClient,
    args: { orgId: string; instanceId: string; stageKey: string },
): Promise<{ error?: string }> {
    const nowIso = stageEnteredAtNowIso();
    const { error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update({ stage_key: args.stageKey, stage_entered_at: nowIso, updated_at: nowIso })
        .eq("id", args.instanceId)
        .eq("org_id", args.orgId);
    return error ? { error: error.message } : {};
}

/** Set a process instance's durable state (+ optional close reason). Outcome execution only. */
export async function setProcessInstanceState(
    supabase: SupabaseClient,
    args: { orgId: string; instanceId: string; state: EnrollmentProcessState; closeReasonKey?: string | null },
): Promise<{ error?: string }> {
    const patch: Record<string, unknown> = { state: args.state, updated_at: new Date().toISOString() };
    if (args.closeReasonKey !== undefined) patch.close_reason_key = args.closeReasonKey;
    const { error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update(patch)
        .eq("id", args.instanceId)
        .eq("org_id", args.orgId);
    return error ? { error: error.message } : {};
}

/**
 * Move a child's enrollment instance stage by scope (opportunity + child), not by instance id —
 * the outcome executor knows the lead + child, and this targets exactly that sibling's instance.
 */
export async function moveEnrollmentInstanceStageByScope(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string; stageKey: string },
): Promise<{ moved: number; error?: string }> {
    const nowIso = stageEnteredAtNowIso();
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update({ stage_key: args.stageKey, stage_entered_at: nowIso, updated_at: nowIso })
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .select("id");
    if (error) return { moved: 0, error: error.message };
    return { moved: (data ?? []).length };
}

/** Set a child's enrollment instance durable state (+ close reason) by scope (opportunity + child). */
export async function setEnrollmentInstanceStateByScope(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityId: string;
        customerMemberId: string;
        state: EnrollmentProcessState;
        closeReasonKey?: string | null;
    },
): Promise<{ moved: number; error?: string }> {
    const patch: Record<string, unknown> = { state: args.state, updated_at: new Date().toISOString() };
    if (args.closeReasonKey !== undefined) patch.close_reason_key = args.closeReasonKey;
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update(patch)
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .select("id");
    if (error) return { moved: 0, error: error.message };
    return { moved: (data ?? []).length };
}

/** Resolve a child's enrollment process-instance id by scope (opportunity + child). */
export async function getEnrollmentInstanceIdByScope(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<string | null> {
    const { data } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Read a child's current enrollment instance state by scope (for transition events). */
export async function readEnrollmentInstanceState(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<string | null> {
    const { data } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("state")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .maybeSingle();
    return (data as { state?: string | null } | null)?.state ?? null;
}

/**
 * Read a child's current enrollment instance stage by scope. Captured before a stage move so
 * the Platform Transaction Contract has an inverse to compensate with.
 */
export async function readEnrollmentInstanceStageKey(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<string | null> {
    const { data } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("stage_key")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .maybeSingle();
    return (data as { stage_key?: string | null } | null)?.stage_key ?? null;
}

/** Read enrollment process instances for a lead (Work View / drawer child list). */
export async function listEnrollmentInstancesForLead(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string },
): Promise<ProcessInstanceRow[]> {
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("*")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId);
    if (error) return [];
    return (data ?? []) as ProcessInstanceRow[];
}

export type EnrollmentInstanceReadResult =
    | { ok: true; rows: ProcessInstanceRow[] }
    | { ok: false; error: string };

/**
 * Read outcome for callers that must tell "no children" apart from "could not read".
 *
 * `listEnrollmentInstancesForLead` answers a failed query with `[]`. That is fine for a display
 * surface — an empty list renders as nothing. It is NOT fine for a decision: a guard that blocks
 * closing a family while children are active would read a database failure as "this family has no
 * children" and permit the very close it exists to prevent. Failing open is the one thing such a
 * guard must never do.
 *
 * Display callers keep the lenient function. Anything that DECIDES uses this one.
 */
export async function readEnrollmentInstancesForLead(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string },
): Promise<EnrollmentInstanceReadResult> {
    const opportunityId = args.opportunityId?.trim();
    if (!opportunityId) return { ok: false, error: "opportunity id required" };

    try {
        const { data, error } = await supabase
            .from(PROCESS_INSTANCES_TABLE)
            .select("*")
            .eq("org_id", args.orgId)
            .eq("process_key", ENROLLMENT_PROCESS_KEY)
            .eq("context_id", opportunityId);
        if (error) return { ok: false, error: error.message };
        // `null` data with no error is not "zero rows" — it is a response this code cannot vouch
        // for, and the caller is about to make an irreversible decision with it.
        if (!Array.isArray(data)) {
            return { ok: false, error: "enrollment process instances unreadable" };
        }
        return { ok: true, rows: data as ProcessInstanceRow[] };
    } catch (cause) {
        return { ok: false, error: cause instanceof Error ? cause.message : "enrollment read failed" };
    }
}

/** Read enrollment process instances in a stage (child-grain Work View membership). */
export async function listEnrollmentInstancesForStage(
    supabase: SupabaseClient,
    args: { orgId: string; stageKey: string },
): Promise<ProcessInstanceRow[]> {
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("*")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("stage_key", args.stageKey);
    if (error) return [];
    return (data ?? []) as ProcessInstanceRow[];
}
