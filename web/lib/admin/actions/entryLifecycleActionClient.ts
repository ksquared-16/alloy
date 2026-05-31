import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";

export type ExecuteEntryLifecycleActionBody = {
    action_key: string;
    entity_type?: string;
    entity_id?: string;
    context?: {
        surface?: string;
        department_id?: string | null;
        work_unit_id?: string | null;
        section_key?: string | null;
    };
    payload?: Record<string, unknown>;
};

export async function postAdminActionExecute(body: ExecuteEntryLifecycleActionBody): Promise<{
    ok: boolean;
    error?: string;
    execution_result?: Record<string, unknown> & { opportunity_id?: string };
}> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        execution_result?: Record<string, unknown> & { opportunity_id?: string };
    };
    if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Action failed");
    }
    return { ok: true, execution_result: json.execution_result, error: json.error };
}

export async function executeCreateLeadFromModal(input: {
    payload: { first_name: string; last_name: string; email: string; phone: string };
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string;
}): Promise<string> {
    const result = await postAdminActionExecute({
        action_key: "create_lead",
        entity_type: "opportunity",
        entity_id: CREATE_LEAD_ACTION_ENTITY_ID,
        context: {
            surface: input.surface ?? "right_rail",
            department_id: input.departmentId ?? null,
            work_unit_id: input.workUnitId ?? null,
        },
        payload: input.payload,
    });
    const id =
        (result.execution_result?.opportunity_id != null ? String(result.execution_result.opportunity_id) : "") ||
        (result.execution_result?.id != null ? String(result.execution_result.id) : "");
    if (!id.trim()) {
        throw new Error("Lead was created but no opportunity id was returned.");
    }
    return id.trim();
}

export async function executeMarkLostFromModal(input: {
    opportunityId: string;
    lost_reason: string;
    note?: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string;
}): Promise<void> {
    await postAdminActionExecute({
        action_key: "mark_lost",
        entity_type: "opportunity",
        entity_id: input.opportunityId,
        context: {
            surface: input.surface ?? "record_header",
            department_id: input.departmentId ?? null,
            work_unit_id: input.workUnitId ?? null,
        },
        payload: {
            lost_reason: input.lost_reason,
            ...(input.note ? { note: input.note } : {}),
            status_key: "lost",
        },
    });
}

export async function executeMoveToQualification(input: {
    opportunityId: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string;
}): Promise<void> {
    await postAdminActionExecute({
        action_key: "move_to_qualification",
        entity_type: "opportunity",
        entity_id: input.opportunityId,
        context: {
            surface: input.surface ?? "record_header",
            department_id: input.departmentId ?? null,
            work_unit_id: input.workUnitId ?? null,
        },
    });
}
