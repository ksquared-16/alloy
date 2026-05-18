import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export const TASK_ASSIST_PROPOSALS_URL = "/api/admin/ai/task-assist/proposals";
export const TASK_ASSIST_ENTITY_SEARCH_URL = "/api/admin/ai/task-assist/entity-search";
export const COMMUNICATION_SCHEDULED_SENDS_URL = "/api/admin/communication-scheduled-sends";
export const OPERATIONAL_TASKS_URL = "/api/admin/operational-tasks";

export function proposalsListUrl(entityId: string): string {
    return `${TASK_ASSIST_PROPOSALS_URL}?entity_type=opportunities&entity_id=${encodeURIComponent(entityId)}`;
}

export function taskAssistEntitySearchUrl(params: {
    q: string;
    entity_type?: "all" | "opportunities";
    limit?: number;
    include_customers?: boolean;
    workspace_site_id?: string | null;
}): string {
    const sp = new URLSearchParams();
    sp.set("q", params.q);
    if (params.entity_type) sp.set("entity_type", params.entity_type);
    if (params.limit != null) sp.set("limit", String(params.limit));
    if (params.include_customers === false) sp.set("include_customers", "false");
    const siteId = params.workspace_site_id?.trim();
    if (siteId) sp.set("workspace_site_id", siteId);
    return `${TASK_ASSIST_ENTITY_SEARCH_URL}?${sp.toString()}`;
}

export async function fetchTaskAssistEntitySearch(params: {
    q: string;
    entity_type?: "all" | "opportunities";
    limit?: number;
    include_customers?: boolean;
    workspace_site_id?: string | null;
}): Promise<Response> {
    return fetch(taskAssistEntitySearchUrl(params), { credentials: "include" });
}

export function scheduledSendsListUrl(entityId: string): string {
    return `${COMMUNICATION_SCHEDULED_SENDS_URL}?entity_type=opportunities&entity_id=${encodeURIComponent(entityId)}`;
}

export function operationalTasksListUrl(entityId: string): string {
    return `${OPERATIONAL_TASKS_URL}?entity_type=opportunities&entity_id=${encodeURIComponent(entityId)}`;
}

export type OperationalTaskWorkspaceFilter = "open" | "due_today" | "overdue" | "completed" | "all";

export function operationalTasksWorkspaceUrl(filter: OperationalTaskWorkspaceFilter = "open"): string {
    return `${OPERATIONAL_TASKS_URL}?scope=workspace&filter=${encodeURIComponent(filter)}`;
}

export function operationalTasksSummaryUrl(): string {
    return `${OPERATIONAL_TASKS_URL}?scope=workspace&summary=true`;
}

export async function fetchWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open"
): Promise<Response> {
    return fetch(operationalTasksWorkspaceUrl(filter), { credentials: "include" });
}

export async function fetchOperationalTasksSummary(): Promise<Response> {
    return fetch(operationalTasksSummaryUrl(), { credentials: "include" });
}

export function buildPersistProposalBody(proposal: TaskAssistSuggestionV1): { payload: TaskAssistSuggestionV1; expires_at: null } {
    return { payload: proposal, expires_at: null };
}

export type ScheduleSendCreateBody = {
    entity_type: "opportunities";
    entity_id: string;
    recipient_person_id: string;
    channel: "sms" | "email";
    subject_snapshot: string | null;
    body_snapshot: string;
    scheduled_for: string;
    source: "task_assist";
    proposal_id: string | null;
    metadata: Record<string, unknown>;
};

export function buildScheduleSendBody(params: {
    entityId: string;
    recipientPersonId: string;
    channel: "sms" | "email";
    bodySnapshot: string;
    subjectSnapshot: string | null;
    scheduledForIso: string;
    proposalId: string | null;
}): ScheduleSendCreateBody {
    return {
        entity_type: "opportunities",
        entity_id: params.entityId,
        recipient_person_id: params.recipientPersonId,
        channel: params.channel,
        subject_snapshot: params.channel === "email" ? (params.subjectSnapshot?.trim() ?? "") : null,
        body_snapshot: params.bodySnapshot.trim(),
        scheduled_for: params.scheduledForIso,
        source: "task_assist",
        proposal_id: params.proposalId,
        metadata: {},
    };
}

export type OperationalTaskCreateBody = {
    entity_type: "opportunities";
    entity_id: string;
    title: string;
    description: string | null;
    due_at: string;
    source: "task_assist" | "manual";
    proposal_id: string | null;
};

export function buildOperationalTaskBody(params: {
    entityId: string;
    title: string;
    dueAtIso: string;
    proposalId?: string | null;
    description?: string | null;
    source?: "task_assist" | "manual";
}): OperationalTaskCreateBody {
    return {
        entity_type: "opportunities",
        entity_id: params.entityId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        due_at: params.dueAtIso,
        source: params.source ?? "task_assist",
        proposal_id: params.proposalId ?? null,
    };
}

export type ScheduledSendPatchBody =
    | { status: "canceled" }
    | { scheduled_for: string; body_snapshot: string; subject_snapshot?: string | null };

export async function patchCommunicationScheduledSend(id: string, body: ScheduledSendPatchBody): Promise<Response> {
    return fetch(`${COMMUNICATION_SCHEDULED_SENDS_URL}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
    });
}

export async function processDueCommunicationScheduledSends(limit = 25): Promise<Response> {
    return fetch(`${COMMUNICATION_SCHEDULED_SENDS_URL}/process-due`, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ limit }),
    });
}

export function scheduledSendsAttentionSummaryUrl(): string {
    return `${COMMUNICATION_SCHEDULED_SENDS_URL}?scope=workspace&summary=true`;
}

export async function fetchScheduledSendsAttentionSummary(): Promise<Response> {
    return fetch(scheduledSendsAttentionSummaryUrl(), { credentials: "include" });
}

export async function readJson<T>(res: Response): Promise<T> {
    return (await res.json().catch(() => ({}))) as T;
}

export async function fetchTaskAssistProposals(entityId: string): Promise<Response> {
    return fetch(proposalsListUrl(entityId), { credentials: "include" });
}

export async function persistTaskAssistProposal(proposal: TaskAssistSuggestionV1): Promise<Response> {
    return fetch(TASK_ASSIST_PROPOSALS_URL, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(buildPersistProposalBody(proposal)),
    });
}

/** Admin API client: POST …/proposals/:id/approve (does not collide with DB helper in taskAssistProposalPersistence). */
export async function postTaskAssistProposalApprove(proposalId: string): Promise<Response> {
    return fetch(`${TASK_ASSIST_PROPOSALS_URL}/${encodeURIComponent(proposalId)}/approve`, {
        method: "POST",
        credentials: "include",
    });
}

/** Admin API client: POST …/proposals/:id/reject */
export async function postTaskAssistProposalReject(proposalId: string): Promise<Response> {
    return fetch(`${TASK_ASSIST_PROPOSALS_URL}/${encodeURIComponent(proposalId)}/reject`, {
        method: "POST",
        credentials: "include",
    });
}

export async function fetchCommunicationScheduledSends(entityId: string): Promise<Response> {
    return fetch(scheduledSendsListUrl(entityId), { credentials: "include" });
}

export async function createCommunicationScheduledSend(body: ScheduleSendCreateBody): Promise<Response> {
    return fetch(COMMUNICATION_SCHEDULED_SENDS_URL, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
    });
}

export async function cancelCommunicationScheduledSend(id: string): Promise<Response> {
    return fetch(`${COMMUNICATION_SCHEDULED_SENDS_URL}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: "canceled" }),
    });
}

export async function fetchOperationalTasks(entityId: string): Promise<Response> {
    return fetch(operationalTasksListUrl(entityId), { credentials: "include" });
}

export async function createOperationalTask(body: OperationalTaskCreateBody): Promise<Response> {
    return fetch(OPERATIONAL_TASKS_URL, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
    });
}

export async function patchOperationalTaskStatus(id: string, status: "completed" | "canceled"): Promise<Response> {
    return fetch(`${OPERATIONAL_TASKS_URL}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ status }),
    });
}

export async function patchOperationalTaskFields(
    id: string,
    fields: { title?: string; description?: string | null; due_at?: string }
): Promise<Response> {
    return fetch(`${OPERATIONAL_TASKS_URL}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(fields),
    });
}

export const ADMIN_V2_OPEN_TASKS_MODAL = "adminv2:open-tasks-modal";
