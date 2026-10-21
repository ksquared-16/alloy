/**
 * BP V2 S7 — THE WORK ITEMS LINE ON A /workspace PROCESS TILE.
 *
 * Explicit Work Items (`operational_tasks`) attributed to the tile's process through the one attribution a
 * task carries (`metadata.department_id`), counted by the server under the actor's department and site
 * scope (`GET /api/admin/operational-tasks?scope=workspace&summary=by_department`). The rule is the Work
 * Items product's own: open = `status='open'`; overdue = open with `due_at` before now. Overdue is a SUBSET
 * of open, never a second population.
 *
 * What it is not: Work View population (records matching a view), domain attention (records needing
 * review), or virtual Work Items (Communications / Processing rows the Work Items surface merges in the
 * client, which carry no due commitment). Those stay where they are and are never added here.
 *
 * States, so a tile never shows a false zero:
 *   ok                — counted; open may be 0 ("No open tasks"), which is a real answer;
 *   shared_department — two processes share this department, so a task cannot be attributed to one;
 *   unavailable       — the read failed or timed out.
 * A department the server did not answer for (outside the actor's access) gets NO line at all.
 */

export type LandingWorkItems =
    | { state: "ok"; open: number; overdue: number }
    | { state: "shared_department" }
    | { state: "unavailable" };

export type DepartmentWorkItemsResponse = {
    ok?: boolean;
    by_department?: Record<string, { open?: number; overdue?: number }>;
};

type CardLike = { id: string; departmentId: string; workItems?: LandingWorkItems | null };
/** A card after the Work Items pass: it always carries the field (null = no line). */
export type WithLandingWorkItems<T> = T & { workItems: LandingWorkItems | null };

/** Apply the server's answer to the cards. `response` null = the read failed or timed out. */
export function applyLandingWorkItems<T extends CardLike>(cards: readonly T[], response: DepartmentWorkItemsResponse | null): WithLandingWorkItems<T>[] {
    const perDepartment = new Map<string, number>();
    for (const c of cards) if (c.departmentId) perDepartment.set(c.departmentId, (perDepartment.get(c.departmentId) ?? 0) + 1);
    return cards.map((card): WithLandingWorkItems<T> => {
        if (!card.departmentId) return { ...card, workItems: null };
        if ((perDepartment.get(card.departmentId) ?? 0) > 1) return { ...card, workItems: { state: "shared_department" } };
        if (!response || response.ok !== true) return { ...card, workItems: { state: "unavailable" } };
        const counts = response.by_department?.[card.departmentId];
        if (!counts) return { ...card, workItems: null };
        const open = Number(counts.open ?? 0);
        const overdue = Number(counts.overdue ?? 0);
        if (!Number.isFinite(open) || !Number.isFinite(overdue) || overdue > open) return { ...card, workItems: { state: "unavailable" } };
        return { ...card, workItems: { state: "ok", open, overdue } };
    });
}

/** One request for every tile's department. */
export async function fetchLandingWorkItems<T extends CardLike>(
    cards: readonly T[],
    init: RequestInit,
    selectedSiteId: string | null | undefined,
    fetchImpl: typeof fetch = fetch,
): Promise<WithLandingWorkItems<T>[]> {
    const departmentIds = [...new Set(cards.map((c) => c.departmentId).filter(Boolean))];
    if (!departmentIds.length) return cards.map((c) => ({ ...c, workItems: null }));
    const params = new URLSearchParams({ scope: "workspace", summary: "by_department", department_ids: departmentIds.join(",") });
    const site = (selectedSiteId ?? "").trim();
    if (site) params.set("workspace_site_id", site);
    try {
        const res = await fetchImpl(`/api/admin/operational-tasks?${params.toString()}`, init);
        const json = (res.ok ? await res.json() : null) as DepartmentWorkItemsResponse | null;
        return applyLandingWorkItems(cards, json);
    } catch {
        return applyLandingWorkItems(cards, null);
    }
}

/** The tile's sentence. Informational only: the Work Items surface takes no process filter to link to. */
export function landingWorkItemsText(w: LandingWorkItems): string {
    if (w.state === "unavailable") return "Work items unavailable";
    if (w.state === "shared_department") return "Work items shared with another process";
    if (w.open === 0) return "No open work items";
    const open = `${w.open} open work item${w.open === 1 ? "" : "s"}`;
    return w.overdue > 0 ? `${open} · ${w.overdue} overdue` : open;
}
