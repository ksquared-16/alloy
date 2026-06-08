import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelSkipped,
} from "@/lib/adminV2/viewModel/drawer/types";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export function buildOpportunityDrawerViewModelUrl(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined
): string {
    const qs = new URLSearchParams();
    const dept = workspaceContext?.department_id?.trim() ?? "";
    const wu = workspaceContext?.work_unit_id?.trim() ?? "";
    if (dept) qs.set("department_id", dept);
    if (wu) qs.set("work_unit_id", wu);
    const q = qs.toString();
    return `/api/admin/v2/view-models/drawer/opportunity/${encodeURIComponent(opportunityId)}${q ? `?${q}` : ""}`;
}

export async function fetchOpportunityDrawerViewModelClient(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit
): Promise<
    | { ok: true; viewModel: OpportunityDrawerViewModel }
    | { ok: false; skipped: OpportunityDrawerViewModelSkipped; status: number }
    | { ok: false; error: string; status: number }
> {
    const url = buildOpportunityDrawerViewModelUrl(opportunityId, workspaceContext);
    const response = await fetch(url, init ?? workspaceDataFetchInit());
    if (response.ok) {
        const viewModel = (await response.json()) as OpportunityDrawerViewModel;
        return { ok: true, viewModel };
    }
    const body = (await response.json().catch(() => ({}))) as OpportunityDrawerViewModelSkipped & {
        error?: string;
    };
    if (response.status === 422 && body.structureSettled === false) {
        return { ok: false, skipped: body, status: response.status };
    }
    return {
        ok: false,
        error: body.error ?? `drawer_vm_fetch_${response.status}`,
        status: response.status,
    };
}
