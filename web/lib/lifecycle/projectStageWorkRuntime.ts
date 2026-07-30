/**
 * Project operating-plan stage work runtime for drawer / layout / queue surfaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolvePrimaryWorkIntentForStage } from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { completionPolicySummary } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { resolveWorkDefinitionKeyFromTemplate } from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import {
    type StageOperatingPlanV1,
    type StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { primaryWorkIntentProjectionFromStageWork } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type {
    WorkIntentDueUrgency,
    WorkIntentRuntimeOutcome,
    WorkIntentRuntimeProjection,
    WorkIntentRuntimeState,
} from "@/lib/lifecycle/workIntentRuntimeTypes";

export { primaryWorkIntentProjectionFromStageWork };

type TaskDbRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
    metadata: Record<string, unknown> | null;
    updated_at: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function normalizeProjectionState(state: WorkIntentRuntimeState): WorkIntentRuntimeState {
    return state === "none" ? "planned" : state;
}

function readAttemptCount(metadata: Record<string, unknown>): number {
    const raw = metadata.attempt_count;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        return Math.floor(raw);
    }
    if (typeof raw === "string" && raw.trim()) {
        const parsed = Number.parseInt(raw.trim(), 10);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 0;
}

function readLastOutcome(metadata: Record<string, unknown>): StageWorkItemProjection["last_outcome"] {
    const outcomeKey = trimOrNull(metadata.last_outcome_key);
    if (!outcomeKey) return null;
    return {
        outcome_key: outcomeKey,
        label: trimOrNull(metadata.last_outcome_label) ?? outcomeKey,
        at: trimOrNull(metadata.last_outcome_at),
    };
}

function mapDueUrgency(dueAt: string | null, status: string, now?: Date): WorkIntentDueUrgency {
    if (!dueAt?.trim()) return "none";
    const urgency = operationalTaskDueUrgency({ status, dueAtIso: dueAt, now });
    if (urgency === "overdue") return "overdue";
    if (urgency === "due_soon") return "due_today";
    if (urgency === "open") return "upcoming";
    return "none";
}

function taskRowFromDb(row: TaskDbRow, orgId: string, opportunityId: string): OperationalTaskRow {
    return {
        id: String(row.id),
        org_id: orgId,
        entity_type: "opportunities",
        entity_id: opportunityId,
        assigned_to_user_id: null,
        created_by: "",
        title: trimOrNull(row.title) ?? "Task",
        description: null,
        due_at: String(row.due_at ?? ""),
        status: trimOrNull(row.status) ?? "open",
        source: trimOrNull(row.source) ?? "manual",
        proposal_id: null,
        metadata: row.metadata ?? {},
        created_at: "",
        updated_at: String(row.updated_at ?? ""),
    };
}

function templateWorkDefinitionKey(
    template: Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">,
): string | null {
    const resolved = resolveWorkDefinitionKeyFromTemplate(template);
    if (resolved.ok) return resolved.work_definition_key;
    return trimOrNull(template.work_definition_key);
}

/** Legacy spawn keys that resolve to the same platform work definition as a template. */
function legacyIntentWorkDefinitionKey(workIntentKey: string | null): string | null {
    if (!workIntentKey) return null;
    if (workIntentKey === "make_contact") return "contact_family";
    return null;
}

export function taskMatchesStageWorkTemplate(
    row: TaskDbRow,
    stageKey: string,
    template: Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">,
): boolean {
    const templateKey = template.template_key;
    const md = row.metadata ?? {};
    const mdWorkIntent = trimOrNull(md.work_intent_key);
    const mdTemplateKey = trimOrNull(md.operating_plan_template_key) ?? mdWorkIntent;

    if (mdTemplateKey === templateKey) return true;
    if (mdWorkIntent === templateKey) return true;

    const mdStage = trimOrNull(md.lifecycle_stage_key);
    const work = parseOperationalWorkViewFromTaskRow(taskRowFromDb(row, "", ""));
    const snapshotStage = trimOrNull(work.context_snapshot?.lifecycle_stage_key);
    const stage = mdStage ?? snapshotStage;

    const templateDefinitionKey = templateWorkDefinitionKey(template);
    const rowDefinitionKey =
        trimOrNull(work.work_definition_key)
        ?? trimOrNull(md.work_definition_key)
        ?? legacyIntentWorkDefinitionKey(mdWorkIntent);

    if (!templateDefinitionKey || !rowDefinitionKey || rowDefinitionKey !== templateDefinitionKey) {
        return false;
    }

    // Same platform work definition — bind when stage aligns (or stage is unknown on legacy rows).
    if (!stage || stage === stageKey) return true;
    if (trimOrNull(md.lifecycle_provenance) === "lifecycle_template") return true;

    return false;
}

function buildExecutionSubject(
    opportunityId: string,
    journeySegment: "family" | "child",
    childIdentity?: {
        customer_member_id?: string | null;
        opportunity_customer_member_id?: string | null;
        process_instance_id?: string | null;
    } | null,
): StageOutcomeExecutionSubject {
    const subject: StageOutcomeExecutionSubject = {
        journey_segment: journeySegment,
        opportunity_id: opportunityId,
    };
    if (journeySegment !== "child") return subject;

    const customerMemberId = trimOrNull(childIdentity?.customer_member_id);
    const ocmId = trimOrNull(childIdentity?.opportunity_customer_member_id);
    const processInstanceId = trimOrNull(childIdentity?.process_instance_id);
    if (customerMemberId) subject.customer_member_id = customerMemberId;
    if (ocmId) subject.opportunity_customer_member_id = ocmId;
    if (processInstanceId) subject.process_instance_id = processInstanceId;
    return subject;
}

/** Prefer explicit child identity; else stamp from open BP task metadata (never invent family grain). */
function resolveChildIdentityForProjection(params: {
    explicit?: {
        customer_member_id?: string | null;
        opportunity_customer_member_id?: string | null;
        process_instance_id?: string | null;
    } | null;
    openRows: TaskDbRow[];
}): {
    customer_member_id?: string | null;
    opportunity_customer_member_id?: string | null;
    process_instance_id?: string | null;
} | null {
    const explicitMember = trimOrNull(params.explicit?.customer_member_id);
    const explicitOcm = trimOrNull(params.explicit?.opportunity_customer_member_id);
    const explicitPi = trimOrNull(params.explicit?.process_instance_id);
    if (explicitMember || explicitOcm || explicitPi) {
        return {
            customer_member_id: explicitMember,
            opportunity_customer_member_id: explicitOcm,
            process_instance_id: explicitPi,
        };
    }
    for (const row of params.openRows) {
        const md = row.metadata ?? {};
        const customerMemberId = trimOrNull(md.customer_member_id);
        const ocmId = trimOrNull(md.opportunity_customer_member_id);
        const processInstanceId = trimOrNull(md.process_instance_id);
        if (customerMemberId || ocmId || processInstanceId) {
            return {
                customer_member_id: customerMemberId,
                opportunity_customer_member_id: ocmId,
                process_instance_id: processInstanceId,
            };
        }
    }
    return null;
}

function outcomesForTemplate(
    plan: StageOperatingPlanV1,
    template: StageWorkTemplateV1,
): WorkIntentRuntimeOutcome[] {
    const templateKey = template.template_key;
    const scoped = plan.outcomes
        .filter((o) => {
            const tplKey = o.work_template_key?.trim();
            if (!tplKey) return true;
            return tplKey === templateKey;
        })
        .map((o) => ({
            outcome_key: o.outcome_key,
            label: o.label,
            ...(o.successful === true ? { successful: true } : {}),
        }));
    if (template.outcome_refs !== undefined) {
        const order = template.outcome_refs.map((row) => row.outcome_ref.trim()).filter(Boolean);
        const byKey = new Map(scoped.map((row) => [row.outcome_key, row]));
        const filtered = order
            .map((key) => byKey.get(key))
            .filter((row): row is WorkIntentRuntimeOutcome => row != null);
        return filtered;
    }

    if (scoped.length) return scoped;
    return plan.outcomes.map((o) => ({
        outcome_key: o.outcome_key,
        label: o.label,
        ...(o.successful === true ? { successful: true } : {}),
    }));
}

function completionPolicyForTemplate(template: StageWorkTemplateV1 | null) {
    if (!template?.completion_policy) {
        return {
            summary: null as string | null,
            min_attempts: null as number | null,
            max_attempts: null as number | null,
        };
    }
    return {
        summary: completionPolicySummary(template.completion_policy),
        min_attempts: template.completion_policy.min_attempts ?? null,
        max_attempts: template.completion_policy.max_attempts ?? null,
    };
}

function buildWorkItemProjection(args: {
    template: StageWorkTemplateV1;
    role: "primary" | "secondary";
    stageKey: string;
    plan: StageOperatingPlanV1;
    openRow: TaskDbRow | null;
    completedRow: TaskDbRow | null;
}): StageWorkItemProjection {
    const { template, role, stageKey, plan, openRow, completedRow } = args;
    const policy = completionPolicyForTemplate(template);
    const outcomes = outcomesForTemplate(plan, template);
    const automation = buildStageWorkOutcomeAutomationPreview({
        plan,
        templateKey: template.template_key,
    });

    if (openRow) {
        const md = openRow.metadata ?? {};
        const dueAt = String(openRow.due_at ?? "") || null;
        const status = trimOrNull(openRow.status) ?? "open";
        return {
            template_key: template.template_key,
            label: trimOrNull(openRow.title) ?? template.label,
            description: trimOrNull(template.description),
            role,
            state: "open",
            requires_outcome_picker: outcomes.length > 0,
            work_id: String(openRow.id),
            due_at: dueAt,
            due_urgency: mapDueUrgency(dueAt, status),
            attempt_count: readAttemptCount(md),
            last_outcome: readLastOutcome(md),
            completed_at: null,
            outcomes,
            completion_policy_summary: policy.summary,
            completion_policy_min_attempts: policy.min_attempts,
            completion_policy_max_attempts: policy.max_attempts,
            outcome_automation_preview: automation,
        };
    }

    if (completedRow) {
        const md = completedRow.metadata ?? {};
        return {
            template_key: template.template_key,
            label: trimOrNull(completedRow.title) ?? template.label,
            description: trimOrNull(template.description),
            role,
            state: "completed",
            requires_outcome_picker: false,
            work_id: String(completedRow.id),
            due_at: null,
            due_urgency: "none",
            attempt_count: readAttemptCount(md),
            last_outcome: readLastOutcome(md),
            completed_at: trimOrNull(completedRow.updated_at),
            outcomes: [],
            completion_policy_summary: policy.summary,
            completion_policy_min_attempts: policy.min_attempts,
            completion_policy_max_attempts: policy.max_attempts,
            outcome_automation_preview: automation,
        };
    }

    return {
        template_key: template.template_key,
        label: template.label,
        description: trimOrNull(template.description),
        role,
        state: "planned",
        requires_outcome_picker: false,
        work_id: null,
        due_at: null,
        due_urgency: "none",
        attempt_count: 0,
        last_outcome: null,
        completed_at: null,
        outcomes,
        completion_policy_summary: policy.summary,
        completion_policy_min_attempts: policy.min_attempts,
        completion_policy_max_attempts: policy.max_attempts,
        outcome_automation_preview: automation,
    };
}

function sortTemplatesForProjection(
    templates: StageWorkTemplateV1[],
    primaryTemplateKey: string | null,
): StageWorkTemplateV1[] {
    const primaryIdx = templates.findIndex(
        (t) => t.primary || (primaryTemplateKey && t.template_key === primaryTemplateKey),
    );
    if (primaryIdx <= 0) return [...templates];
    const copy = [...templates];
    const [primary] = copy.splice(primaryIdx, 1);
    return [primary!, ...copy];
}

export type ProjectStageWorkRuntimeSyncInput = {
    orgId: string;
    opportunityId: string;
    departmentId: string;
    departmentMetadata: unknown;
    builderStageKey: string | null;
    stageLabel?: string | null;
    openRows?: TaskDbRow[];
    completedRows?: TaskDbRow[];
    /** Child-grain Current Work — required for child journey outcomes; never inferred as family. */
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    processInstanceId?: string | null;
};

/** Synchronous projection from preloaded tasks — used by drawer and batch queue enrichment. */
export function projectStageWorkRuntimeSync(
    params: ProjectStageWorkRuntimeSyncInput,
): StageWorkRuntimeProjection | null {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? (params.departmentMetadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process?.is_active) return null;

    const { plan, stageRecord } = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey: stageKey,
    });
    const primaryIntent = resolvePrimaryWorkIntentForStage(stageKey, plan);
    if (!plan?.work_templates.length) return null;

    const departmentId = trimOrNull(params.departmentId);
    if (!departmentId) return null;

    const journeySegment = plan.journey_segment ?? "family";
    const sortedTemplates = sortTemplatesForProjection(
        plan.work_templates,
        primaryIntent?.template_key ?? null,
    );

    const openList = params.openRows ?? [];
    const completedList = params.completedRows ?? [];
    const childIdentity =
        journeySegment === "child"
            ? resolveChildIdentityForProjection({
                  explicit: {
                      customer_member_id: params.customerMemberId,
                      opportunity_customer_member_id: params.opportunityCustomerMemberId,
                      process_instance_id: params.processInstanceId,
                  },
                  openRows: openList,
              })
            : null;

    const items: StageWorkItemProjection[] = sortedTemplates.map((template, index) => {
        const openRow =
            openList.find((row) => taskMatchesStageWorkTemplate(row, stageKey, template)) ?? null;
        const completedRow =
            !openRow
                ? completedList.find((row) => taskMatchesStageWorkTemplate(row, stageKey, template)) ?? null
                : null;
        return buildWorkItemProjection({
            template,
            role: index === 0 ? "primary" : "secondary",
            stageKey,
            plan,
            openRow,
            completedRow,
        });
    });

    const primary = items[0] ?? null;
    const additional = items.slice(1);

    const requiresOutcomePicker =
        items.some((item) => item.state === "open" && item.requires_outcome_picker);

    return {
        stage_key: stageKey,
        stage_label: trimOrNull(params.stageLabel) ?? trimOrNull(stageRecord?.label) ?? stageKey,
        purpose: trimOrNull(plan.purpose),
        journey_segment: journeySegment,
        template_keys: sortedTemplates.map((t) => t.template_key),
        primary,
        additional,
        execution: {
            department_id: departmentId,
            requires_outcome_picker: requiresOutcomePicker,
            subject: buildExecutionSubject(params.opportunityId, journeySegment, childIdentity),
        },
    };
}

export async function projectStageWorkRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    departmentMetadata: unknown;
    builderStageKey: string | null;
    stageLabel?: string | null;
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    processInstanceId?: string | null;
}): Promise<StageWorkRuntimeProjection | null> {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    let departmentId = trimOrNull(params.departmentId);
    if (!departmentId) {
        departmentId = await resolveEnrollmentDepartmentForOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: params.opportunityId,
        });
    }
    if (!departmentId) return null;

    // The open + completed task reads are INDEPENDENT — run them concurrently (was serial). Same two
    // queries, same bounded semantics (24 each, distinct orders); only the ~1 round-trip of serial
    // latency is removed from the commit-critical compose path.
    const [openResult, completedResult] = await Promise.all([
        params.supabase
            .from("operational_tasks")
            .select("id, title, due_at, status, source, metadata, updated_at")
            .eq("org_id", params.orgId)
            .eq("entity_type", "opportunities")
            .eq("entity_id", params.opportunityId)
            .eq("status", "open")
            .order("due_at", { ascending: true })
            .limit(24),
        params.supabase
            .from("operational_tasks")
            .select("id, title, due_at, status, source, metadata, updated_at")
            .eq("org_id", params.orgId)
            .eq("entity_type", "opportunities")
            .eq("entity_id", params.opportunityId)
            .eq("status", "completed")
            .order("updated_at", { ascending: false })
            .limit(24),
    ]);
    const { data: openRows, error: openErr } = openResult;
    if (openErr) return null;
    const { data: completedRows, error: completedErr } = completedResult;
    if (completedErr) return null;

    return projectStageWorkRuntimeSync({
        orgId: params.orgId,
        opportunityId: params.opportunityId,
        departmentId,
        departmentMetadata: params.departmentMetadata,
        builderStageKey: stageKey,
        stageLabel: params.stageLabel,
        openRows: (openRows ?? []) as TaskDbRow[],
        completedRows: (completedRows ?? []) as TaskDbRow[],
        customerMemberId: params.customerMemberId,
        opportunityCustomerMemberId: params.opportunityCustomerMemberId,
        processInstanceId: params.processInstanceId,
    });
}

/** @deprecated Prefer projectStageWorkRuntime — returns primary work item only. */
export async function projectWorkIntentRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    departmentMetadata: unknown;
    builderStageKey: string | null;
}): Promise<WorkIntentRuntimeProjection | null> {
    const runtime = await projectStageWorkRuntime(params);
    const projection = primaryWorkIntentProjectionFromStageWork(runtime);
    if (!projection) return null;
    return { ...projection, state: normalizeProjectionState(projection.state) };
}
