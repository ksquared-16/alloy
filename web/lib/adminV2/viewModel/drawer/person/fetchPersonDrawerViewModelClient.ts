import type { PersonDrawerViewModel, PersonDrawerViewModelSkipped } from "@/lib/adminV2/viewModel/drawer/person/types";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export function buildPersonDrawerViewModelUrl(
    personId: string,
    opts?: { openSource?: string | null; presentationEmphasis?: string | null }
): string {
    const qs = new URLSearchParams();
    const source = opts?.openSource?.trim();
    const emphasis = opts?.presentationEmphasis?.trim();
    if (source) qs.set("open_source", source);
    if (emphasis) qs.set("presentation_emphasis", emphasis);
    const q = qs.toString();
    return `/api/admin/v2/view-models/drawer/person/${encodeURIComponent(personId)}${q ? `?${q}` : ""}`;
}

export async function fetchPersonDrawerViewModelClient(
    personId: string,
    opts?: { openSource?: string | null; presentationEmphasis?: string | null; init?: RequestInit }
): Promise<
    | { ok: true; viewModel: PersonDrawerViewModel }
    | { ok: false; skipped: PersonDrawerViewModelSkipped; status: number }
    | { ok: false; error: string; status: number }
> {
    const url = buildPersonDrawerViewModelUrl(personId, opts);
    const response = await fetch(url, opts?.init ?? workspaceDataFetchInit());
    if (response.ok) {
        const viewModel = (await response.json()) as PersonDrawerViewModel;
        return { ok: true, viewModel };
    }
    const body = (await response.json().catch(() => ({}))) as PersonDrawerViewModelSkipped & {
        error?: string;
    };
    if (response.status === 422 && body.structureSettled === false) {
        return { ok: false, skipped: body, status: response.status };
    }
    return {
        ok: false,
        error: body.error ?? `person_drawer_vm_fetch_${response.status}`,
        status: response.status,
    };
}
