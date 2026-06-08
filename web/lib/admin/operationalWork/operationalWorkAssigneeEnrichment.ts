import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

export type OperationalWorkAssigneeFields = {
    assignee_label: string | null;
};

function emailLocalPart(email: string): string {
    const at = email.indexOf("@");
    return at > 0 ? email.slice(0, at) : email;
}

/** Attach presentation-only assignee_label from auth user emails. */
export async function enrichOperationalTasksWithAssigneeLabels<T extends OperationalTaskRow>(params: {
    supabase: SupabaseClient;
    tasks: T[];
}): Promise<Array<T & OperationalWorkAssigneeFields>> {
    const ids = [...new Set(params.tasks.map((t) => t.assigned_to_user_id?.trim()).filter(Boolean) as string[])];
    const labelByUserId = new Map<string, string>();

    await Promise.all(
        ids.map(async (userId) => {
            try {
                const { data } = await params.supabase.auth.admin.getUserById(userId);
                const email = data?.user?.email?.trim();
                if (email) labelByUserId.set(userId, emailLocalPart(email));
            } catch {
                /* user may be deleted from auth */
            }
        })
    );

    return params.tasks.map((task) => ({
        ...task,
        assignee_label: task.assigned_to_user_id ? labelByUserId.get(task.assigned_to_user_id) ?? null : null,
    }));
}
