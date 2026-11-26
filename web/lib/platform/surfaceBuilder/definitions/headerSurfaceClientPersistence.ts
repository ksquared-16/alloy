/**
 * Client persistence adapter for the Workspace Header surface. Talks to the header doc endpoint,
 * which maps the SurfaceDoc to metric_placements. (The Work Unit Header no longer uses this path —
 * it is owned by the published `entity_layouts` `work_unit_header` layout via `resolveSurfaceVariant`.)
 */

import type { SurfaceDoc, SurfacePersistenceAdapter } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

export function createHeaderSurfacePersistence(surface: "workspace_header"): SurfacePersistenceAdapter {
    const endpoint = `/api/admin/analytics/surfaces/${surface}/doc`;
    return {
        load: async (): Promise<SurfaceDoc> => {
            const res = await fetch(endpoint, { method: "GET", cache: "no-store" });
            if (!res.ok) throw new Error(`Failed to load ${surface} (${res.status})`);
            const json = (await res.json()) as { doc?: SurfaceDoc };
            return json.doc ?? { sections: [] };
        },
        persist: async (doc: SurfaceDoc): Promise<void> => {
            const res = await fetch(endpoint, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ doc }),
            });
            if (!res.ok) throw new Error(`Failed to publish ${surface} (${res.status})`);
        },
    };
}
