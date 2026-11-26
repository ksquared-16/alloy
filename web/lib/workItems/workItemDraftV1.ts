/**
 * Work Items V3 — canonical draft model (WorkItemDraftV1).
 * Single draft type for all creation entry points; in-memory in Slice 2.
 */

export type WorkItemEntryPoint =
    | "work_items_create"
    | "bos_rail"
    | "record_bos"
    | "command_palette"
    | "bp_assist"
    | "module_integration";

export type WorkItemDraftStatus =
    | "draft"
    | "needs_clarification"
    | "ready"
    | "committed"
    | "cancelled";

export type WorkItemDraftPriority = "low" | "medium" | "high";

export type WorkItemDraftEntity = {
    type: string;
    id: string;
    label?: string;
};

export type WorkItemDraftLinkMode = "general" | "linked";

export type ChecklistItemDraftV1 = {
    id: string;
    label: string;
    completed?: boolean;
};

export type RecurrenceDraftV1 = {
    enabled: boolean;
    rrule?: string;
    placeholder?: boolean;
};

export type FollowOnRuleV1 = {
    id: string;
    title: string;
    due_at?: string;
    relative_to_primary?: "after_due" | "after_complete";
};

export type DuePolicyV1 = {
    kind: "fixed" | "relative";
    label?: string;
};

export type ValidationIssueV1 = {
    code:
        | "missing_title"
        | "missing_due"
        | "missing_assignee"
        | "ambiguous_record"
        | "ambiguous_date"
        | "missing_entity"
        | "invalid_follow_on";
    message: string;
    severity: "block" | "warn";
    field?: string;
};

export type WorkItemDraftProvenanceV1 = {
    entry_point: WorkItemEntryPoint;
    bos_turn_id?: string;
    proposal_id?: string;
    seeded_entity?: boolean;
};

export type WorkItemDraftV1 = {
    draft_id: string;
    schema_version: "1";
    status: WorkItemDraftStatus;
    intent_text: string;
    title: string;
    description?: string;
    due_at?: string;
    due_policy?: DuePolicyV1;
    assigned_to_user_id?: string;
    link_mode: WorkItemDraftLinkMode;
    entity?: WorkItemDraftEntity;
    business_process?: { department_id: string; label?: string };
    stage_key?: string;
    work_definition_key?: string;
    category?: string;
    priority?: WorkItemDraftPriority;
    tags?: string[];
    waiting_on?: { kind: string; label: string };
    checklist_items?: ChecklistItemDraftV1[];
    recurrence?: RecurrenceDraftV1;
    follow_on?: FollowOnRuleV1[];
    provenance: WorkItemDraftProvenanceV1;
    bos_explanations?: string[];
    validation_errors?: ValidationIssueV1[];
};

export type WorkItemDraftSeed = {
    entry_point?: WorkItemEntryPoint;
    intent_text?: string;
    title?: string;
    description?: string;
    due_at?: string;
    assigned_to_user_id?: string | null;
    entity?: WorkItemDraftEntity | null;
    category?: string;
    priority?: WorkItemDraftPriority;
    tags?: string[];
};

export type WorkItemDraftPatch = Partial<
    Pick<
        WorkItemDraftV1,
        | "title"
        | "description"
        | "due_at"
        | "due_policy"
        | "link_mode"
        | "business_process"
        | "stage_key"
        | "work_definition_key"
        | "category"
        | "priority"
        | "tags"
        | "waiting_on"
        | "checklist_items"
        | "recurrence"
        | "follow_on"
        | "bos_explanations"
        | "status"
    >
> & {
    entity?: WorkItemDraftEntity | null;
    assigned_to_user_id?: string | null;
};

let draftIdCounter = 0;

export function createWorkItemDraftId(): string {
    draftIdCounter += 1;
    return `wi-draft-${Date.now()}-${draftIdCounter}`;
}

export function createWorkItemDraft(params: {
    seed?: WorkItemDraftSeed;
    defaultAssigneeUserId?: string | null;
}): WorkItemDraftV1 {
    const seed = params.seed ?? {};
    const entity = seed.entity ?? undefined;
    const linkMode: WorkItemDraftLinkMode = entity?.id ? "linked" : "general";
    const intentText = seed.intent_text?.trim() ?? "";

    return {
        draft_id: createWorkItemDraftId(),
        schema_version: "1",
        status: "draft",
        intent_text: intentText,
        title: seed.title?.trim() ?? "",
        description: seed.description?.trim() || undefined,
        due_at: seed.due_at,
        assigned_to_user_id: seed.assigned_to_user_id?.trim() || params.defaultAssigneeUserId?.trim() || undefined,
        link_mode: linkMode,
        entity: entity ?? undefined,
        category: seed.category,
        priority: seed.priority ?? "medium",
        tags: seed.tags ?? [],
        recurrence: { enabled: false, placeholder: true },
        follow_on: [],
        provenance: {
            entry_point: seed.entry_point ?? "work_items_create",
            seeded_entity: Boolean(entity?.id),
        },
        bos_explanations: [],
    };
}

export function mutateWorkItemDraft(draft: WorkItemDraftV1, patch: WorkItemDraftPatch): WorkItemDraftV1 {
    if (draft.status === "committed" || draft.status === "cancelled") {
        return draft;
    }

    const next: WorkItemDraftV1 = { ...draft };

    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.description !== undefined) next.description = patch.description.trim() || undefined;
    if (patch.due_at !== undefined) next.due_at = patch.due_at || undefined;
    if (patch.due_policy !== undefined) next.due_policy = patch.due_policy;
    if (patch.assigned_to_user_id !== undefined) {
        next.assigned_to_user_id = patch.assigned_to_user_id?.trim() || undefined;
    }
    if (patch.link_mode !== undefined) next.link_mode = patch.link_mode;
    if (patch.entity !== undefined) {
        next.entity = patch.entity ?? undefined;
        if (patch.entity?.id) next.link_mode = "linked";
        if (patch.entity === null) {
            next.entity = undefined;
            next.link_mode = "general";
        }
    }
    if (patch.business_process !== undefined) next.business_process = patch.business_process;
    if (patch.stage_key !== undefined) next.stage_key = patch.stage_key;
    if (patch.work_definition_key !== undefined) next.work_definition_key = patch.work_definition_key;
    if (patch.category !== undefined) next.category = patch.category;
    if (patch.priority !== undefined) next.priority = patch.priority;
    if (patch.tags !== undefined) next.tags = patch.tags;
    if (patch.waiting_on !== undefined) next.waiting_on = patch.waiting_on;
    if (patch.checklist_items !== undefined) next.checklist_items = patch.checklist_items;
    if (patch.recurrence !== undefined) next.recurrence = patch.recurrence;
    if (patch.follow_on !== undefined) next.follow_on = patch.follow_on;
    if (patch.bos_explanations !== undefined) next.bos_explanations = patch.bos_explanations;
    if (patch.status !== undefined) next.status = patch.status;

    return next;
}

export function setWorkItemDraftIntentText(draft: WorkItemDraftV1, intentText: string): WorkItemDraftV1 {
    if (draft.intent_text.trim()) return draft;
    return { ...draft, intent_text: intentText.trim() };
}

export function markWorkItemDraftCommitted(draft: WorkItemDraftV1): WorkItemDraftV1 {
    return { ...draft, status: "committed" };
}

export function markWorkItemDraftCancelled(draft: WorkItemDraftV1): WorkItemDraftV1 {
    return { ...draft, status: "cancelled" };
}

export function applyValidationToWorkItemDraft(
    draft: WorkItemDraftV1,
    issues: ValidationIssueV1[],
): WorkItemDraftV1 {
    if (draft.status === "committed" || draft.status === "cancelled") {
        return draft;
    }

    const blocking = issues.filter((i) => i.severity === "block");
    const status: WorkItemDraftStatus = blocking.length > 0 ? "needs_clarification" : "ready";

    return {
        ...draft,
        status,
        validation_errors: issues.length > 0 ? issues : undefined,
    };
}
