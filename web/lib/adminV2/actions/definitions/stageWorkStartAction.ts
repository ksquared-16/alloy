/**
 * Registered action: `stage_work.start` — begin a piece of work the current stage already configures.
 *
 * ── WHY THIS EXISTS ──
 *
 * A stage's operating plan can declare several work templates. Entry opens the effective PRIMARY one
 * and nothing else, deliberately: Waitlist entry opens `review_waitlist_position`, and `offer_spot`
 * is not something that should happen to a child because a date passed. Offering a place is a
 * decision somebody makes.
 *
 * That left `offer_spot` fully configured — its own work definition, its own outcomes — and
 * unreachable, because no action started it. Checked on the cert tenant: the Waitlist stage's action
 * list carried nothing offer-shaped, the drawer menus carried none, and no route instantiated an
 * arbitrary template. The offer flow read as working right up until someone looked for the control.
 *
 * ── WHY IT IS GENERIC, NOT AN `offer_spot` BUTTON ──
 *
 * The durable intent here is "start the work this stage says I may start", and the template is an
 * INPUT. An `offer_spot`-specific action would put a template key into platform code, and the next
 * stage that needs a second startable template would need a second action. Configuration already
 * names the templates; this only lets an operator reach one.
 *
 * This is why the Process card needs no branch of its own. The action resolves because a capability
 * exists, the stage makes it eligible, and a placement exposes it — never because a card checked
 * whether the stage is Waitlist.
 *
 * ── WHAT IT REFUSES ──
 *
 * Starting work and recording its outcome are separate operator acts, so this does exactly one
 * thing. It does not move the child's stage, does not touch their disposition, does not write
 * placement status, and does not record an outcome. A child is offered a place by an operator
 * choosing Offer spot and then answering what happened — two decisions, two acts.
 *
 * Every refusal is checked against configuration rather than against a list kept here:
 *
 *   - the subject must be a child with a resolvable enrollment track;
 *   - the child's OWN effective stage must be the stage the work belongs to — a child who has left
 *     Waitlist cannot be offered a Waitlist spot;
 *   - the template must be declared on that stage's operating plan;
 *   - the stage must be child-grain, so a family-grain template cannot be started against a child.
 *
 * Repeating it is safe: `instantiateStageWorkFromTemplate` dedupes on the work's semantic identity
 * and returns the open row, so a second click hands back the work already in progress.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";
import { piEffectiveStageKey } from "@/lib/queues/enrollmentEffectiveStageMembership";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export const STAGE_WORK_START_ACTION_KEY = "stage_work.start";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export type StageWorkStartResolution =
    | {
          ok: true;
          customerMemberId: string;
          opportunityId: string;
          departmentId: string;
          stageKey: string;
          templateKey: string;
          template: StageWorkTemplateV1;
          departmentMetadata: Record<string, unknown>;
      }
    | { ok: false; code: string; message: string };

/**
 * Everything the start needs, resolved from the child and from configuration.
 *
 * Exported because eligibility and execution must agree exactly: a button that appears and then
 * refuses is worse than one that never appeared, so both call this and neither keeps its own copy of
 * the rules.
 */
export async function resolveStageWorkStart(params: {
    supabase: SupabaseClient;
    orgId: string;
    customerMemberId: string;
    templateKey: string;
}): Promise<StageWorkStartResolution> {
    const customerMemberId = t(params.customerMemberId);
    const templateKey = t(params.templateKey);
    if (!customerMemberId) {
        return { ok: false, code: "missing_child", message: "Select the child to start this work for." };
    }
    if (!templateKey) {
        return { ok: false, code: "missing_template", message: "Name the configured work to start." };
    }

    /*
     * The child's OWN track. Read directly rather than through the opportunity, because the whole
     * point is that the child's position is not the family's — and the acquisition opportunity is
     * carried on the instance, so one read answers both questions.
     */
    const { data: piData, error: piErr } = await params.supabase
        .from("process_instances")
        .select("id, stage_key, context_id, context_type, state")
        .eq("org_id", params.orgId)
        .eq("process_key", "enrollment")
        .eq("subject_id", customerMemberId);
    if (piErr) {
        return { ok: false, code: "track_lookup_failed", message: piErr.message };
    }
    const piRows = (piData ?? []) as Array<{
        id: string;
        stage_key: string | null;
        context_id: string | null;
        context_type: string | null;
        state: string | null;
    }>;
    if (!piRows.length) {
        return {
            ok: false,
            code: "no_enrollment_track",
            message: "This child has not entered the enrollment process yet, so there is no stage work to start.",
        };
    }
    if (piRows.length > 1) {
        return {
            ok: false,
            code: "ambiguous_enrollment_track",
            message: "This child has more than one enrollment journey. Resolve the duplicate first.",
        };
    }
    const instance = piRows[0]!;

    const opportunityId = await resolveOpportunityForInstance(params.supabase, params.orgId, instance);
    if (!opportunityId) {
        return {
            ok: false,
            code: "no_opportunity",
            message: "This child's enrollment is not attached to a case, so stage work has nowhere to live.",
        };
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: params.supabase,
        orgId: params.orgId,
        opportunityId,
    });
    if (!departmentId) {
        return { ok: false, code: "no_department", message: "No enrollment department is configured for this case." };
    }

    const { data: deptRow } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const departmentMetadata =
        deptRow?.metadata != null && typeof deptRow.metadata === "object" && !Array.isArray(deptRow.metadata)
            ? (deptRow.metadata as Record<string, unknown>)
            : {};

    /*
     * EFFECTIVE stage, not the raw column — a child riding the family track has no stage of their
     * own, and the canonical rule already says what that means. Same resolver the queue lanes use.
     */
    const { data: oppRow } = await params.supabase
        .from("opportunities")
        .select("stage_key")
        .eq("id", opportunityId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const stageKey = piEffectiveStageKey(
        instance.stage_key,
        (oppRow as { stage_key?: string | null } | null)?.stage_key ?? null,
    );
    if (!stageKey) {
        return {
            ok: false,
            code: "no_stage",
            message: "This child is not standing in a configured stage, so there is no stage work to start.",
        };
    }

    const { plan } = resolveEffectiveStageOperatingPlan({ departmentMetadata, builderStageKey: stageKey });
    const template = plan?.work_templates?.find((w) => t(w.template_key) === templateKey) ?? null;
    if (!template) {
        return {
            ok: false,
            code: "template_not_configured_on_stage",
            message: `"${templateKey}" is not configured on this child's current stage, so it cannot be started here.`,
        };
    }

    /*
     * GRAIN. A family-grain template started against a child would open the family's work under the
     * child's name — the same wrong-subject substitution the stage-authority work removed from
     * presentation. The stage's declared grain decides, not this module.
     */
    const grain = resolveStageGrain({
        stageKey,
        operatingPlanJourneySegment: plan?.journey_segment,
    });
    if (grain.ok && grain.grain !== "child") {
        return {
            ok: false,
            code: "stage_is_not_child_grain",
            message: "This stage's work belongs to the family, so it cannot be started for one child.",
        };
    }

    return {
        ok: true,
        customerMemberId,
        opportunityId,
        departmentId,
        stageKey,
        templateKey,
        template,
        departmentMetadata,
    };
}

/**
 * The case behind a journey, under either anchor shape.
 *
 * There is no `acquisition_opportunity_id` COLUMN — the acquisition id is an input that selects the
 * department pin at creation, and the durable anchor is `context_id` + `context_type`. Reading a
 * column that does not exist is how the first live invocation failed, loudly and correctly.
 */
async function resolveOpportunityForInstance(
    supabase: SupabaseClient,
    orgId: string,
    instance: { context_id: string | null; context_type: string | null },
): Promise<string | null> {
    const contextId = t(instance.context_id);
    if (!contextId) return null;
    // Participation-anchored: the context is an OCM id, and the case is on that row.
    if (t(instance.context_type) === "enrollment_participation") {
        const { data } = await supabase
            .from("opportunity_customer_members")
            .select("opportunity_id")
            .eq("id", contextId)
            .eq("org_id", orgId)
            .maybeSingle();
        return t((data as { opportunity_id?: string | null } | null)?.opportunity_id) || null;
    }
    // Older shape: the context IS the opportunity.
    return contextId;
}

const CHILD_SUBJECT = {
    supportedEntityTypes: ["child"] as const,
    supportedProcessKeys: ["enrollment"] as const,
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
};

export const stageWorkStartAction: RegisteredAction = {
    actionKey: STAGE_WORK_START_ACTION_KEY,
    defaultLabel: "Start stage work",
    description:
        "Start a piece of work this child's current stage already configures. Starts the work only — it records no outcome and moves no stage.",
    ...CHILD_SUBJECT,
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const templateKey = t(payload?.template_key);
        if (!templateKey) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "missing_template",
                        message: "Name the configured work to start.",
                        field: "template_key",
                    },
                ],
            };
        }
        return { ok: true, value: { ...(payload ?? {}), template_key: templateKey } };
    },

    async resolveEligibility({ supabase, ctx, invocation, payload }) {
        const resolution = await resolveStageWorkStart({
            supabase,
            orgId: ctx.orgId,
            customerMemberId: t(invocation.entityId),
            templateKey: t(payload?.template_key),
        });
        if (!resolution.ok) {
            return {
                eligible: false,
                blockers: [{ code: resolution.code, message: resolution.message }],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ supabase, ctx, invocation, payload }) {
        const resolution = await resolveStageWorkStart({
            supabase,
            orgId: ctx.orgId,
            customerMemberId: t(invocation.entityId),
            templateKey: t(payload?.template_key),
        });
        if (!resolution.ok) {
            return { summary: resolution.message, changes: [] };
        }
        const label = t(resolution.template.label) || resolution.templateKey;
        return {
            summary: `Start "${label}" for this child at ${resolution.stageKey}.`,
            changes: [
                `Open ${label} as this child's current work`,
                "Record no outcome — that stays a separate decision",
                "Move no stage and change no enrollment status",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const resolution = await resolveStageWorkStart({
            supabase,
            orgId: ctx.orgId,
            customerMemberId: t(invocation.entityId),
            templateKey: t(payload?.template_key),
        });
        if (!resolution.ok) {
            return {
                ok: false,
                correlationId,
                status: 409,
                error: resolution.message,
                blockers: [{ code: resolution.code, message: resolution.message }],
            };
        }

        const result = await instantiateStageWorkFromTemplate({
            supabase,
            orgId: ctx.orgId,
            userId: ctx.userId ?? "",
            opportunityId: resolution.opportunityId,
            stageKey: resolution.stageKey,
            departmentId: resolution.departmentId,
            template: resolution.template,
            departmentMetadata: resolution.departmentMetadata,
        });

        if (result.status === "rejected") {
            return {
                ok: false,
                correlationId,
                status: 409,
                error: result.error,
                blockers: [{ code: "stage_work_not_started", message: result.error }],
            };
        }

        return {
            ok: true,
            correlationId,
            result: {
                actionKey: STAGE_WORK_START_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: resolution.customerMemberId,
                affectedId: result.work_id,
                detail: {
                    work_id: result.work_id,
                    // `deduped` is a success: the work the operator asked for is open, and it is the
                    // one already in progress rather than a second copy of it.
                    started: result.status === "created",
                    reused_existing: result.status === "deduped",
                    template_key: resolution.templateKey,
                    stage_key: resolution.stageKey,
                    customer_member_id: resolution.customerMemberId,
                    opportunity_id: resolution.opportunityId,
                },
            },
        };
    },
};
