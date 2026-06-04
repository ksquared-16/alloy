import type { ChildDrawerViewModel, ChildDrawerViewModelSkipped } from "@/lib/adminV2/viewModel/drawer/child/types";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export function buildChildDrawerViewModelUrl(personId: string): string {
    return `/api/admin/v2/view-models/drawer/child/${encodeURIComponent(personId)}`;
}

export async function fetchChildDrawerViewModelClient(
    personId: string,
    init?: RequestInit
): Promise<
    | { ok: true; viewModel: ChildDrawerViewModel }
    | { ok: false; skipped: ChildDrawerViewModelSkipped; status: number }
    | { ok: false; error: string; status: number }
> {
    const url = buildChildDrawerViewModelUrl(personId);
    const response = await fetch(url, init ?? workspaceDataFetchInit());
    if (response.ok) {
        const viewModel = (await response.json()) as ChildDrawerViewModel;
        return { ok: true, viewModel };
    }
    const body = (await response.json().catch(() => ({}))) as ChildDrawerViewModelSkipped & {
        error?: string;
    };
    if (response.status === 422 && body.structureSettled === false) {
        return { ok: false, skipped: body, status: response.status };
    }
    return {
        ok: false,
        error: body.error ?? `child_drawer_vm_fetch_${response.status}`,
        status: response.status,
    };
}
