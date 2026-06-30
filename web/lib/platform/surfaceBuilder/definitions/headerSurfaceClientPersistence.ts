/**
 * Client persistence adapter for header surfaces (workspace_header / work_unit_header).
 * Talks to the real header doc endpoint, which maps the SurfaceDoc to live
 * metric_placements (rendered by the runtime header strip). No fake save.
 */

import type { SurfaceDoc, SurfacePersistenceAdapter } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

export function createHeaderSurfacePersistence(surface: "workspace_header" | "work_unit_header"): SurfacePersistenceAdapter {
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
