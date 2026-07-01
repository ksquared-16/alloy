/** Map runtime context to placement `surface_key` (configurable per surface). */
export function resolveMetricSurfaceKey(params: {
    processKey?: string | null;
    laneKey?: string | null;
    fallback?: string;
}): string {
    const process = params.processKey?.trim();
    if (process) return process;

    const lane = params.laneKey?.trim() ?? "";
    if (lane.startsWith("enrollment")) return "enrollment";

    return params.fallback?.trim() || "default";
}
