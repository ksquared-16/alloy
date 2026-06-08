import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export async function fetchActionIntakeSpec(input: {
    action_key: "create_lead";
    department_id: string;
    stage_key?: string | null;
    process_id?: string | null;
}): Promise<ActionIntakeSpec> {
    const params = new URLSearchParams({
        action_key: input.action_key,
        department_id: input.department_id,
        stage_key: input.stage_key?.trim() || "lead",
    });
    if (input.process_id?.trim()) params.set("process_id", input.process_id.trim());

    const res = await fetch(
        `/api/admin/lifecycle/action-intake-spec?${params.toString()}`,
        workspaceDataFetchInit()
    );
    const json = (await res.json().catch(() => ({}))) as { spec?: ActionIntakeSpec; error?: string };
    if (!res.ok || !json.spec) {
        throw new Error(json.error ?? "Failed to load action intake requirements");
    }
    return json.spec;
}
