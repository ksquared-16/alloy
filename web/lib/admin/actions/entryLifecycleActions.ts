import type { SupabaseClient } from "@supabase/supabase-js";
import {
    assertAllowedStatusKey,
    fetchEffectiveStatusDefinitions,
    resolveConfiguredDefaultCreateStatusKey,
} from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { NEW_LEAD_STATUS_KEY, DEFAULT_LEAD_CASE_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { readCreateLeadCommitSelectionFromPayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import {
    primaryIncludedParent,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";
import { resolveLifecycleCreateLeadBinding } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { resolveCreateLeadEntryDepartmentForOrg } from "@/lib/lifecycle/resolveCreateLeadEntryDepartment";
import { QUALIFICATION_STATUS_KEY } from "@/lib/admin/actions/universalActionConstants";
import type { ExecuteAdminActionCtx } from "@/lib/admin/actions/executeAdminAction";
import {
    ingestCreateLeadThroughProcessing,
    opportunityIdFromAttempt,
} from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import { createExecutorPorts } from "@/lib/pos/processingIdentity/executor/executorPorts";
import {
    commitApprovedLeadForCase,
    loadCaseReview,
    OperatorServiceError,
} from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import { buildCreateLeadReviewPresentation } from "@/lib/pos/processingIdentity/operator/createLeadReviewPresentation";

export type EntryLifecycleActionError = { ok: false; error: string; status: number };

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function asStringList(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x).trim()).filter(Boolean);
}

async function resolveWorkUnitKey(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string | null,
): Promise<string | null> {
    const id = workUnitId?.trim();
    if (!id) return null;
    try {
        const { data, error } = await supabase
            .from("work_units")
            .select("key")
            .eq("id", id)
            .eq("org_id", orgId)
            .maybeSingle();
        if (error) return null;
        const key = (data as { key?: string | null } | null)?.key;
        return typeof key === "string" && key.trim() ? key.trim() : null;
    } catch {
        // Unit-test fakes often stub only the tables Create Lead historically touched.
        return null;
    }
}

export async function resolveOrgDefaultVerticalId(
    supabase: SupabaseClient,
    orgId: string
): Promise<string | null> {
    const { data: row } = await supabase.from("verticals").select("id").eq("org_id", orgId).limit(1).maybeSingle();
    const id = (row as { id?: string } | null)?.id;
    return id?.trim() || null;
}

export type ExecuteCreateLeadInput = {
    merged: Record<string, unknown>;
    context?: {
        department_id?: string | null;
        work_unit_id?: string | null;
        surface?: string;
    };
};

export async function executeCreateLeadAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    input: ExecuteCreateLeadInput
): Promise<
    | {
          ok: true;
          /**
           * Clean-new: Processing authority still ran (case → facts → resolution → plan →
           * approve → execute). Operator already confirmed in BOS; no second Processing UI.
           */
          mode: "committed";
          processing_case_id: string;
          readiness: string;
          idempotency_key: string;
          work_unit_id: string | null;
          work_unit_key: string | null;
          status_key: string;
          stage_key: string;
          opportunity_id: string;
          person_id?: string;
          customer_id?: string;
      }
    | {
          ok: true;
          /** Ambiguous identity — operator must resolve in BOS / Processing review. */
          mode: "processing_review";
          processing_case_id: string;
          readiness: string;
          idempotency_key: string;
          work_unit_id: string | null;
          work_unit_key: string | null;
          status_key: string;
          stage_key: string;
          opportunity_id?: string;
          person_id?: string;
          customer_id?: string;
      }
    | EntryLifecycleActionError
> {
    const firstName = trim(input.merged.first_name);
    const lastName = trim(input.merged.last_name);
    const email = trim(input.merged.email) || null;
    const phone = trim(input.merged.phone) || null;

    if (!firstName) {
        return { ok: false, error: "First name is required.", status: 400 };
    }
    if (!lastName) {
        return { ok: false, error: "Last name is required.", status: 400 };
    }
    // Server minimum: first/last name + email OR phone. Stage-configured requirements
    // (e.g. Location, individual Email+Phone) are enforced client-side via
    // validateCreateLeadFromIntakeSpec before submit — see resolveCreateLeadRequiredFields.
    if (!email && !phone) {
        return { ok: false, error: "Phone or email is required.", status: 400 };
    }

    const verticalId =
        trim(input.merged.vertical_id) || (await resolveOrgDefaultVerticalId(supabase, ctx.orgId)) || null;

    const departmentId = trim(input.context?.department_id) || trim(input.merged.department_id) || null;
    let workUnitId =
        trim(input.context?.work_unit_id) ||
        trim(input.merged.work_unit_id) ||
        null;

    // The default create status is OWNED by the opportunity status configuration (a status_definitions
    // row flagged `metadata.default_on_create`) — Create Lead reads it rather than hardcoding a
    // pipeline key. Falls back to the canonical durable default (`open`); never mints legacy
    // `new_inquiry`. Defensive: a status-config read failure must not block a valid create.
    let configuredDefaultStatus: string | null = null;
    try {
        const oppStatusDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", {
            activeOnly: true,
        });
        configuredDefaultStatus = resolveConfiguredDefaultCreateStatusKey(oppStatusDefs);
    } catch {
        configuredDefaultStatus = null;
    }
    let statusKeyForLead = (configuredDefaultStatus || DEFAULT_LEAD_CASE_STATUS_KEY).trim();

    if (departmentId) {
        const binding = await resolveLifecycleCreateLeadBinding(supabase, ctx.orgId, departmentId);
        if (!workUnitId && binding.work_unit_id) {
            workUnitId = binding.work_unit_id;
        }
        // Operator-configured entry-stage status wins when present (department-level ownership).
        if (binding.status_key?.trim()) {
            statusKeyForLead = binding.status_key.trim();
        }
    }

    // Workspace-level surfaces cannot name a department, and historically sent whichever one
    // sorted first — so a missing binding here does NOT mean "the operator's process is
    // unconfigured". Resolve the entry department from configuration before failing closed;
    // ambiguity is surfaced rather than guessed.
    if (!workUnitId) {
        const entry = await resolveCreateLeadEntryDepartmentForOrg(
            supabase,
            ctx.orgId,
            ctx.accessScope ?? null
        );
        if (entry.state === "ambiguous") {
            return {
                ok: false,
                error: "More than one process can create leads. Choose a process, then create the lead.",
                status: 422,
            };
        }
        if (entry.state === "resolved") {
            workUnitId = entry.workUnitId;
            const binding = await resolveLifecycleCreateLeadBinding(
                supabase,
                ctx.orgId,
                entry.departmentId
            );
            if (binding.status_key?.trim()) {
                statusKeyForLead = binding.status_key.trim();
            }
        }
    }

    // Fail closed: Create Lead must resolve BOTH a create status and an owning work unit from
    // configuration. Never persist an orphaned lead (work_unit_id = NULL) or an empty status — a
    // department/location with no configured process/work unit is a configuration error, not a
    // silent orphan (an orphaned lead is invisible in every work-unit-scoped queue).
    if (!statusKeyForLead || !workUnitId) {
        return {
            ok: false,
            error: "Create Lead is not configured for this process/location.",
            status: 422,
        };
    }
    const workUnitKey = await resolveWorkUnitKey(supabase, ctx.orgId, workUnitId);
    const locationId = trim(input.merged.location_id) || null;

    const householdCommit = readCreateLeadCommitSelectionFromPayload(input.merged);
    const primaryParentRecord = householdCommit ? primaryIncludedParent(householdCommit) : null;
    const linkedPrimaryPersonId = linkedPersonIdFromCommitRecord(primaryParentRecord);
    if (
        primaryParentRecord?.include_in_commit &&
        (primaryParentRecord.resolution?.state === "conflict" || primaryParentRecord.resolution?.action === "reject")
    ) {
        return {
            ok: false,
            error: primaryParentRecord.resolution?.reasons[0] ?? "Primary parent record resolution conflict.",
            status: 400,
        };
    }

    // Never silently create a duplicate when resolver found an exact match but operator did not confirm link.
    if (
        !linkedPrimaryPersonId &&
        primaryParentRecord?.resolution?.confidence === "exact_match" &&
        primaryParentRecord.resolution.action === "review_required"
    ) {
        return {
            ok: false,
            error: "Exact parent match requires linking the existing record before commit.",
            status: 400,
        };
    }

    const ingested = await ingestCreateLeadThroughProcessing(supabase, {
        orgId: ctx.orgId,
        actorId: ctx.userId ?? "unknown",
        merged: input.merged,
        context: input.context,
        workUnitId,
        statusKey: statusKeyForLead,
        locationId,
        verticalId,
    });
    if (!ingested.ok) {
        return { ok: false, error: ingested.error, status: ingested.status };
    }

    const reviewDeps = {
        supabase,
        orgId: ctx.orgId,
        actorId: ctx.userId ?? "unknown",
        actorAuthorized: true,
        executorPorts: createExecutorPorts(supabase),
    };

    // Reuse the review already loaded during ingest — a second loadCaseReview was a clean-new
    // latency tax with no semantic benefit (case has not changed between the two calls).
    // `ingested.caseReview` is optional — the very next branch handles the absent case, so the
    // annotation has to admit undefined. Without it the build-scope typecheck fails.
    let review: Awaited<ReturnType<typeof loadCaseReview>> | undefined = ingested.caseReview;
    if (!review) {
        try {
            review = await loadCaseReview(reviewDeps, ingested.processingCaseId);
        } catch {
            // Fake/incomplete clients in unit tests — keep interactive review rather than fail create.
            return {
                ok: true,
                mode: "processing_review",
                processing_case_id: ingested.processingCaseId,
                readiness: ingested.readiness,
                idempotency_key: ingested.idempotencyKey,
                work_unit_id: workUnitId,
                work_unit_key: workUnitKey,
                status_key: statusKeyForLead,
                stage_key: "lead",
            };
        }
    }

    const presentation = buildCreateLeadReviewPresentation({
        resolutions: review.resolutions,
        subjectEligibility: review.subjectEligibility,
    });

    // Clean-new: BOS Confirm already decided. Keep Processing authority but finish commit here
    // so the case never sits in Incoming as operator work.
    if (presentation.mode === "ready_without_identity_review" && review.planEligible) {
        try {
            const { attempt } = await commitApprovedLeadForCase(reviewDeps, {
                caseId: ingested.processingCaseId,
            });
            const opportunityId = opportunityIdFromAttempt(
                attempt.operations.map((o) => ({
                    commandKey: o.commandKey ?? "",
                    recordId: o.recordId,
                    status: o.status,
                })),
            );
            if (!opportunityId || (attempt.outcome !== "committed" && attempt.outcome !== "partially_committed")) {
                return {
                    ok: false,
                    error: "Lead could not be created after identity check. Try again.",
                    status: 500,
                };
            }
            return {
                ok: true,
                mode: "committed",
                processing_case_id: ingested.processingCaseId,
                readiness: "committed",
                idempotency_key: ingested.idempotencyKey,
                work_unit_id: workUnitId,
                work_unit_key: workUnitKey,
                status_key: statusKeyForLead,
                stage_key: "lead",
                opportunity_id: opportunityId,
            };
        } catch (e) {
            if (e instanceof OperatorServiceError && e.code === "identity_review_required") {
                // Eligibility changed underfoot — fall through to interactive review.
            } else {
                const message = e instanceof Error ? e.message : "Lead could not be created.";
                return { ok: false, error: message, status: 500 };
            }
        }
    }

    return {
        ok: true,
        mode: "processing_review",
        processing_case_id: ingested.processingCaseId,
        readiness: ingested.readiness,
        idempotency_key: ingested.idempotencyKey,
        work_unit_id: workUnitId,
        work_unit_key: workUnitKey,
        status_key: statusKeyForLead,
        stage_key: "lead",
    };
}

export async function assertMoveToQualificationAllowed(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    merged: Record<string, unknown>
): Promise<EntryLifecycleActionError | { ok: true; oldStatusKey: string | null }> {
    const allowedFrom = asStringList(merged.allowed_from_status_keys);
    const fromKeys = allowedFrom.length > 0 ? allowedFrom : [NEW_LEAD_STATUS_KEY];

    const { data: existing } = await supabase
        .from("opportunities")
        .select("status_key, primary_person_id, metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!existing) {
        return { ok: false, error: "Not found", status: 404 };
    }

    const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
    const sk = (oldStatusKey ?? "").trim();
    if (sk && !fromKeys.includes(sk)) {
        return {
            ok: false,
            error: "Move to qualification is only available for new leads.",
            status: 400,
        };
    }

    const personId = trim((existing as { primary_person_id?: string | null }).primary_person_id);
    if (personId) {
        const { data: person } = await supabase
            .from("persons")
            .select("email, phone")
            .eq("id", personId)
            .eq("org_id", orgId)
            .maybeSingle();
        const email = trim((person as { email?: string | null } | null)?.email);
        const phone = trim((person as { phone?: string | null } | null)?.phone);
        if (!email && !phone) {
            return {
                ok: false,
                error: "Parent phone or email is required before moving to qualification.",
                status: 400,
            };
        }
    }

    const chk = await assertAllowedStatusKey(supabase, orgId, "opportunities", QUALIFICATION_STATUS_KEY);
    if (!chk.ok) {
        return { ok: false, error: chk.message, status: 400 };
    }

    return { ok: true, oldStatusKey };
}

export async function validateMarkLostPayload(
    merged: Record<string, unknown>
): Promise<EntryLifecycleActionError | { ok: true; lostReason: string }> {
    const lostReason = trim(merged.lost_reason);
    if (!lostReason) {
        return { ok: false, error: "Lost reason is required.", status: 400 };
    }
    return { ok: true, lostReason };
}

export async function validateOpportunityStatusTransitionForAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    input: {
        actionKey: string;
        entityId: string;
        toStatusKey: string;
        merged: Record<string, unknown>;
        context?: ExecuteCreateLeadInput["context"];
    }
): Promise<
    EntryLifecycleActionError | { ok: true; existing: Record<string, unknown>; oldStatusKey: string | null }
> {
    const { data: existing } = await supabase
        .from("opportunities")
        .select("status_key, customer_id, primary_contact_id, primary_person_id, metadata, work_unit_id")
        .eq("id", input.entityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!existing) {
        return { ok: false, error: "Not found", status: 404 };
    }

    const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
    const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<
        string,
        unknown
    > | null;

    const contextWorkUnitId =
        trim(input.context?.work_unit_id) || trim((existing as { work_unit_id?: string | null }).work_unit_id) || null;
    let contextDepartmentId = trim(input.context?.department_id) || null;
    if (!contextDepartmentId && contextWorkUnitId) {
        const { data: wu } = await supabase
            .from("work_units")
            .select("department_id")
            .eq("id", contextWorkUnitId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        contextDepartmentId = trim((wu as { department_id?: string | null } | null)?.department_id) || null;
    }

    const transition = await validateStatusTransition({
        supabase,
        orgId: ctx.orgId,
        entityType: "opportunities",
        entityId: input.entityId,
        departmentId: contextDepartmentId,
        workUnitId: contextWorkUnitId,
        actionKey: input.actionKey,
        fromStatusKey: oldStatusKey,
        toStatusKey: input.toStatusKey,
        currentMetadata: md,
        payload: input.merged,
    });
    if (!transition.ok) {
        return { ok: false, error: transition.message, status: 400 };
    }

    return { ok: true, existing: existing as Record<string, unknown>, oldStatusKey };
}
