/**
 * Project operating-plan stage work runtime for drawer / layout / queue surfaces.
 *
 * ## D-96 — which configuration governs this projection
 *
 * Almost everything this module produces is TRANSACTION-GOVERNING, not decoration:
 *
 *   - `activeLifecycleProcess(...).is_active` gates whether any stage work exists at all;
 *   - `plan.work_templates` decides WHAT WORK the stage has;
 *   - `plan.journey_segment` reconciled with `stageRecord.grain` decides the execution GRAIN, and a
 *     contradiction between them suppresses the projection entirely;
 *   - `outcomesForTemplate(...)` and `requires_outcome_picker` decide how work COMPLETES;
 *   - `completionPolicyForTemplate(...)` carries min/max attempts;
 *   - `buildStageWorkOutcomeAutomationPreview(...)` states what the outcome will DO;
 *   - `resolvePrimaryWorkIntentForStage(...)` decides which action is offered first.
 *
 * Only `plan.purpose`, `stageRecord.label`, `template.label` and `template.description` are
 * presentation.
 *
 * So when the caller knows the running instance's governing revision it MUST pass it. Reading live
 * `departments.metadata.lifecycle_builder_v1` here while `resolvePublishedStageInputsForCurrentWork`
 * reads the pinned revision would put revision N requirements next to revision N+1 execution
 * behaviour in the same response — one journey, two configurations.
 *
 * Callers with no process instance (batch queue enrichment) pass nothing and keep reading live
 * configuration, exactly as before.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import {
    childParticipationIdentityFromWire,
    namesAChild,
    type ChildParticipationIdentity,
} from "@/lib/lifecycle/childParticipationIdentity";
import { resolveJourneySegment } from "@/lib/lifecycle/grainVocabulary";
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

/**
 * Stage the task was SPAWNED for — from durable provenance, not from fields that stage-move
 * reconciliation may rewrite (`lifecycle_stage_key` / `operating_plan_template_key`).
 *
 * Live bug: Lead `Contact Family` rows were rewritten to `waitlist` + `review_waitlist_position`
 * while provenance still encodes `:lead:contact_family`. Trust spawn provenance for matching.
 */
function spawnStageFromTaskProvenance(md: Record<string, unknown>): string | null {
    const dedupe = trimOrNull(md.dedupe_key);
    if (dedupe) {
        const fromDedupe = dedupe.match(/:stage:([^|:]+)/i);
        if (fromDedupe?.[1]) return fromDedupe[1].trim() || null;
    }
    const provenance = md.provenance;
    if (provenance && typeof provenance === "object" && !Array.isArray(provenance)) {
        const idem = trimOrNull((provenance as Record<string, unknown>).idempotency_key);
        // lifecycle_intent:{orgId}:{opportunityId}:{stageKey}:{templateKey}
        if (idem?.startsWith("lifecycle_intent:")) {
            const parts = idem.split(":");
            if (parts.length >= 5) {
                const stage = parts[parts.length - 2]?.trim();
                if (stage) return stage;
            }
        }
    }
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

    const mdStage = trimOrNull(md.lifecycle_stage_key);
    const work = parseOperationalWorkViewFromTaskRow(taskRowFromDb(row, "", ""));
    const snapshotStage = trimOrNull(work.context_snapshot?.lifecycle_stage_key);
    const spawnStage = spawnStageFromTaskProvenance(md);
    // Prefer spawn provenance over rewritten stage fields after cross-stage reconciliation.
    const stage = spawnStage ?? mdStage ?? snapshotStage;

    // Template-key identity still requires stage alignment when the task declares a stage.
    // Otherwise Lead `contact_family` can bind onto a Waitlist plan that reuses the same key.
    const templateKeyMatches =
        (mdTemplateKey != null && mdTemplateKey === templateKey)
        || (mdWorkIntent != null && mdWorkIntent === templateKey);
    if (templateKeyMatches) {
        // Spawned for a different stage → never bind, even if reconciliation rewrote template_key.
        if (spawnStage && spawnStage !== stageKey) return false;
        if (stage && stage !== stageKey) return false;
        return true;
    }

    const templateDefinitionKey = templateWorkDefinitionKey(template);
    const rowDefinitionKey =
        trimOrNull(work.work_definition_key)
        ?? trimOrNull(md.work_definition_key)
        ?? legacyIntentWorkDefinitionKey(mdWorkIntent);

    if (!templateDefinitionKey || !rowDefinitionKey || rowDefinitionKey !== templateDefinitionKey) {
        return false;
    }

    // Same platform work definition — bind only when stage aligns.
    // Do NOT treat missing stage as a wildcard: Lead `contact_family` tasks without
    // lifecycle_stage_key were painting as Waitlist `review_waitlist_position`.
    if (spawnStage && spawnStage !== stageKey) return false;
    if (stage && stage === stageKey) return true;

    return false;
}

function buildExecutionSubject(
    opportunityId: string,
    journeySegment: "family" | "child",
    childIdentity: ChildParticipationIdentity | null,
): StageOutcomeExecutionSubject {
    const subject: StageOutcomeExecutionSubject = {
        journey_segment: journeySegment,
        opportunity_id: opportunityId,
    };
    if (journeySegment !== "child" || !childIdentity) return subject;

    if (childIdentity.subjectId) subject.customer_member_id = childIdentity.subjectId;
    if (childIdentity.legacyOcmId) subject.opportunity_customer_member_id = childIdentity.legacyOcmId;
    if (childIdentity.participationId) subject.process_instance_id = childIdentity.participationId;
    return subject;
}

/**
 * The child this projection is about — EXPLICIT OR ABSENT.
 *
 * This used to fall back to scraping: if the caller named no child, it walked the family's open tasks
 * and took the first one carrying any child id. That is wrong in the ordinary case, not the exotic
 * one. `attachStageWorkRuntimeToQueueRows` groups tasks BY OPPORTUNITY and passes no explicit
 * identity, so on a family with siblings the scrape picked an arbitrary child and stamped it as the
 * execution subject for every work item in the projection — including items matched to a task
 * belonging to a DIFFERENT sibling. The operator then recorded an outcome against a child they never
 * chose, and every downstream guard passed, because the guards ask "is a child named?" and one was.
 *
 * Which sibling a family-grain surface means is a question that surface cannot answer. The configured
 * mechanism for answering it is the stage's `subject_resolution_strategy` (single_anchor /
 * ask_operator / …), which the scrape bypassed entirely. So the honest projection carries no child,
 * says so via `subject_unresolved`, and the outcome path refuses — which it already does.
 */
function explicitChildIdentityForProjection(explicit: {
    customer_member_id?: string | null;
    opportunity_customer_member_id?: string | null;
    process_instance_id?: string | null;
}): ChildParticipationIdentity | null {
    const identity = childParticipationIdentityFromWire(explicit);
    return namesAChild(identity) ? identity : null;
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
        // Prefer configured template label when the matched task carries a foreign template key
        // (shared work_definition bindings must not rename Waitlist work to Lead titles).
        const taskTemplateKey =
            trimOrNull(md.operating_plan_template_key) ?? trimOrNull(md.work_intent_key);
        const label =
            taskTemplateKey && taskTemplateKey !== template.template_key
                ? template.label
                : (trimOrNull(openRow.title) ?? template.label);
        return {
            template_key: template.template_key,
            label,
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
    /**
     * D-96. The pinned revision's payload. When present it REPLACES `lifecycle_builder_v1` for this
     * projection, so stage execution, grain, outcomes and completion policy all come from the
     * revision that governs the journey rather than from whatever is published right now.
     */
    governingBuilderPayload?: Record<string, unknown> | null;
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

    const liveMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? (params.departmentMetadata as Record<string, unknown>)
            : {};

    // Total substitution, matching `resolvePublishedStageInputsForCurrentWork`. A per-section pin
    // would be the split-brain D-96 forbids: the stage list from one revision and its outcomes from
    // another is a configuration nobody authored.
    const departmentMetadata = params.governingBuilderPayload
        ? { ...liveMetadata, [LIFECYCLE_BUILDER_METADATA_KEY]: params.governingBuilderPayload }
        : liveMetadata;

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

    // The stage's declared grain and the plan's journey segment are two vocabularies for the same
    // thing, declared independently and — until now — never reconciled. A stage configured
    // `grain: "child"` whose plan still said `family` projected family stage work, carrying a family
    // subject; the tenant had changed the grain and not republished the plan.
    const segment = resolveJourneySegment({
        planSegment: plan.journey_segment,
        stageGrain: stageRecord?.grain,
    });
    // A configuration that contradicts itself produces no projection. There is no correct surface to
    // render for it, and picking one of the two declarations would be the silent default again.
    if (!segment.ok) return null;
    const journeySegment = segment.segment;
    const sortedTemplates = sortTemplatesForProjection(
        plan.work_templates,
        primaryIntent?.template_key ?? null,
    );

    const openList = params.openRows ?? [];
    const completedList = params.completedRows ?? [];
    const childIdentity =
        journeySegment === "child"
            ? explicitChildIdentityForProjection({
                  customer_member_id: params.customerMemberId,
                  opportunity_customer_member_id: params.opportunityCustomerMemberId,
                  process_instance_id: params.processInstanceId,
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
            // A child-grain plan whose caller named no child. The subject is truthful — a family case
            // and a grain — but it is not executable, and saying so beats letting a surface offer an
            // action that can only fail at the guard.
            ...(journeySegment === "child" && !childIdentity
                ? { subject_unresolved: "child_identity_required" as const }
                : {}),
        },
    };
}

export async function projectStageWorkRuntime(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    departmentMetadata: unknown;
    /** D-96. See {@link ProjectStageWorkRuntimeSyncInput.governingBuilderPayload}. */
    governingBuilderPayload?: Record<string, unknown> | null;
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
        governingBuilderPayload: params.governingBuilderPayload,
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
