/**
 * Workflow metadata.scope — department / work-unit association without FK columns (V1).
 */

export type WorkflowScopeMetadataV1 = {
    department_id?: string;
    work_unit_id?: string;
};

export type WorkflowAssistDraftActionScaffoldV1 = {
    action_order: number;
    action_type: string;
    target_entity?: string | null;
    payload: Record<string, unknown>;
    /** When true, row is Assist placeholder only — review before enabling workflow. */
    assist_scaffold?: boolean;
};

export type WorkflowAssistWorkflowMetadataV1 = {
    scope?: WorkflowScopeMetadataV1;
    workflow_assist?: {
        source?: string;
        template_id?: string;
        draft_actions?: WorkflowAssistDraftActionScaffoldV1[];
        /** Advisory enrichment snapshot for Explain / operational trace (not workflow execution truth). */
        enrichment_v1?: {
            generated_at_iso: string;
            enrichment_source: string;
            message_provenance: string;
            normalized_event_type: string;
            normalized_channel: string | null;
            advisory_only: true;
        };
        message_preview?: {
            body: string;
            provenance: string;
            needs_review: boolean;
        };
    };
};

export type WorkflowScopeTierV1 = "work_unit" | "department" | "org_wide" | "heuristic";

export type WorkflowWithScopeRow = {
    id: string;
    name: string | null;
    event_type: string | null;
    entity_type: string | null;
    enabled: boolean | null;
    steps_count: number;
    metadata?: Record<string, unknown> | null;
    last_run?: {
        id?: string;
        status: string;
        started_at: string;
        has_failed_action?: boolean;
    } | null;
};

export type WorkflowScopePartitionV1 = {
    scoped_work_unit: WorkflowWithScopeRow[];
    scoped_department: WorkflowWithScopeRow[];
    org_wide: WorkflowWithScopeRow[];
    /** Legacy rows without metadata.scope — enrollment-adjacent heuristic only. */
    heuristic: WorkflowWithScopeRow[];
    uses_heuristic_fallback: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidString(v: string): boolean {
    return UUID_RE.test(String(v).trim());
}

export function parseWorkflowScopeFromMetadata(metadata: unknown): WorkflowScopeMetadataV1 | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const scope = (metadata as Record<string, unknown>).scope;
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) return null;
    const s = scope as Record<string, unknown>;
    const department_id = typeof s.department_id === "string" && isUuidString(s.department_id) ? s.department_id : undefined;
    const work_unit_id = typeof s.work_unit_id === "string" && isUuidString(s.work_unit_id) ? s.work_unit_id : undefined;
    if (!department_id && !work_unit_id) return null;
    return { ...(department_id ? { department_id } : {}), ...(work_unit_id ? { work_unit_id } : {}) };
}

export function buildWorkflowMetadataWithScope(input: {
    scope?: WorkflowScopeMetadataV1 | null;
    workflow_assist?: WorkflowAssistWorkflowMetadataV1["workflow_assist"];
}): Record<string, unknown> {
    const meta: WorkflowAssistWorkflowMetadataV1 = {};
    if (input.scope && (input.scope.department_id || input.scope.work_unit_id)) {
        meta.scope = {
            ...(input.scope.department_id ? { department_id: input.scope.department_id } : {}),
            ...(input.scope.work_unit_id ? { work_unit_id: input.scope.work_unit_id } : {}),
        };
    }
    if (input.workflow_assist) meta.workflow_assist = input.workflow_assist;
    return meta as Record<string, unknown>;
}

export function classifyWorkflowScopeTier(
    metadata: unknown,
    context: { department_id?: string | null; work_unit_id?: string | null }
): WorkflowScopeTierV1 {
    const scope = parseWorkflowScopeFromMetadata(metadata);
    const deptCtx = context.department_id?.trim() || null;
    const wuCtx = context.work_unit_id?.trim() || null;

    if (!scope) return "heuristic";

    if (wuCtx && scope.work_unit_id === wuCtx) return "work_unit";

    if (deptCtx && scope.department_id === deptCtx) {
        if (!wuCtx) return "department";
        if (!scope.work_unit_id || scope.work_unit_id === wuCtx) return "department";
    }

    if (!deptCtx && !wuCtx && (scope.department_id || scope.work_unit_id)) return "org_wide";

    if (scope.department_id || scope.work_unit_id) return "org_wide";

    return "heuristic";
}

const ENROLLMENT_ENTITY_TYPES = new Set(["opportunity", "opportunities", "tour_bookings"]);

function isEnrollmentAdjacentEntity(entity_type: string | null): boolean {
    const et = (entity_type ?? "").trim().toLowerCase();
    return !et || ENROLLMENT_ENTITY_TYPES.has(et);
}

export function partitionWorkflowsByWorkspaceScope(
    rows: WorkflowWithScopeRow[],
    context: { department_id?: string | null; work_unit_id?: string | null }
): WorkflowScopePartitionV1 {
    const scoped_work_unit: WorkflowWithScopeRow[] = [];
    const scoped_department: WorkflowWithScopeRow[] = [];
    const org_wide: WorkflowWithScopeRow[] = [];
    const heuristic: WorkflowWithScopeRow[] = [];

    for (const row of rows) {
        const scope = parseWorkflowScopeFromMetadata(row.metadata);
        if (!scope) {
            if (row.metadata == null) {
                if (isEnrollmentAdjacentEntity(row.entity_type)) heuristic.push(row);
                else org_wide.push(row);
            } else {
                org_wide.push(row);
            }
            continue;
        }
        const tier = classifyWorkflowScopeTier(row.metadata, context);
        switch (tier) {
            case "work_unit":
                scoped_work_unit.push(row);
                break;
            case "department":
                scoped_department.push(row);
                break;
            case "org_wide":
            default:
                org_wide.push(row);
                break;
        }
    }

    const hasScoped = scoped_work_unit.length > 0 || scoped_department.length > 0;
    const uses_heuristic_fallback = !hasScoped && heuristic.length > 0;

    return {
        scoped_work_unit,
        scoped_department,
        org_wide,
        heuristic,
        uses_heuristic_fallback,
    };
}

export type WorkflowAssistScopeDisplayV1 = {
    tier: WorkflowScopeTierV1;
    label: string;
    department_id: string | null;
    work_unit_id: string | null;
};

export function buildWorkflowAssistScopeDisplay(input: {
    scope?: WorkflowScopeMetadataV1 | null;
    labels?: { department_name?: string | null; work_unit_name?: string | null };
}): WorkflowAssistScopeDisplayV1 {
    const scope = input.scope;
    if (scope?.work_unit_id) {
        const wu = input.labels?.work_unit_name?.trim();
        const dept = input.labels?.department_name?.trim();
        const label =
            wu && dept ? `Work unit: ${wu} (${dept})`
            : wu ? `Work unit: ${wu}`
            : "Work unit (scoped)";
        return {
            tier: "work_unit",
            label,
            department_id: scope.department_id ?? null,
            work_unit_id: scope.work_unit_id,
        };
    }
    if (scope?.department_id) {
        const dept = input.labels?.department_name?.trim();
        return {
            tier: "department",
            label: dept ? `Department: ${dept}` : "Department (scoped)",
            department_id: scope.department_id,
            work_unit_id: null,
        };
    }
    return {
        tier: "org_wide",
        label: "Org-wide",
        department_id: null,
        work_unit_id: null,
    };
}

/** Tour reminder — safe log scaffold + metadata draft_actions for intended message step. */
export function buildTourReminderActionScaffolds(leadDays: number): WorkflowAssistDraftActionScaffoldV1[] {
    const intended_message = {
        action_type: "create_message",
        channel: "sms",
        review_required: true,
        assist_scaffold: true,
        note: "Replace with approved family reminder copy before enabling workflow.",
    };
    return [
        {
            action_order: 1,
            action_type: "log",
            target_entity: null,
            assist_scaffold: true,
            payload: {
                message:
                    `Assist scaffold (~${leadDays}d before tour): review reminder message content before enabling. Opportunity {{ opportunity.id }}.`,
                assist_scaffold: true,
                scaffold_kind: "tour_reminder",
                lead_days_before_tour: leadDays,
                intended_action: intended_message,
            },
        },
    ];
}
