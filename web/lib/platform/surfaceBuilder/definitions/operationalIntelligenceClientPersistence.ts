/**
 * Client persistence adapter for the Operational Intelligence surface.
 *
 * Talks to the real surface doc endpoint (GET load / PUT publish), which maps the
 * SurfaceDoc to live metric_placements. No fake save: a failed request throws so the
 * builder surfaces it rather than silently "succeeding".
 */

import type { SurfaceDoc, SurfacePersistenceAdapter } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

const ENDPOINT = "/api/admin/analytics/surfaces/operational-intelligence/doc";

export function createOperationalIntelligencePersistence(): SurfacePersistenceAdapter {
    return {
        load: async (): Promise<SurfaceDoc> => {
            const res = await fetch(ENDPOINT, { method: "GET", cache: "no-store" });
            if (!res.ok) throw new Error(`Failed to load Operational Intelligence surface (${res.status})`);
            const json = (await res.json()) as { doc?: SurfaceDoc };
            return json.doc ?? { sections: [] };
        },
        persist: async (doc: SurfaceDoc): Promise<void> => {
            const res = await fetch(ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ doc }),
            });
            if (!res.ok) throw new Error(`Failed to publish Operational Intelligence surface (${res.status})`);
        },
    };
}
