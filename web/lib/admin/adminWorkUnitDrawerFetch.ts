/** Dedupe concurrent GET /api/admin/work-units/:id from drawer surfaces (queue_definition + dept). */

type WorkUnitDrawerJson = {
    department_id?: string | null;
    queue_definition?: unknown;
};

const inflightJson = new Map<string, Promise<WorkUnitDrawerJson>>();

export function fetchAdminWorkUnitDrawerJson(workUnitId: string): Promise<WorkUnitDrawerJson> {
    const wuid = String(workUnitId ?? "").trim();
    if (!wuid) return Promise.resolve({});

    let p = inflightJson.get(wuid);
    if (p) return p;

    p = fetch(`/api/admin/work-units/${encodeURIComponent(wuid)}`, { credentials: "include" })
        .then(async (res) => {
            const json = (await res.json().catch(() => ({}))) as WorkUnitDrawerJson;
            if (!res.ok) {
                throw new Error(typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : "work_unit_failed");
            }
            return json;
        })
        .finally(() => inflightJson.delete(wuid));

    inflightJson.set(wuid, p);
    return p;
}
